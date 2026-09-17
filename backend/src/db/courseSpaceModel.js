'use strict';

const { query } = require('./index');

async function createDocument({ id, userId, courseId, title, content, sourceUrl, version }) {
  const result = await query(
    `INSERT INTO course_space_documents
       (id, user_id, course_id, title, content, source_url, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, courseId, title, content, sourceUrl, version]
  );
  return result;
}

async function createNode({ id, userId, courseId, title, kind, definition, status, confidence, version }) {
  return query(
    `INSERT INTO course_space_nodes
       (id, user_id, course_id, title, kind, definition, status, confidence, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, userId, courseId, title, kind, definition, status, confidence, version]
  );
}

async function createRelation({ id, userId, courseId, sourceNodeId, targetNodeId, relationType, version }) {
  return query(
    `INSERT INTO course_space_relations
       (id, user_id, course_id, source_node_id, target_node_id, relation_type, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, courseId, sourceNodeId, targetNodeId, relationType, version]
  );
}

async function createEvidence({ id, userId, courseId, documentId, nodeId, quote, locator, version }) {
  return query(
    `INSERT INTO course_space_evidence
       (id, user_id, course_id, document_id, node_id, quote, locator, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, courseId, documentId, nodeId, quote, locator, version]
  );
}

async function listDocuments(userId, courseId) {
  const result = await query(
    `SELECT * FROM course_space_documents
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
      ORDER BY created_at DESC, id`,
    [userId, courseId]
  );
  return result.rows;
}

async function listNodes(userId, courseId) {
  const result = await query(
    `SELECT * FROM course_space_nodes
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
      ORDER BY created_at DESC, id`,
    [userId, courseId]
  );
  return result.rows;
}

async function listRelations(userId, courseId) {
  const result = await query(
    `SELECT * FROM course_space_relations
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
      ORDER BY created_at DESC, id`,
    [userId, courseId]
  );
  return result.rows;
}

async function listEvidence(userId, courseId) {
  const result = await query(
    `SELECT * FROM course_space_evidence
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
      ORDER BY created_at DESC, id`,
    [userId, courseId]
  );
  return result.rows;
}

async function findDocument({ userId, documentId }) {
  const result = await query(
    `SELECT * FROM course_space_documents WHERE user_id = $1 AND id = $2`,
    [userId, documentId]
  );
  return result.rows[0] || null;
}

async function findNode({ userId, nodeId }) {
  const result = await query(
    `SELECT * FROM course_space_nodes WHERE user_id = $1 AND id = $2`,
    [userId, nodeId]
  );
  return result.rows[0] || null;
}

async function searchDocuments({ userId, courseId, pattern, limit }) {
  const result = await query(
    `SELECT * FROM course_space_documents
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
        AND (title LIKE $3 ESCAPE '\\' OR content LIKE $3 ESCAPE '\\')
      ORDER BY created_at DESC, id LIMIT $4`,
    [userId, courseId, pattern, limit]
  );
  return result.rows;
}

async function searchNodes({ userId, courseId, pattern, limit }) {
  const result = await query(
    `SELECT * FROM course_space_nodes
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
        AND (title LIKE $3 ESCAPE '\\' OR definition LIKE $3 ESCAPE '\\')
      ORDER BY created_at DESC, id LIMIT $4`,
    [userId, courseId, pattern, limit]
  );
  return result.rows;
}

async function searchEvidence({ userId, courseId, pattern, limit }) {
  const result = await query(
    `SELECT * FROM course_space_evidence
      WHERE user_id = $1 AND ($2 IS NULL OR course_id = $2)
        AND (quote LIKE $3 ESCAPE '\\' OR locator LIKE $3 ESCAPE '\\')
      ORDER BY created_at DESC, id LIMIT $4`,
    [userId, courseId, pattern, limit]
  );
  return result.rows;
}

module.exports = {
  createDocument,
  createEvidence,
  createNode,
  createRelation,
  findDocument,
  findNode,
  listDocuments,
  listEvidence,
  listNodes,
  listRelations,
  searchDocuments,
  searchEvidence,
  searchNodes,
};
