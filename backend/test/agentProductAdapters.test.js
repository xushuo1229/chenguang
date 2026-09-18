'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const stateService = require('../src/services/studentKnowledgeStateService');
const syncDataAdapter = require('../src/services/agentAdapters/syncDataAdapter');
const behaviorAdapter = require('../src/services/agentAdapters/behaviorAdapter');
const courseKnowledgeAdapter = require('../src/services/agentAdapters/courseKnowledgeAdapter');
const knowledgeStateAdapter = require('../src/services/agentAdapters/knowledgeStateAdapter');
const growthMemoryAdapter = require('../src/services/agentAdapters/growthMemoryAdapter');
const reflectionAdapter = require('../src/services/agentAdapters/reflectionAdapter');
const agentHomeService = require('../src/services/agentHomeService');

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function register(email) {
  await authService.register({ email, password: 'Password123' });
  return authService.login({ email, password: 'Password123' }).then((result) => result.user.id);
}

async function prepareOwner(email) {
  const userId = await register(email);
  await syncService.saveData(userId, {
    courses: [{ id: 'course-1', name: 'JavaScript' }],
    todos: [{ id: 'todo-1', title: 'Read chapter', date: localToday(), done: true }],
    focus: [{ id: 'focus-1', date: localToday(), minutes: 45 }],
    user: {
      memory: {
        patterns: [{
          id: 'pattern-1',
          type: 'Habit',
          content: 'Morning study is stable',
          status: 'active',
          confidence: 0.8,
          updatedAt: localToday(),
        }],
      },
    },
  });
  const document = await courseSpaceService.createDocument({
    userId,
    body: { courseId: 'course-1', title: 'Lecture 01', content: 'Promise basics.' },
  });
  const node = await courseSpaceService.createNode({
    userId,
    body: {
      courseId: 'course-1',
      title: 'Promise',
      kind: 'concept',
      definition: 'A Promise represents an eventual value.',
      confidence: 'medium',
    },
  });
  await courseSpaceService.createEvidence({
    userId,
    body: {
      courseId: 'course-1',
      documentId: document.id,
      nodeId: node.id,
      quote: 'A Promise represents an eventual value.',
      locator: 'page 1',
    },
  });
  await stateService.recordEvidence({
    userId,
    courseId: 'course-1',
    knowledgeNodeId: node.id,
    sourceType: 'assessment',
    sourceId: 'assessment-1',
    evidenceData: { score: 0.25 },
  });
  return { userId, document, node };
}

describe('agent product adapters', () => {
  test('exposes bounded authority-tagged adapter contracts', async () => {
    const owner = await prepareOwner('agent-adapter-owner@example.com');
    const snapshot = await syncDataAdapter.buildSyncSnapshot({ userId: owner.userId });
    const behavior = behaviorAdapter.buildBehaviorSummary({ snapshot });
    const courseKnowledge = await courseKnowledgeAdapter.buildCourseKnowledge({ userId: owner.userId });
    const knowledgeState = await knowledgeStateAdapter.buildKnowledgeStateSummary({ userId: owner.userId });
    const growthMemory = growthMemoryAdapter.buildGrowthMemoryProjection({ snapshot });
    const reflection = reflectionAdapter.buildReflectionSummary();

    for (const adapter of [snapshot, behavior, courseKnowledge, knowledgeState, growthMemory, reflection]) {
      assert.equal(adapter.version, 'adapter-v1');
      assert.equal(adapter.readOnly, true);
      assert.ok(adapter.source);
      assert.ok(adapter.authority);
      assert.ok(adapter.type);
      assert.ok(adapter.confidence >= 0 && adapter.confidence <= 1);
    }

    assert.equal(behavior.source, 'sync.activity');
    assert.equal(behavior.authority, 'deterministic_projection');
    assert.equal(behavior.type, 'behavior_summary');
    assert.equal(behavior.data.taskSummary.completed, 1);
    assert.equal(behavior.data.courses[0].courseId, 'course-1');

    assert.equal(courseKnowledge.source, 'course_space');
    assert.equal(courseKnowledge.authority, 'source');
    assert.equal(courseKnowledge.data.nodes[0].knowledgeNodeId, owner.node.id);
    assert.equal(courseKnowledge.data.evidence[0].nodeId, owner.node.id);

    assert.equal(knowledgeState.authority, 'source');
    assert.equal(knowledgeState.data.weakTopics[0].knowledgeNodeId, owner.node.id);

    assert.equal(growthMemory.source, 'cgstore.user.memory');
    assert.equal(growthMemory.authority, 'derived_memory');
    assert.equal(growthMemory.type, 'growth_memory_projection');
    assert.equal(growthMemory.data.items[0].id, 'pattern-1');

    assert.equal(reflection.authority, 'unavailable');
    assert.equal(reflection.data.available, false);
    assert.equal(
      reflection.data.reason,
      'reflection_storage_adapter_not_available',
    );
  });

  test('keeps adapter data user-isolated', async () => {
    const owner = await prepareOwner('agent-adapter-isolation-owner@example.com');
    const other = await register('agent-adapter-isolation-other@example.com');
    await syncService.saveData(other, {
      courses: [{ id: 'course-other', name: 'Other Course' }],
    });

    const otherSnapshot = await syncDataAdapter.buildSyncSnapshot({ userId: other });
    const otherBehavior = behaviorAdapter.buildBehaviorSummary({ snapshot: otherSnapshot });
    const otherCourse = await courseKnowledgeAdapter.buildCourseKnowledge({ userId: other });
    const otherState = await knowledgeStateAdapter.buildKnowledgeStateSummary({ userId: other });

    assert.equal(otherBehavior.data.courses[0].courseId, 'course-other');
    assert.equal(otherCourse.data.nodes.length, 0);
    assert.equal(otherCourse.data.evidence.length, 0);
    assert.equal(otherState.data.weakTopics.length, 0);
    assert.notEqual(otherBehavior.data.courses[0].courseId, 'course-1');
    assert.notEqual(otherCourse.data.nodes.some((node) => node.knowledgeNodeId === owner.node.id), true);
  });

  test('returns empty states without inventing data', async () => {
    const userId = await register('agent-adapter-empty@example.com');
    const snapshot = await syncDataAdapter.buildSyncSnapshot({ userId });
    const behavior = behaviorAdapter.buildBehaviorSummary({ snapshot });
    const courseKnowledge = await courseKnowledgeAdapter.buildCourseKnowledge({ userId });
    const knowledgeState = await knowledgeStateAdapter.buildKnowledgeStateSummary({ userId });
    const growthMemory = growthMemoryAdapter.buildGrowthMemoryProjection({ snapshot });

    assert.equal(behavior.data.taskSummary.total, 0);
    assert.equal(behavior.data.courses.length, 0);
    assert.equal(courseKnowledge.data.nodes.length, 0);
    assert.equal(courseKnowledge.data.evidence.length, 0);
    assert.equal(knowledgeState.data.weakTopics.length, 0);
    assert.equal(growthMemory.data.available, false);
    assert.deepEqual(growthMemory.data.items, []);
  });

  test('bounds course knowledge and evidence output', async () => {
    const userId = await register('agent-adapter-bounded@example.com');
    await syncService.saveData(userId, {
      courses: [{ id: 'course-1', name: 'Bounded Course' }],
    });
    const document = await courseSpaceService.createDocument({
      userId,
      body: { courseId: 'course-1', title: 'Lecture' },
    });
    for (let index = 0; index < 12; index += 1) {
      const node = await courseSpaceService.createNode({
        userId,
        body: {
          courseId: 'course-1',
          title: `Node ${index}`,
          kind: 'concept',
        },
      });
      await courseSpaceService.createEvidence({
        userId,
        body: {
          courseId: 'course-1',
          documentId: document.id,
          nodeId: node.id,
          quote: `Evidence ${index}`,
        },
      });
    }

    const courseKnowledge = await courseKnowledgeAdapter.buildCourseKnowledge({ userId });
    assert.equal(courseKnowledge.data.nodes.length, 10);
    assert.equal(courseKnowledge.data.evidence.length, 10);
  });

  test('keeps composed context read-only with no write permissions', async () => {
    const owner = await prepareOwner('agent-adapter-context@example.com');
    const context = await agentHomeService.buildAgentHomeContext({ userId: owner.userId });

    assert.equal(context.readOnly, true);
    assert.deepEqual(context.permissions.write, []);
    assert.equal(context.behavior.source, 'sync.activity');
    assert.equal(context.courseKnowledge.source, 'course_space');
    assert.equal(context.courseKnowledge.value.evidence.length, 1);
    assert.equal(context.reflections.value.available, false);
    assert.equal(context.memories.growth.authority, 'derived_memory');
    assert.equal(context.memories.coach.value.available, false);
  });

  test('rejects adapter calls without a positive user id', async () => {
    await assert.rejects(
      () => syncDataAdapter.buildSyncSnapshot({ userId: 0 }),
      /UNAUTHORIZED/,
    );
    await assert.rejects(
      () => courseKnowledgeAdapter.buildCourseKnowledge({ userId: -1 }),
      /UNAUTHORIZED/,
    );
    await assert.rejects(
      () => knowledgeStateAdapter.buildKnowledgeStateSummary({ userId: 1.2 }),
      /UNAUTHORIZED/,
    );
    assert.throws(
      () => behaviorAdapter.buildBehaviorSummary({ snapshot: null }),
      /INVALID_ADAPTER_INPUT/,
    );
    assert.throws(
      () => growthMemoryAdapter.buildGrowthMemoryProjection({ snapshot: null }),
      /INVALID_ADAPTER_INPUT/,
    );
  });
});
