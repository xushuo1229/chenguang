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
const RECENT_WINDOW = 7;
const RECENT_CURRENT = 3;
const MAX_DAILY_MINUTES = 10000;

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

function recordDate(value) {
  const date = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function buildRecent7(payload, today) {
  const dates = Array.from({ length: RECENT_WINDOW }, (_, index) => dateOffset(today, index - 6));
  const dateSet = new Set(dates);
  const currentSet = new Set(dates.slice(-RECENT_CURRENT));
  const focusByDate = new Map();
  const studyDates = new Set();

  const addFocus = (record) => {
    const date = recordDate(record && record.date);
    if (!dateSet.has(date)) return;
    const minutes = boundedNumber(record.minutes, MAX_DAILY_MINUTES);
    focusByDate.set(date, (focusByDate.get(date) || 0) + minutes);
  };

  const addStudyDay = (record, minutesField) => {
    const date = recordDate(record && record.date);
    if (!dateSet.has(date)) return;
    if (boundedNumber(record[minutesField], MAX_DAILY_MINUTES) > 0) studyDates.add(date);
  };

  asArray(payload.focus).forEach(addFocus);
  asArray(payload.english).forEach((record) => addStudyDay(record, 'minutes'));

  const focusMinutes = dates.reduce((sum, date) => sum + (focusByDate.get(date) || 0), 0);
  const current3FocusMinutes = dates.slice(-RECENT_CURRENT)
    .reduce((sum, date) => sum + (focusByDate.get(date) || 0), 0);
  const previous4FocusMinutes = dates.slice(0, RECENT_WINDOW - RECENT_CURRENT)
    .reduce((sum, date) => sum + (focusByDate.get(date) || 0), 0);

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    focusMinutes,
    current3FocusMinutes,
    previous4FocusMinutes,
    studyActiveDays: studyDates.size,
    current3StudyDays: dates.slice(-RECENT_CURRENT).filter((date) => studyDates.has(date)).length,
    previous4StudyDays: dates.slice(0, RECENT_WINDOW - RECENT_CURRENT).filter((date) => studyDates.has(date)).length,
  };
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
      recent7: buildRecent7(payload, today),
    },
  });
}

module.exports = {
  buildBehaviorSummary,
};
