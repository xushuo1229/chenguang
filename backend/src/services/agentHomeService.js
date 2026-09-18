'use strict';

const agentHomeModel = require('../db/agentHomeContextModel');
const syncService = require('./syncService');
const {
  buildFocusSummary,
  buildGoals,
  buildStreaks,
  buildTaskSummary,
} = require('./reflectionContextSource');
const { sanitizeReflectionContext } = require('./reflectionContext');

const CONTEXT_VERSION = 'learning-context-v1';
const ACTION_LEVEL = 'insight_only';
const MAX_TEXT = 160;
const COURSE_LIMIT = 10;
const NODE_LIMIT = 10;
const STATE_LIMIT = 20;
const WEAK_TOPIC_LIMIT = 10;
const STRONG_TOPIC_LIMIT = 10;
const MEMORY_LIMIT = 10;

function boundedText(value, maxLength = MAX_TEXT) {
  if (value == null) return '';
  return String(value)
    .split('')
    .filter((character) => {
      const charCode = character.charCodeAt(0);
      return charCode >= 32 && charCode !== 127;
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}

function boundedNumber(value, max = 1000000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function dateOffset(dateValue, days) {
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function projectCourses(payload) {
  return asArray(payload && payload.courses)
    .filter((course) => course && (course.id || course.name))
    .slice(0, COURSE_LIMIT)
    .map((course) => ({
      courseId: boundedText(course.id, 200),
      name: boundedText(course.name, 120),
    }))
    .filter((course) => course.courseId);
}

function projectCourseNodes(rows) {
  return rows.slice(0, NODE_LIMIT).map((row) => ({
    courseId: boundedText(row.course_id, 200),
    knowledgeNodeId: boundedText(row.id, 200),
    title: boundedText(row.title),
    kind: boundedText(row.kind, 40),
    status: boundedText(row.status, 40),
    confidence: boundedText(row.confidence, 40),
  }));
}

function projectKnowledgeState(row) {
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

function projectKnowledgeStates(rows) {
  const states = rows.slice(0, STATE_LIMIT).map(projectKnowledgeState);
  const weakTopics = states
    .filter((state) => state.state !== 'mastered')
    .sort((left, right) => left.masteryLevel - right.masteryLevel)
    .slice(0, WEAK_TOPIC_LIMIT);
  const strongTopics = states
    .filter((state) => state.state === 'mastered')
    .sort((left, right) => right.masteryLevel - left.masteryLevel)
    .slice(0, STRONG_TOPIC_LIMIT);
  const recentlyReviewed = states.slice(0, 5);
  return { weakTopics, strongTopics, recentlyReviewed };
}

function projectGrowthMemory(payload) {
  const memory = payload && payload.user && payload.user.memory && typeof payload.user.memory === 'object'
    ? payload.user.memory
    : {};
  const items = ['patterns', 'milestones', 'preferences', 'insights']
    .flatMap((category) => asArray(memory[category]).map((item) => ({ item, category })))
    .filter(({ item }) => item && item.content && item.status !== 'inactive')
    .slice(0, MEMORY_LIMIT)
    .map(({ item, category }) => ({
      id: boundedText(item.id, 120),
      category: boundedText(category, 40),
      type: boundedText(item.type, 40),
      content: boundedText(item.content, 220),
      confidence: boundedNumber(item.confidence, 1),
      updatedAt: boundedText(item.updatedAt, 30),
    }))
    .filter((item) => item.id && item.content);
  return {
    available: items.length > 0,
    items,
  };
}

function buildReflectionSummary(payload, today) {
  return sanitizeReflectionContext({
    today,
    taskSummary: buildTaskSummary(payload, today, dateOffset(today, -1)),
    focusSummary: buildFocusSummary(payload, today),
    streaks: buildStreaks(payload, today),
    goals: buildGoals(payload, today),
    signals: { positive: [], risks: [] },
    suggestions: [],
  });
}

function withBoundary(value, source, authority, type, confidence) {
  return {
    value,
    source,
    authority,
    type,
    confidence,
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

  const envelope = await syncService.getData(owner);
  const payload = envelope && envelope.data && typeof envelope.data === 'object' ? envelope.data : {};
  const today = localToday();
  const reflectionSummary = buildReflectionSummary(payload, today);
  const courseNodes = agentHomeModel.listCourseNodes({ userId: owner, limit: NODE_LIMIT });
  const knowledgeStates = agentHomeModel.listKnowledgeStates({ userId: owner, limit: STATE_LIMIT });
  const growthMemory = projectGrowthMemory(payload);
  const behaviorSummary = {
    today: reflectionSummary.today,
    taskSummary: reflectionSummary.taskSummary,
    focusSummary: reflectionSummary.focusSummary,
    streaks: reflectionSummary.streaks,
    goals: reflectionSummary.goals,
    risks: reflectionSummary.signals.risks,
    trend: [],
  };

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
    courses: withBoundary(
      projectCourses(payload),
      'cgstore.sync.courses',
      'source',
      'source_projection',
      1,
    ),
    courseKnowledge: withBoundary(
      { nodes: projectCourseNodes(courseNodes) },
      'course_space.nodes',
      'source',
      'course_knowledge_projection',
      1,
    ),
    knowledgeStates: withBoundary(
      projectKnowledgeStates(knowledgeStates),
      'student_knowledge_states',
      'source',
      'student_knowledge_state_projection',
      1,
    ),
    behavior: withBoundary(
      behaviorSummary,
      'reflection_context_source',
      'deterministic_projection',
      'behavior_summary',
      1,
    ),
    reflections: withBoundary(
      {
        available: false,
        reason: 'reflection_storage_adapter_not_available',
      },
      'reflection_storage',
      'unavailable',
      'user_reflection',
      0,
    ),
    memories: {
      growth: withBoundary(
        growthMemory,
        'cgstore.user.memory',
        'derived_memory',
        'growth_memory_projection',
        0.5,
      ),
      coach: withBoundary(
        {
          available: false,
          reason: 'client_side_memory_not_available_to_backend',
        },
        'coach_memory',
        'unavailable',
        'interaction_context',
        0,
      ),
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
