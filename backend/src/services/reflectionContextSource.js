'use strict';

const syncService = require('./syncService');
const { sanitizeReflectionContext } = require('./reflectionContext');

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

function dayNumber(dateValue) {
  const [year, month, day] = String(dateValue).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isDoneTodo(todo) {
  return Boolean(todo && todo.done);
}

function isDoneCheckin(checkin) {
  return checkin && (checkin.status === 'done' || checkin.status === 'completed');
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildTaskSummary(payload, today, yesterday) {
  const todos = asArray(payload.todos).filter((todo) => todo && todo.date === today);
  const completed = todos.filter(isDoneTodo).length;
  const total = todos.length;
  const yesterdayTodos = asArray(payload.todos).filter((todo) => todo && todo.date === yesterday && !isDoneTodo(todo));
  return {
    total,
    completed,
    pending: total - completed,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    yesterdayPending: yesterdayTodos.length,
  };
}

function buildFocusSummary(payload, today) {
  const focusMinutes = asArray(payload.focus)
    .filter((record) => record && record.date === today)
    .reduce((sum, record) => sum + positiveNumber(record.minutes), 0);
  const englishMinutes = asArray(payload.english)
    .filter((record) => record && record.date === today)
    .reduce((sum, record) => sum + positiveNumber(record.minutes), 0);
  const exerciseMinutes = asArray(payload.sports)
    .filter((record) => record && record.date === today)
    .reduce((sum, record) => sum + positiveNumber(record.duration), 0);
  return {
    minutes: focusMinutes,
    studyMinutes: focusMinutes + englishMinutes,
    exerciseMinutes,
    activeToday: focusMinutes > 0 || englishMinutes > 0 || exerciseMinutes > 0,
  };
}

function buildStreaks(payload, today) {
  const dates = Array.from(new Set(asArray(payload.checkins)
    .filter(isDoneCheckin)
    .map((record) => String(record.date))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today)))
    .sort();

  let longest = 0;
  let current = 0;
  let previous = null;
  for (const date of dates) {
    current = previous && dayNumber(date) - dayNumber(previous) === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }

  const lastDate = dates[dates.length - 1] || null;
  const lastDiff = lastDate ? dayNumber(today) - dayNumber(lastDate) : -1;
  if (lastDate && lastDiff > 1) current = 0;
  return {
    current,
    longest,
    todayDone: lastDiff === 0,
  };
}

function isActiveGoal(goal, today) {
  return Boolean(goal && goal.status !== 'archived' &&
    (!goal.endDate || String(goal.endDate) >= today));
}

function buildGoals(payload, today) {
  const goals = asArray(payload.goals).filter((goal) => isActiveGoal(goal, today));
  return {
    activeCount: goals.length,
    atRisk: [],
  };
}

async function buildAuthoritativeReflectionContext({ userId }) {
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

module.exports = {
  buildAuthoritativeReflectionContext,
  buildFocusSummary,
  buildGoals,
  buildStreaks,
  buildTaskSummary,
};
