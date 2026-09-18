'use strict';

const { query } = require('./index');

function listCourseNodes({ userId, limit }) {
  const result = query(
    `SELECT id, course_id, title, kind, status, confidence, updated_at
       FROM course_space_nodes
      WHERE user_id = $1
      ORDER BY updated_at DESC, id
      LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

function listKnowledgeStates({ userId, limit }) {
  const result = query(
    `SELECT s.id,
            s.user_id,
            s.course_id,
            s.knowledge_node_id,
            s.mastery_level,
            s.confidence,
            s.state,
            s.updated_at,
            n.title AS node_title,
            n.kind AS node_kind,
            (SELECT COUNT(*) FROM student_knowledge_evidence e
              WHERE e.user_id = s.user_id AND e.knowledge_state_id = s.id) AS evidence_count
       FROM student_knowledge_states s
       JOIN course_space_nodes n
         ON n.id = s.knowledge_node_id AND n.user_id = s.user_id
      WHERE s.user_id = $1
      ORDER BY s.updated_at DESC, s.id
      LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

module.exports = {
  listCourseNodes,
  listKnowledgeStates,
};
