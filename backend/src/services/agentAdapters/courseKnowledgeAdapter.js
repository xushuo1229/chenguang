'use strict';

const agentHomeModel = require('../../db/agentHomeContextModel');
const { boundedNumber, boundedText, createAdapter } = require('./adapterContract');

const NODE_LIMIT = 10;
const EVIDENCE_LIMIT = 10;

function projectNode(row) {
  return {
    courseId: boundedText(row.course_id, 200),
    knowledgeNodeId: boundedText(row.id, 200),
    title: boundedText(row.title),
    kind: boundedText(row.kind, 40),
    status: boundedText(row.status, 40),
    confidence: boundedText(row.confidence, 40),
  };
}

function projectEvidence(row) {
  return {
    evidenceId: boundedText(row.id, 200),
    courseId: boundedText(row.course_id, 200),
    nodeId: boundedText(row.node_id, 200),
    documentId: boundedText(row.document_id, 200),
    quote: boundedText(row.quote, 220),
    locator: boundedText(row.locator, 200),
    version: boundedNumber(row.version, 1000000),
  };
}

async function buildCourseKnowledge({ userId }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    const error = new Error('UNAUTHORIZED');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    throw error;
  }

  const [nodes, evidence] = await Promise.all([
    agentHomeModel.listCourseNodes({ userId: owner, limit: NODE_LIMIT }),
    agentHomeModel.listCourseEvidence({ userId: owner, limit: EVIDENCE_LIMIT }),
  ]);

  return createAdapter({
    adapter: 'course_knowledge',
    source: 'course_space',
    authority: 'source',
    type: 'course_knowledge_projection',
    data: {
      nodes: nodes.map(projectNode),
      evidence: evidence.map(projectEvidence),
    },
  });
}

module.exports = {
  buildCourseKnowledge,
};
