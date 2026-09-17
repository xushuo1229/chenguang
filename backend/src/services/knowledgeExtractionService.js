'use strict';

const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const model = require('../db/knowledgeExtractionModel');
const courseSpaceModel = require('../db/courseSpaceModel');
const providerService = require('./knowledgeExtractionProvider');
const syncService = require('./syncService');

const JOB_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'cancelled']);
const CANDIDATE_STATUSES = new Set(['pending', 'accepted', 'rejected']);
const CANDIDATE_TYPES = new Set(['concept', 'definition', 'fact', 'procedure', 'formula', 'example', 'warning', 'summary']);
const MAX_EXTRACTION_INPUT_CHARS = 20000;
const MAX_CANDIDATES_PER_JOB = 10;
const MAX_CANDIDATE_TITLE = 200;
const MAX_CANDIDATE_CONTENT = 5000;
const MAX_EVIDENCE_EXCERPT = 2000;
const MAX_EVIDENCE_LOCATOR = 500;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('INVALID_INPUT', '数据格式不正确');
  }
  return body;
}

function requiredText(value, field, max) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw ApiError.badRequest('INVALID_INPUT', `${field}必填`);
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
}

function optionalText(value, field, max, fallback = '') {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
}

async function assertOwnedCourse(userId, courseId) {
  const text = requiredText(courseId, 'courseId', 200);
  const envelope = await syncService.getData(userId);
  const courses = envelope && envelope.data && Array.isArray(envelope.data.courses) ? envelope.data.courses : [];
  if (!courses.some((course) => course && String(course.id) === text)) {
    throw ApiError.badRequest('INVALID_COURSE', '课程不存在或不属于当前用户');
  }
  return text;
}

function toJob(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    documentId: row.document_id,
    documentVersion: row.document_version,
    contentHash: row.content_hash,
    status: row.status,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCandidate(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    documentId: row.document_id,
    documentVersion: row.document_version,
    extractionJobId: row.extraction_job_id,
    type: row.type,
    title: row.reviewed_title || row.original_title,
    content: row.reviewed_content || row.original_content,
    confidence: row.confidence,
    status: row.status,
    originalTitle: row.original_title,
    originalContent: row.original_content,
    reviewedTitle: row.reviewed_title,
    reviewedContent: row.reviewed_content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEvidence(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    documentId: row.document_id,
    candidateId: row.candidate_id,
    nodeId: row.node_id,
    quote: row.quote,
    locator: row.locator,
    verificationStatus: row.verification_status,
    version: row.version,
    createdAt: row.created_at,
  };
}

function normalizeEvidenceText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function strictConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 提取结果不可用，请稍后再试');
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

async function runJob({ userId, job, document, requestedProvider }) {
  const startedAt = new Date().toISOString();
  await model.setJobStatus({ userId, jobId: job.id, status: 'running', startedAt });
  try {
    if (document.content.length > MAX_EXTRACTION_INPUT_CHARS) {
      throw ApiError.badRequest('DOCUMENT_TOO_LARGE', '文档内容超过提取上限');
    }
    const result = await requestedProvider.extract({ document });
    const payload = result.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.candidates)) {
      throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 提取结果不可用，请稍后再试');
    }
    if (payload.candidates.length > MAX_CANDIDATES_PER_JOB) {
      throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 提取结果超出上限，请稍后再试');
    }

    const normalized = payload.candidates.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 提取结果不可用，请稍后再试');
      }
      const confidence = strictConfidence(item.confidence);
      if (!CANDIDATE_TYPES.has(String(item.type || ''))) {
        throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 提取结果不可用，请稍后再试');
      }
      const title = String(item.title || '').trim();
      const content = String(item.content || '').trim();
      const evidence = item.evidence && typeof item.evidence === 'object' ? item.evidence : {};
      if (!title || title.length > MAX_CANDIDATE_TITLE || !content || content.length > MAX_CANDIDATE_CONTENT) {
        throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 提取结果不可用，请稍后再试');
      }
      return {
        type: item.type,
        title,
        content,
        confidence,
        locator: optionalText(evidence.locator, 'evidence locator', MAX_EVIDENCE_LOCATOR),
        excerpt: requiredText(evidence.excerpt, 'evidence excerpt', MAX_EVIDENCE_EXCERPT),
      };
    });

    const candidateRows = [];
    const evidenceRows = [];
    const normalizedDocument = normalizeEvidenceText(document.content);
    for (const item of normalized) {
      const candidateId = crypto.randomUUID();
      const evidenceId = crypto.randomUUID();
      const candidate = {
        id: candidateId,
        user_id: userId,
        course_id: job.course_id,
        document_id: job.document_id,
        document_version: job.document_version,
        extraction_job_id: job.id,
        type: item.type,
        title: item.title,
        content: item.content,
        confidence: item.confidence,
        status: 'pending',
        original_title: item.title,
        original_content: item.content,
        reviewed_title: '',
        reviewed_content: '',
      };
      const normalizedQuote = normalizeEvidenceText(item.excerpt);
      const verificationStatus = normalizedQuote && normalizedDocument.includes(normalizedQuote)
        ? 'verified'
        : 'unverified';
      const evidence = {
        id: evidenceId,
        user_id: userId,
        course_id: job.course_id,
        document_id: job.document_id,
        node_id: '',
        candidate_id: candidateId,
        quote: item.excerpt,
        locator: item.locator,
        verification_status: verificationStatus,
        version: job.document_version,
      };
      candidateRows.push(candidate);
      evidenceRows.push(evidence);
    }
    model.persistExtractionOutput({ job, candidates: candidateRows, evidence: evidenceRows });
  } catch (err) {
    const code = err && err.name === 'ApiError' && err.code ? err.code : 'AI_EXTRACTION_FAILED';
    const message = err && err.name === 'ApiError' ? err.message : 'AI 提取服务暂时不可用，请稍后再试';
    await model.setJobStatus({
      userId,
      jobId: job.id,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: code,
    });
    throw new ApiError(err && err.status ? err.status : 500, code, message);
  }
  return model.findJob({ userId, jobId: job.id });
}

async function createJob({ userId, body, provider }) {
  const input = requireObject(body);
  const courseId = await assertOwnedCourse(userId, input.courseId);
  const documentId = requiredText(input.documentId, 'documentId', 100);
  const requestedProvider = provider || require('./knowledgeExtractionProvider');
  const document = await courseSpaceModel.findDocument({ userId, documentId });
  if (!document || document.course_id !== courseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '文档不存在或不属于当前课程');
  }
  const contentHash = sha256(document.content);
  const promptVersion = providerService.PROMPT_VERSION;
  if (!input.reextract) {
    const existing = await model.findJobByIdempotencyKey({
      userId,
      documentId,
      documentVersion: document.version,
      contentHash,
      provider: config_provider_name(),
      model: config_model_name(),
      promptVersion,
    });
    if (existing) return toJob(existing);
  }

  const id = crypto.randomUUID();
  const row = {
    id,
    user_id: userId,
    course_id: courseId,
    document_id: documentId,
    document_version: document.version,
    content_hash: contentHash,
    status: 'queued',
    provider: config_provider_name(),
    model: config_model_name(),
    prompt_version: promptVersion,
    started_at: '',
    completed_at: '',
    error: '',
  };
  await model.insertJob(row);
  const finished = await runJob({ userId, job: row, document, requestedProvider });
  return toJob(finished);
}

function config_provider_name() {
  return require('../config/env').aiProvider;
}

function config_model_name() {
  return require('../config/env').aiModel;
}

function boundedPage(value, field) {
  if (value == null || value === '') return field === 'limit' ? PAGE_SIZE_DEFAULT : 0;
  const numberValue = Number(value);
  const max = field === 'limit' ? PAGE_SIZE_MAX : Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > max) {
    throw ApiError.badRequest('INVALID_INPUT', `${field}不正确`);
  }
  return numberValue;
}

async function listJobs({ userId, query }) {
  const input = query || {};
  const courseId = input.courseId ? String(input.courseId).trim() : null;
  const limit = boundedPage(input.limit, 'limit');
  const rows = await model.listJobs({ userId, courseId, limit });
  return { jobs: rows.map(toJob) };
}

async function getJob({ userId, jobId }) {
  const row = await model.findJob({ userId, jobId: requiredText(jobId, 'jobId', 100) });
  if (!row) throw ApiError.notFound('JOB_NOT_FOUND', '提取任务不存在');
  return toJob(row);
}

async function cancelJob({ userId, jobId }) {
  const row = await model.findJob({ userId, jobId: requiredText(jobId, 'jobId', 100) });
  if (!row) throw ApiError.notFound('JOB_NOT_FOUND', '提取任务不存在');
  if (!['queued', 'running'].includes(row.status)) {
    throw ApiError.conflict('JOB_NOT_CANCELLABLE', '当前任务不能取消');
  }
  await model.setJobStatus({ userId, jobId: row.id, status: 'cancelled', completedAt: new Date().toISOString(), error: 'CANCELLED' });
  return getJob({ userId, jobId });
}

async function listCandidates({ userId, query }) {
  const input = query || {};
  const courseId = input.courseId ? String(input.courseId).trim() : null;
  const jobId = input.jobId ? String(input.jobId).trim() : null;
  const status = input.status ? String(input.status).trim() : null;
  if (status && !CANDIDATE_STATUSES.has(status)) throw ApiError.badRequest('INVALID_INPUT', '状态不支持');
  const limit = boundedPage(input.limit, 'limit');
  const offset = boundedPage(input.offset, 'offset');
  const rows = await model.listCandidates({ userId, courseId, jobId, status, limit, offset });
  return { candidates: rows.map(toCandidate) };
}

async function reviewCandidate({ userId, candidateId, body }) {
  const input = requireObject(body);
  const action = requiredText(input.action, 'action', 20);
  const row = await model.findCandidate({ userId, candidateId: requiredText(candidateId, 'candidateId', 100) });
  if (!row) throw ApiError.notFound('CANDIDATE_NOT_FOUND', '知识候选不存在');
  if (row.status !== 'pending') throw ApiError.conflict('CANDIDATE_REVIEWED', '知识候选已经审核');

  if (action === 'reject') {
    await model.reviewCandidate({ userId, candidateId: row.id, status: 'rejected', reviewedTitle: '', reviewedContent: '' });
    return toCandidate(await model.findCandidate({ userId, candidateId: row.id }));
  }
  if (action !== 'accept') throw ApiError.badRequest('INVALID_ACTION', '审核操作不支持');

  const title = requiredText(input.title == null ? row.original_title : input.title, 'title', MAX_CANDIDATE_TITLE);
  const content = requiredText(input.content == null ? row.original_content : input.content, 'content', MAX_CANDIDATE_CONTENT);
  const nodeId = crypto.randomUUID();
  const node = {
    id: nodeId,
    user_id: userId,
    course_id: row.course_id,
    title,
    kind: row.type,
    definition: content,
    status: 'validated',
    confidence: row.confidence >= 0.8 ? 'high' : row.confidence >= 0.5 ? 'medium' : 'low',
    version: row.document_version,
    source_candidate_id: row.id,
  };
  try {
    model.materializeAcceptedCandidate(node);
  } catch (error) {
    if (error && error.code === 'CANDIDATE_REVIEWED') {
      throw ApiError.conflict('CANDIDATE_REVIEWED', '知识候选已经审核');
    }
    throw error;
  }
  return toCandidate(await model.findCandidate({ userId, candidateId: row.id }));
}

async function listCandidateEvidence({ userId, candidateId }) {
  const row = await model.findCandidate({ userId, candidateId: requiredText(candidateId, 'candidateId', 100) });
  if (!row) throw ApiError.notFound('CANDIDATE_NOT_FOUND', '知识候选不存在');
  const result = await model.listEvidenceByCandidate({
    userId,
    candidateId: row.id,
    limit: PAGE_SIZE_MAX,
  });
  return { evidence: result.map(toEvidence) };
}

module.exports = {
  cancelJob,
  createJob,
  getJob,
  listCandidateEvidence,
  listCandidates,
  listJobs,
  reviewCandidate,
};
