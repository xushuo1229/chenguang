'use strict';

const { query } = require('./index');

function upsertProposal({
  id, userId, courseId, knowledgeNodeId, kind, status, planId, blockId, fingerprint, payload,
}) {
  return query(
    `INSERT INTO learning_action_proposals
       (id, user_id, course_id, knowledge_node_id, kind, status, plan_id, block_id, fingerprint, payload_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(user_id, fingerprint) DO UPDATE SET
       status = CASE
         WHEN learning_action_proposals.status = 'completed' THEN 'completed'
         WHEN learning_action_proposals.status = 'dismissed' THEN 'dismissed'
         ELSE excluded.status
       END,
       plan_id = excluded.plan_id,
       block_id = excluded.block_id,
       payload_json = excluded.payload_json,
       updated_at = CURRENT_TIMESTAMP`,
    [id, userId, courseId, knowledgeNodeId, kind, status, planId, blockId, fingerprint, payload],
  );
}

function findProposal({ userId, proposalId }) {
  return query(
    `SELECT id, user_id, course_id, knowledge_node_id, kind, status, plan_id, block_id,
            fingerprint, payload_json, created_at, updated_at
       FROM learning_action_proposals
      WHERE user_id = $1 AND id = $2`,
    [userId, proposalId],
  ).rows[0] || null;
}

function markStatus({ userId, proposalId, status }) {
  return query(
    `UPDATE learning_action_proposals
        SET status = $3, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND id = $2`,
    [userId, proposalId, status],
  );
}

function listProposals({ userId, courseId, status, limit, offset }) {
  return query(
    `SELECT id, user_id, course_id, knowledge_node_id, kind, status, plan_id, block_id,
            fingerprint, payload_json, created_at, updated_at
       FROM learning_action_proposals
      WHERE user_id = $1
        AND ($2 IS NULL OR course_id = $2)
        AND ($3 IS NULL OR status = $3)
      ORDER BY updated_at DESC, id
      LIMIT $4 OFFSET $5`,
    [userId, courseId, status, limit, offset],
  ).rows;
}

function countAttemptsBySource({ userId, sourceId }) {
  return query(
    `SELECT COUNT(*) AS count
       FROM student_knowledge_evidence
      WHERE user_id = $1 AND source_id = $2 AND source_type = 'assessment'`,
    [userId, sourceId],
  ).rows[0].count;
}

function listProposalsForWindow({ userId, courseId, from, limit }) {
  return query(
    `SELECT id, user_id, course_id, knowledge_node_id, kind, status, plan_id, block_id,
            fingerprint, payload_json, created_at, updated_at
       FROM learning_action_proposals
      WHERE user_id = $1 AND course_id = $2 AND updated_at >= datetime($3)
      ORDER BY updated_at ASC, id
      LIMIT $4`,
    [userId, courseId, from.toISOString(), limit],
  ).rows;
}

module.exports = {
  countAttemptsBySource,
  findProposal,
  listProposals,
  listProposalsForWindow,
  markStatus,
  upsertProposal,
};
