'use strict';

const { query, db } = require('./index');

function findState({ userId, courseId, knowledgeNodeId }) {
  const result = query(
    `SELECT s.*,
            n.title AS node_title,
            n.kind AS node_kind,
            (SELECT COUNT(*) FROM student_knowledge_evidence e
              WHERE e.user_id = s.user_id AND e.knowledge_state_id = s.id) AS evidence_count
       FROM student_knowledge_states s
       JOIN course_space_nodes n
         ON n.id = s.knowledge_node_id AND n.user_id = s.user_id
      WHERE s.user_id = $1 AND s.course_id = $2 AND s.knowledge_node_id = $3`,
    [userId, courseId, knowledgeNodeId],
  );
  return result.rows[0] || null;
}

function listStates({ userId, courseId, limit, offset }) {
  const result = query(
    `SELECT s.*,
            n.title AS node_title,
            n.kind AS node_kind,
            (SELECT COUNT(*) FROM student_knowledge_evidence e
              WHERE e.user_id = s.user_id AND e.knowledge_state_id = s.id) AS evidence_count
       FROM student_knowledge_states s
       JOIN course_space_nodes n
         ON n.id = s.knowledge_node_id AND n.user_id = s.user_id
      WHERE s.user_id = $1 AND s.course_id = $2
      ORDER BY s.updated_at DESC, s.id
      LIMIT $3 OFFSET $4`,
    [userId, courseId, limit, offset],
  );
  return result.rows;
}

function listEvidence({ userId, knowledgeStateId }) {
  const result = query(
    `SELECT * FROM student_knowledge_evidence
      WHERE user_id = $1 AND knowledge_state_id = $2
      ORDER BY created_at DESC, id`,
    [userId, knowledgeStateId],
  );
  return result.rows;
}

function recordEvidenceWithState({
  stateId, userId, courseId, knowledgeNodeId, mastery, confidence, state, evidence,
}) {
  const record = db.transaction(() => {
    query(
      `INSERT INTO student_knowledge_states
         (id, user_id, course_id, knowledge_node_id, mastery_level, confidence, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(user_id, course_id, knowledge_node_id) DO UPDATE SET
         mastery_level = excluded.mastery_level,
         confidence = excluded.confidence,
         state = excluded.state,
         updated_at = CURRENT_TIMESTAMP`,
      [stateId, userId, courseId, knowledgeNodeId, mastery, confidence, state],
    );
    query(
      `INSERT INTO student_knowledge_evidence
         (id, user_id, knowledge_state_id, source_type, source_id, evidence_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [evidence.id, userId, stateId, evidence.source_type, evidence.source_id, evidence.evidence_data],
    );
  });
  record();
  return findState({ userId, courseId, knowledgeNodeId });
}

module.exports = {
  findState,
  listEvidence,
  listStates,
  recordEvidenceWithState,
};
