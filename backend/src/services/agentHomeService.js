'use strict';

const syncDataAdapter = require('./agentAdapters/syncDataAdapter');
const behaviorAdapter = require('./agentAdapters/behaviorAdapter');
const courseKnowledgeAdapter = require('./agentAdapters/courseKnowledgeAdapter');
const knowledgeStateAdapter = require('./agentAdapters/knowledgeStateAdapter');
const growthMemoryAdapter = require('./agentAdapters/growthMemoryAdapter');
const reflectionAdapter = require('./agentAdapters/reflectionAdapter');

const CONTEXT_VERSION = 'learning-context-v1';
const ACTION_LEVEL = 'insight_only';
function toBoundary(adapter, data = adapter.data) {
  return {
    value: data,
    source: adapter.source,
    authority: adapter.authority,
    type: adapter.type,
    confidence: adapter.confidence,
  };
}

async function buildAgentHomeContext({ userId }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    const error = new Error('UNAUTHORIZED');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    throw error;
  }

  const snapshot = await syncDataAdapter.buildSyncSnapshot({ userId: owner });
  const behavior = behaviorAdapter.buildBehaviorSummary({ snapshot });
  const courseKnowledge = await courseKnowledgeAdapter.buildCourseKnowledge({ userId: owner });
  const knowledgeStates = await knowledgeStateAdapter.buildKnowledgeStateSummary({ userId: owner });
  const growthMemory = growthMemoryAdapter.buildGrowthMemoryProjection({ snapshot });
  const reflections = reflectionAdapter.buildReflectionSummary();

  return {
    version: CONTEXT_VERSION,
    userId: owner,
    generatedAt: new Date().toISOString(),
    actionLevel: ACTION_LEVEL,
    readOnly: true,
    user: {
      id: owner,
      learningStage: 'active',
    },
    courses: {
      value: behavior.data.courses,
      source: 'cgstore.sync.courses',
      authority: 'source',
      type: 'source_projection',
      confidence: 1,
    },
    courseKnowledge: toBoundary(courseKnowledge),
    knowledgeStates: toBoundary(knowledgeStates),
    behavior: toBoundary(behavior),
    reflections: toBoundary(reflections),
    memories: {
      growth: toBoundary(growthMemory),
      coach: {
        value: {
          available: false,
          reason: 'client_side_memory_not_available_to_backend',
        },
        source: 'coach_memory',
        authority: 'unavailable',
        type: 'interaction_context',
        confidence: 0,
      },
    },
    permissions: {
      read: [
        'course_knowledge',
        'student_knowledge_state',
        'behavior_summary',
        'growth_memory_projection',
      ],
      write: [],
    },
  };
}

module.exports = {
  ACTION_LEVEL,
  CONTEXT_VERSION,
  buildAgentHomeContext,
};
