'use strict';

const agentHomeModel = require('../../db/agentHomeContextModel');
const { boundedNumber, boundedText, createAdapter } = require('./adapterContract');

const STATE_LIMIT = 20;
const WEAK_TOPIC_LIMIT = 10;
const STRONG_TOPIC_LIMIT = 10;

function projectState(row) {
  return {
    courseId: boundedText(row.course_id, 200),
    knowledgeNodeId: boundedText(row.knowledge_node_id, 200),
    title: boundedText(row.node_title),
    masteryLevel: boundedNumber(row.mastery_level, 1),
    confidence: boundedNumber(row.confidence, 1),
    state: ['weak', 'learning', 'mastered'].includes(row.state) ? row.state : 'learning',
    evidenceCount: boundedNumber(row.evidence_count, 100000),
    updatedAt: boundedText(row.updated_at, 30),
  };
}

function groupStates(rows) {
  const states = rows.slice(0, STATE_LIMIT).map(projectState);
  const weakTopics = states
    .filter((state) => state.state !== 'mastered')
    .sort((left, right) => left.masteryLevel - right.masteryLevel)
    .slice(0, WEAK_TOPIC_LIMIT);
  const strongTopics = states
    .filter((state) => state.state === 'mastered')
    .sort((left, right) => right.masteryLevel - left.masteryLevel)
    .slice(0, STRONG_TOPIC_LIMIT);
  return {
    weakTopics,
    strongTopics,
    recentlyReviewed: states.slice(0, 5),
  };
}

async function buildKnowledgeStateSummary({ userId }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    const error = new Error('UNAUTHORIZED');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    throw error;
  }

  const rows = await agentHomeModel.listKnowledgeStates({ userId: owner, limit: STATE_LIMIT });
  return createAdapter({
    adapter: 'knowledge_state',
    source: 'student_knowledge_states',
    authority: 'source',
    type: 'student_knowledge_state_projection',
    data: groupStates(rows),
  });
}

module.exports = {
  buildKnowledgeStateSummary,
};
