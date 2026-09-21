'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const effectivenessService = require('../src/services/learningEffectivenessService');
const practiceModel = require('../src/db/studentPracticeModel');
const actionModel = require('../src/db/learningActionModel');
const { query } = require('../src/db');

function request(port, path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function listen(appInstance) {
  const server = http.createServer(appInstance);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function prepareUser(email, courseId = 'course-1') {
  await authService.register({ email, password: 'Password123' });
  const userId = await authService.login({ email, password: 'Password123' }).then((result) => result.user.id);
  await syncService.saveData(userId, { courses: [{ id: courseId, name: 'JavaScript' }] });
  return { userId, courseId };
}

function iso(offsetDays) {
  return new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000).toISOString();
}

async function attempt({ userId, courseId, nodeId, score, offsetDays, mode = 'assessment', id }) {
  const attemptId = id || `${userId}:${nodeId}:${offsetDays}:${score}`;
  await practiceModel.createAttempt({
    id: attemptId,
    userId,
    courseId,
    knowledgeNodeId: nodeId,
    mode,
    score,
    durationMs: 1000,
    sourceAttemptId: attemptId,
  });
  await query('UPDATE student_practice_attempts SET created_at = $2 WHERE id = $1', [attemptId, iso(offsetDays)]);
}

async function action({
  userId, courseId, nodeId, kind, status, offsetDays, fingerprint,
}) {
  const actionId = `action-${fingerprint}`;
  await actionModel.upsertProposal({
    id: actionId,
    userId,
    courseId,
    knowledgeNodeId: nodeId,
    kind,
    status,
    planId: 'plan-1',
    blockId: fingerprint,
    fingerprint,
    payload: '{}',
  });
  await query('UPDATE learning_action_proposals SET created_at = $2, updated_at = $3 WHERE id = $1', [
    actionId,
    iso(offsetDays),
    iso(offsetDays),
  ]);
  return actionId;
}

describe('learning effectiveness', () => {
  test('returns explicit unavailable metrics without fabricating data', async () => {
    const owner = await prepareUser('effectiveness-empty@example.com');
    const result = await effectivenessService.buildEffectiveness({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { days: 30 },
    });

    assert.equal(result.version, 'learning-effectiveness-v1');
    assert.equal(result.metadata.readOnly, true);
    assert.equal(result.metadata.deterministic, true);
    for (const metric of Object.values(result.metrics)) {
      assert.equal(metric.status, 'unavailable');
      assert.equal(metric.value, null);
      assert.ok(metric.reason);
    }
  });

  test('computes deterministic effectiveness from observable records', async () => {
    const owner = await prepareUser('effectiveness-owner@example.com');
    await attempt({ userId: owner.userId, courseId: owner.courseId, nodeId: 'node-1', score: 0.4, offsetDays: 2 });
    await attempt({ userId: owner.userId, courseId: owner.courseId, nodeId: 'node-1', score: 0.8, offsetDays: 1 });
    await attempt({ userId: owner.userId, courseId: owner.courseId, nodeId: 'node-2', score: 0.2, offsetDays: 1 });
    await attempt({ userId: owner.userId, courseId: owner.courseId, nodeId: 'node-2', score: 0.3, offsetDays: 0 });
    await action({
      userId: owner.userId, courseId: owner.courseId, nodeId: 'node-1', kind: 'assessment',
      status: 'completed', offsetDays: 2, fingerprint: 'assessment-completed',
    });
    await action({
      userId: owner.userId, courseId: owner.courseId, nodeId: 'node-2', kind: 'assessment',
      status: 'proposed', offsetDays: 1, fingerprint: 'assessment-proposed',
    });
    await action({
      userId: owner.userId, courseId: owner.courseId, nodeId: 'node-1', kind: 'review',
      status: 'completed', offsetDays: 1.5, fingerprint: 'review-completed',
    });
    await action({
      userId: owner.userId, courseId: owner.courseId, nodeId: 'node-2', kind: 'review',
      status: 'dismissed', offsetDays: 1, fingerprint: 'review-dismissed',
    });

    const result = await effectivenessService.buildEffectiveness({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { days: 30 },
    });
    const metrics = result.metrics;

    assert.equal(metrics.practiceCompletionRate.status, 'available');
    assert.equal(metrics.practiceCompletionRate.value, 0.5);
    assert.equal(metrics.assessmentAccuracy.value, 0.425);
    assert.equal(metrics.repeatedErrorRate.value, 0.5);
    assert.equal(metrics.masteryImprovement.value, 0.25);
    assert.equal(metrics.reviewCompletionRate.value, 1);
    assert.equal(metrics.postReviewImprovement.value, 0.4);
    assert.equal(metrics.learningContinuity.value, 0.1);
    assert.equal(result.metadata.derivedFrom.includes('student_practice_attempts'), true);
  });

  test('keeps single-attempt comparisons unavailable without inventing a baseline', async () => {
    const owner = await prepareUser('effectiveness-single@example.com');
    await attempt({ userId: owner.userId, courseId: owner.courseId, nodeId: 'node-1', score: 0.9, offsetDays: 0 });
    const result = await effectivenessService.buildEffectiveness({
      userId: owner.userId, courseId: owner.courseId, query: {},
    });

    assert.equal(result.metrics.assessmentAccuracy.status, 'available');
    assert.equal(result.metrics.assessmentAccuracy.value, 0.9);
    assert.equal(result.metrics.repeatedErrorRate.status, 'unavailable');
    assert.equal(result.metrics.masteryImprovement.status, 'unavailable');
    assert.equal(result.metrics.postReviewImprovement.status, 'unavailable');
    assert.equal(result.metrics.learningContinuity.status, 'available');
  });

  test('respects course, user and time-window boundaries', async () => {
    const owner = await prepareUser('effectiveness-isolation@example.com', 'owner-course');
    await prepareUser('effectiveness-foreign@example.com', 'owner-course');
    await attempt({ userId: owner.userId, courseId: 'foreign-course', nodeId: 'other-node', score: 1, offsetDays: 0 });
    await attempt({ userId: owner.userId, courseId: owner.courseId, nodeId: 'old-node', score: 1, offsetDays: 366 });
    await attempt({ userId: owner.userId, courseId: owner.courseId, nodeId: 'new-node', score: 0.6, offsetDays: 1 });

    await assert.rejects(() => effectivenessService.buildEffectiveness({
      userId: 999999,
      courseId: owner.courseId,
    }), (error) => error.code === 'INVALID_COURSE');
    await assert.rejects(() => effectivenessService.buildEffectiveness({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { days: 366 },
    }), (error) => error.code === 'INVALID_INPUT');

    const result = await effectivenessService.buildEffectiveness({
      userId: owner.userId, courseId: owner.courseId, query: { days: 30 },
    });
    assert.equal(result.metrics.assessmentAccuracy.value, 0.6);
    assert.equal(result.metrics.assessmentAccuracy.assessmentCount, 1);
  });

  test('exposes a bounded authenticated read-only API', async () => {
    const owner = await prepareUser('effectiveness-api@example.com', 'api-course');
    await attempt({ userId: owner.userId, courseId: owner.courseId, nodeId: 'api-node', score: 0.7, offsetDays: 0 });
    const token = await authService.login({ email: 'effectiveness-api@example.com', password: 'Password123' }).then((r) => r.token);
    const headers = { authorization: `Bearer ${token}` };
    const { server, port } = await listen(app);
    try {
      const anonymous = await request(port, `/api/learning/effectiveness/${owner.courseId}`, {});
      assert.equal(anonymous.status, 401);
      const response = await request(port, `/api/learning/effectiveness/${owner.courseId}?days=30`, headers);
      assert.equal(response.status, 200);
      assert.equal(response.body.data.version, 'learning-effectiveness-v1');
      assert.equal(response.body.data.metrics.assessmentAccuracy.value, 0.7);
      const invalid = await request(port, `/api/learning/effectiveness/${owner.courseId}?days=366`, headers);
      assert.equal(invalid.status, 400);
    } finally {
      server.close();
    }
  });
});
