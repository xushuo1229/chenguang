'use strict';

const { query } = require('./index');

function createAttempt({ id, userId, courseId, knowledgeNodeId, mode, score, durationMs, sourceAttemptId }) {
  return query(
    `INSERT INTO student_practice_attempts
       (id, user_id, course_id, knowledge_node_id, mode, score, duration_ms, confirmed, source_attempt_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)`,
    [id, userId, courseId, knowledgeNodeId, mode, score, durationMs, sourceAttemptId],
  );
}

function listAttempts({ userId, courseId, limit, offset }) {
  return query(
    `SELECT id, user_id, course_id, knowledge_node_id, mode, score, duration_ms,
            source_attempt_id AS sourceAttemptId, created_at AS createdAt
       FROM student_practice_attempts
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
      ORDER BY created_at DESC, id
      LIMIT $3 OFFSET $4`,
    [userId, courseId, limit, offset],
  ).rows;
}

module.exports = { createAttempt, listAttempts };
