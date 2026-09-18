'use strict';

const {
  buildFocusSummary,
  buildGoals,
  buildStreaks,
  buildTaskSummary,
} = require('../reflectionContextSource');
const { sanitizeReflectionContext } = require('../reflectionContext');
const { asArray, boundedNumber, boundedText, createAdapter } = require('./adapterContract');

const COURSE_LIMIT = 10;

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

function buildBehaviorSummary({ snapshot }) {
  if (!snapshot || snapshot.adapter !== 'sync_data' || snapshot.readOnly !== true) {
    const error = new Error('INVALID_ADAPTER_INPUT');
    error.code = 'INVALID_ADAPTER_INPUT';
    error.statusCode = 400;
    throw error;
  }

  const payload = snapshot.data || {};
  const today = localToday();
  const summary = sanitizeReflectionContext({
    today,
    taskSummary: buildTaskSummary(payload, today, dateOffset(today, -1)),
    focusSummary: buildFocusSummary(payload, today),
    streaks: buildStreaks(payload, today),
    goals: buildGoals(payload, today),
    signals: { positive: [], risks: [] },
    suggestions: [],
  });

  return createAdapter({
    adapter: 'behavior',
    source: 'sync.activity',
    authority: 'deterministic_projection',
    type: 'behavior_summary',
    data: {
      courses: projectCourses(payload),
      today: summary.today,
      taskSummary: summary.taskSummary,
      focusSummary: summary.focusSummary,
      streaks: summary.streaks,
      goals: summary.goals,
      risks: summary.signals.risks,
      trend: [],
    },
  });
}

module.exports = {
  buildBehaviorSummary,
};
