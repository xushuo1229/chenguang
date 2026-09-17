'use strict';

const ApiError = require('../utils/ApiError');

const CONTEXT_VERSION = '1.0';
const MAX_TEXT = 240;
const MAX_TITLE = 80;
const MAX_NUMBER = 100000;
const MAX_MINUTES = 10000;

function boundedNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function boundedString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function boundedArray(value, maxLength) {
  return Array.isArray(value) ? value.slice(0, maxLength) : [];
}

function boundedSummary(source, fields) {
  const output = {};
  for (const field of fields) {
    output[field.name] = boundedNumber(source && source[field.name], field.min, field.max);
  }
  return output;
}

function sanitizeSignals(signals) {
  const source = signals && typeof signals === 'object' ? signals : {};
  const sanitizeSignal = (item) => {
    if (!item || typeof item !== 'object') return null;
    const type = boundedString(item.type, 40);
    const message = boundedString(item.message, MAX_TEXT);
    const severity = ['low', 'medium', 'high'].includes(item.severity) ? item.severity : '';
    if (!type && !message) return null;
    return { type, severity, message };
  };

  return {
    positive: boundedArray(source.positive, 3).map(sanitizeSignal).filter(Boolean),
    risks: boundedArray(source.risks, 3).map(sanitizeSignal).filter(Boolean),
  };
}

function sanitizeReflectionContext(input) {
  let context = input;
  if (context && typeof context === 'object' && !Array.isArray(context) && context.growthContext) {
    context = context.growthContext;
  }
  if (context == null) context = {};
  if (typeof context !== 'object' || Array.isArray(context)) {
    throw ApiError.badRequest('INVALID_CONTEXT', 'GrowthContext 格式不正确');
  }

  const taskSource = context.taskSummary && typeof context.taskSummary === 'object' ? context.taskSummary : {};
  const total = boundedNumber(taskSource.total, 0, MAX_NUMBER);
  const completed = boundedNumber(taskSource.completed, 0, total);
  const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

  const focusSource = context.focusSummary && typeof context.focusSummary === 'object' ? context.focusSummary : {};
  const streakSource = context.streaks && typeof context.streaks === 'object' ? context.streaks : {};
  const goalsSource = context.goals && typeof context.goals === 'object' ? context.goals : {};
  const atRisk = boundedArray(goalsSource.atRisk, 3).map((item) => {
    if (!item || typeof item !== 'object') return null;
    const title = boundedString(item.title, 120);
    if (!title) return null;
    return {
      title,
      percentage: boundedNumber(item.percentage, 0, 100),
      daysRemaining: boundedNumber(item.daysRemaining, 0, MAX_NUMBER),
    };
  }).filter(Boolean);

  const focusSummary = boundedSummary(focusSource, [
    { name: 'minutes', min: 0, max: MAX_MINUTES },
    { name: 'studyMinutes', min: 0, max: MAX_MINUTES },
    { name: 'exerciseMinutes', min: 0, max: MAX_MINUTES },
  ]);
  focusSummary.activeToday = Boolean(focusSource.activeToday);

  return {
    today: /^\d{4}-\d{2}-\d{2}$/.test(String(context.today || '')) ? String(context.today).slice(0, 10) : '未知',
    taskSummary: {
      total,
      completed,
      pending: Math.max(0, total - completed),
      completionRate,
      yesterdayPending: boundedNumber(taskSource.yesterdayPending, 0, MAX_NUMBER),
    },
    focusSummary,
    streaks: {
      current: boundedNumber(streakSource.current, 0, MAX_NUMBER),
      longest: boundedNumber(streakSource.longest, 0, MAX_NUMBER),
      todayDone: Boolean(streakSource.todayDone),
    },
    goals: {
      activeCount: boundedNumber(goalsSource.activeCount, 0, MAX_NUMBER),
      atRisk,
    },
    signals: sanitizeSignals(context.signals),
    suggestions: boundedArray(context.suggestions, 3)
      .map((item) => boundedString(item, MAX_TEXT))
      .filter(Boolean),
  };
}

module.exports = {
  CONTEXT_VERSION,
  sanitizeReflectionContext,
};
