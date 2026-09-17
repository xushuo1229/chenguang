'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const extractionService = require('../src/services/knowledgeExtractionService');
const courseSpaceModel = require('../src/db/courseSpaceModel');
const extractionModel = require('../src/db/knowledgeExtractionModel');

function fakeProvider(payload) {
  let calls = 0;
  return {
    PROMPT_VERSION: 'test-v1',
    async extract() {
      calls += 1;
      if (payload instanceof Error) throw payload;
      return { payload };
    },
    calls: () => calls,
  };
}

async function prepareUser(email) {
  await authService.register({ email, password: 'Password123' });
  const userId = authService.login({ email, password: 'Password123' }).then((r) => r.user.id);
  return userId;
}

async function prepareDocument(email) {
  const userId = await prepareUser(email);
  await syncService.saveData(userId, { courses: [{ id: 'course-1', name: '数据结构与算法' }] });
  const document = await courseSpaceService.createDocument({
    userId,
    body: {
      courseId: 'course-1',
      title: 'Lecture 01',
      content: 'A closure keeps access to its outer scope.',
      version: 1,
    },
  });
  return { userId, document };
}

describe('knowledge extraction pipeline', () => {
  test('creates candidates and only user acceptance materializes a knowledge node', async () => {
    const { userId, document } = await prepareDocument('extract-owner@example.com');
    const provider = fakeProvider({
      candidates: [{
        type: 'definition',
        title: 'Closure',
        content: 'A function bundled with its outer scope.',
        confidence: 0.86,
        evidence: { locator: 'section 1.2', excerpt: 'A closure keeps access to its outer scope.' },
      }],
    });
    const job = await extractionService.createJob({
      userId,
      body: { courseId: 'course-1', documentId: document.id },
      provider,
    });
    assert.equal(job.status, 'completed');
    assert.equal(job.documentVersion, 1);
    assert.equal(job.contentHash.length, 64);

    const candidates = await extractionService.listCandidates({ userId, query: { jobId: job.id } });
    assert.equal(candidates.candidates.length, 1);
    const candidate = candidates.candidates[0];
    assert.equal(candidate.status, 'pending');
    assert.equal(candidate.type, 'definition');
    assert.equal(candidate.confidence, 0.86);

    let nodes = await courseSpaceModel.listNodes(userId, 'course-1');
    assert.equal(nodes.length, 0);
    const evidence = await extractionService.listCandidateEvidence({ userId, candidateId: candidate.id });
    assert.equal(evidence.evidence[0].nodeId, '');
    assert.equal(evidence.evidence[0].verificationStatus, 'verified');
    assert.equal(evidence.evidence[0].locator, 'section 1.2');
    assert.equal(evidence.evidence[0].version, 1);

    const accepted = await extractionService.reviewCandidate({
      userId,
      candidateId: candidate.id,
      body: { action: 'accept', title: 'Closure (reviewed)', content: 'Reviewed closure definition.' },
    });
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.title, 'Closure (reviewed)');
    assert.equal(accepted.originalTitle, 'Closure');

    nodes = await courseSpaceModel.listNodes(userId, 'course-1');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].source_candidate_id, candidate.id);
    const linkedEvidence = await extractionService.listCandidateEvidence({ userId, candidateId: candidate.id });
    assert.equal(linkedEvidence.evidence[0].nodeId, nodes[0].id);

    await assert.rejects(
      () => extractionService.reviewCandidate({
        userId,
        candidateId: candidate.id,
        body: { action: 'accept', title: 'Second', content: 'Second acceptance.' },
      }),
      /知识候选已经审核/,
    );
    const claimedNode = {
      id: 'duplicate-node',
      user_id: userId,
      course_id: candidate.courseId,
      title: 'Duplicate',
      kind: 'definition',
      definition: 'Duplicate acceptance.',
      status: 'validated',
      confidence: 'high',
      version: 1,
      source_candidate_id: candidate.id,
    };
    await assert.rejects(async () => extractionModel.materializeAcceptedCandidate(claimedNode), /CANDIDATE_REVIEWED/);
    assert.equal((await courseSpaceModel.listNodes(userId, 'course-1')).length, 1);
  });

  test('is idempotent for the same document version and content', async () => {
    const { userId, document } = await prepareDocument('extract-idempotent@example.com');
    const provider = fakeProvider({ candidates: [] });
    await extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider });
    await extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider });
    assert.equal(provider.calls(), 1);
  });

  test('keeps cross-user and cross-course boundaries', async () => {
    const { userId, document } = await prepareDocument('extract-isolation@example.com');
    const provider = fakeProvider({ candidates: [] });
    const job = await extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider });
    const otherUserId = await prepareUser('extract-other@example.com');

    await assert.rejects(
      () => extractionService.createJob({ userId: otherUserId, body: { courseId: 'course-1', documentId: document.id }, provider }),
      /课程不存在/,
    );
    await assert.rejects(
      () => extractionService.reviewCandidate({ userId: otherUserId, candidateId: 'missing', body: { action: 'reject' } }),
      /知识候选不存在/,
    );
    const candidates = await extractionService.listCandidates({ userId: otherUserId, query: { jobId: job.id } });
    assert.equal(candidates.candidates.length, 0);
  });

  test('rejects oversized documents without calling the provider', async () => {
    const { userId } = await prepareDocument('extract-large@example.com');
    await syncService.saveData(userId, { courses: [{ id: 'course-1', name: '数据结构与算法' }] });
    const document = await courseSpaceService.createDocument({
      userId,
      body: { courseId: 'course-1', title: 'Large', content: 'x'.repeat(20001) },
    });
    const provider = fakeProvider({ candidates: [] });
    await assert.rejects(
      () => extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider }),
      /文档内容超过提取上限/,
    );
    assert.equal(provider.calls(), 0);
  });

  test('fails safely on malformed, over-limit, or leaked provider output', async () => {
    const invalidPayloads = [
      null,
      { candidates: 'not-array' },
      { candidates: [{ type: 'made-up', title: 'Bad', content: 'Bad', confidence: 0.5, evidence: { locator: '', excerpt: 'Bad' } }] },
      { candidates: [{ type: 'concept', title: 'Bad', content: 'Bad', confidence: 1.5, evidence: { locator: '', excerpt: 'Bad' } }] },
      { candidates: [{ type: 'concept', title: 'Bad', content: 'Bad', confidence: null, evidence: { locator: '', excerpt: 'Bad' } }] },
      { candidates: [{ type: 'concept', title: 'Bad', content: 'Bad', confidence: '0.5', evidence: { locator: '', excerpt: 'Bad' } }] },
      { candidates: [{ type: 'concept', title: 'Bad', content: 'Bad', evidence: { locator: '', excerpt: 'Bad' } }] },
      { candidates: Array.from({ length: 11 }, () => ({ type: 'concept', title: 'Bad', content: 'Bad', confidence: 0.5, evidence: { locator: '', excerpt: 'Bad' } })) },
    ];
    for (let index = 0; index < invalidPayloads.length; index += 1) {
      const { userId, document } = await prepareDocument(`extract-invalid-${index}@example.com`);
      const provider = fakeProvider(invalidPayloads[index]);
      await assert.rejects(
        () => extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider }),
        /AI 提取结果不可用|超出上限/,
      );
      const jobs = await extractionService.listJobs({ userId, query: {} });
      assert.equal(jobs.jobs[0].status, 'failed');
      assert.equal(jobs.jobs[0].error, 'AI_INVALID_RESPONSE');
    }

    const { userId, document } = await prepareDocument('extract-leak@example.com');
    const provider = fakeProvider(new Error('upstream failed with API_KEY=sk-secret'));
    await assert.rejects(
      () => extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider }),
      /AI 提取服务暂时不可用/,
    );
    const jobs = await extractionService.listJobs({ userId, query: {} });
    assert.equal(jobs.jobs[0].status, 'failed');
    assert.equal(jobs.jobs[0].error, 'AI_EXTRACTION_FAILED');
    assert.ok(!JSON.stringify(jobs).includes('sk-secret'));
  });

  test('marks quotes outside the source as unverified', async () => {
    const { userId, document } = await prepareDocument('extract-unverified@example.com');
    const provider = fakeProvider({
      candidates: [{
        type: 'concept',
        title: 'Unverified',
        content: 'Not present in the source.',
        confidence: 0.4,
        evidence: { locator: 'section 9.9', excerpt: 'This sentence is not in the source.' },
      }],
    });
    await extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider });
    const candidates = await extractionService.listCandidates({ userId, query: { jobId: (await extractionService.listJobs({ userId, query: {} })).jobs[0].id } });
    const evidence = await extractionService.listCandidateEvidence({ userId, candidateId: candidates.candidates[0].id });
    assert.equal(evidence.evidence[0].verificationStatus, 'unverified');
  });

  test('persists candidates, evidence, and job state atomically', async () => {
    const { userId, document } = await prepareDocument('extract-atomic@example.com');
    const provider = fakeProvider({ candidates: [] });
    const job = await extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider });
    const jobId = (await extractionService.listJobs({ userId, query: {} })).jobs[0].id;
    const candidate = {
      id: 'atomic-candidate',
      user_id: userId,
      course_id: 'course-1',
      document_id: document.id,
      document_version: 1,
      extraction_job_id: jobId,
      type: 'concept',
      title: 'Atomic',
      content: 'Atomic persistence.',
      confidence: 0.5,
      status: 'pending',
      original_title: 'Atomic',
      original_content: 'Atomic persistence.',
      reviewed_title: '',
      reviewed_content: '',
    };
    const evidence = {
      id: 'atomic-evidence',
      user_id: userId,
      course_id: 'course-1',
      document_id: document.id,
      node_id: '',
      candidate_id: 'atomic-candidate',
      quote: 'Atomic persistence.',
      locator: 'section 1',
      version: 1,
    };
    await assert.rejects(
      async () => extractionModel.persistExtractionOutput({ job, candidates: [candidate], evidence: [evidence] }),
      /NOT NULL constraint failed/,
    );
    assert.equal((await extractionService.listCandidates({ userId, query: { jobId } })).candidates.length, 0);
    assert.equal(await extractionModel.listEvidenceByCandidate({ userId, candidateId: 'atomic-candidate', limit: 10 }).then((rows) => rows.length), 0);
    const storedJob = await extractionService.getJob({ userId, jobId });
    assert.equal(storedJob.status, 'completed');
  });

  test('filters candidate evidence by owner and applies a database limit', async () => {
    const { userId, document } = await prepareDocument('extract-evidence@example.com');
    const provider = fakeProvider({
      candidates: [{
        type: 'concept',
        title: 'Evidence',
        content: 'Evidence isolation.',
        confidence: 0.5,
        evidence: { locator: 'section 1', excerpt: 'A closure keeps access to its outer scope.' },
      }],
    });
    await extractionService.createJob({ userId, body: { courseId: 'course-1', documentId: document.id }, provider });
    const job = await extractionService.listJobs({ userId, query: {} });
    const candidates = await extractionService.listCandidates({ userId, query: { jobId: job.jobs[0].id } });
    const candidate = candidates.candidates[0];
    const otherUserId = await prepareUser('extract-evidence-other@example.com');
    const scoped = await extractionModel.listEvidenceByCandidate({ userId, candidateId: candidate.id, limit: 1 });
    const isolated = await extractionModel.listEvidenceByCandidate({ userId: otherUserId, candidateId: candidate.id, limit: 1 });
    assert.equal(scoped.length, 1);
    assert.equal(isolated.length, 0);
  });
});
