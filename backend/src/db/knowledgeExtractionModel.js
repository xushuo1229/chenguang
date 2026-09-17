'use strict';

const { query } = require('./index');

async function insertJob(job) {
  return query(
    `INSERT INTO course_space_extraction_jobs
       (id, user_id, course_id, document_id, document_version, content_hash,
        status, provider, model, prompt_version, started_at, completed_at, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [job.id, job.user_id, job.course_id, job.document_id, job.document_version,
      job.content_hash, job.status, job.provider, job.model, job.prompt_version,
      job.started_at, job.completed_at, job.error]
  );
}

async function findJobByIdempotencyKey({
  userId, documentId, documentVersion, contentHash, provider, model, promptVersion,
}) {
  const result = await query(
    `SELECT * FROM course_space_extraction_jobs
      WHERE user_id = $1 AND document_id = $2 AND document_version = $3
        AND content_hash = $4 AND provider = $5 AND model = $6 AND prompt_version = $7
        AND status IN ('queued', 'running', 'completed')
      ORDER BY created_at DESC, id LIMIT 1`,
    [userId, documentId, documentVersion, contentHash, provider, model, promptVersion]
  );
  return result.rows[0] || null;
}

async function findJob({ userId, jobId }) {
  const result = await query(
    'SELECT * FROM course_space_extraction_jobs WHERE user_id = $1 AND id = $2',
    [userId, jobId]
  );
  return result.rows[0] || null;
}

async function listJobs({ userId, courseId, limit }) {
  const result = await query(
    `SELECT * FROM course_space_extraction_jobs
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
      ORDER BY created_at DESC, id LIMIT $3`,
    [userId, courseId, limit]
  );
  return result.rows;
}

async function setJobStatus({ userId, jobId, status, startedAt, completedAt, error }) {
  return query(
    `UPDATE course_space_extraction_jobs
       SET status = $3,
           started_at = COALESCE($4, started_at),
           completed_at = COALESCE($5, completed_at),
           error = COALESCE($6, error),
           updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND id = $2`,
    [userId, jobId, status, startedAt || null, completedAt || null, error || null]
  );
}

async function insertCandidate(candidate) {
  return query(
    `INSERT INTO course_space_knowledge_candidates
       (id, user_id, course_id, document_id, document_version, extraction_job_id,
        type, title, content, confidence, status, original_title, original_content,
        reviewed_title, reviewed_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [candidate.id, candidate.user_id, candidate.course_id, candidate.document_id,
      candidate.document_version, candidate.extraction_job_id, candidate.type,
      candidate.title, candidate.content, candidate.confidence, candidate.status,
      candidate.original_title, candidate.original_content,
      candidate.reviewed_title, candidate.reviewed_content]
  );
}

async function insertEvidence(evidence) {
  return query(
    `INSERT INTO course_space_evidence
       (id, user_id, course_id, document_id, node_id, candidate_id, quote, locator, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [evidence.id, evidence.user_id, evidence.course_id, evidence.document_id,
      evidence.node_id, evidence.candidate_id, evidence.quote, evidence.locator,
      evidence.version]
  );
}

async function listCandidates({ userId, courseId, jobId, status, limit, offset }) {
  const result = await query(
    `SELECT * FROM course_space_knowledge_candidates
      WHERE user_id = $1
        AND ($2 IS NULL OR course_id = $2)
        AND ($3 IS NULL OR extraction_job_id = $3)
        AND ($4 IS NULL OR status = $4)
      ORDER BY created_at DESC, id LIMIT $5 OFFSET $6`,
    [userId, courseId, jobId, status, limit, offset]
  );
  return result.rows;
}

async function findCandidate({ userId, candidateId }) {
  const result = await query(
    `SELECT * FROM course_space_knowledge_candidates
      WHERE user_id = $1 AND id = $2`,
    [userId, candidateId]
  );
  return result.rows[0] || null;
}

async function reviewCandidate({ userId, candidateId, status, reviewedTitle, reviewedContent }) {
  return query(
    `UPDATE course_space_knowledge_candidates
       SET status = $3, reviewed_title = $4, reviewed_content = $5, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND id = $2 AND status = 'pending'`,
    [userId, candidateId, status, reviewedTitle, reviewedContent]
  );
}

async function insertNode(node) {
  return query(
    `INSERT INTO course_space_nodes
       (id, user_id, course_id, title, kind, definition, status, confidence, version, source_candidate_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [node.id, node.user_id, node.course_id, node.title, node.kind, node.definition,
      node.status, node.confidence, node.version, node.source_candidate_id]
  );
}

async function linkEvidenceToNode({ userId, candidateId, nodeId }) {
  return query(
    `UPDATE course_space_evidence
       SET node_id = $3
     WHERE user_id = $1 AND candidate_id = $2 AND node_id = ''`,
    [userId, candidateId, nodeId]
  );
}

module.exports = {
  findCandidate,
  findJob,
  findJobByIdempotencyKey,
  insertCandidate,
  insertEvidence,
  insertJob,
  insertNode,
  linkEvidenceToNode,
  listCandidates,
  listJobs,
  reviewCandidate,
  setJobStatus,
};
