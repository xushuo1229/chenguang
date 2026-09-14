'use strict';

import Analytics from './analytics.js';
import GoalEngine from './goals.js';
import { todayStr, dateOffset } from './utils/date.js';
import GrowthIntelligence from './growthIntelligence.js';

var VERSION = '1.0';
var QUERIES = [
  'getTodaySummary', 'getWeekSummary', 'getRecentTrends', 'getCourseProgress',
  'getEnglishHistory', 'getFocusHistory', 'getExerciseHistory', 'getReadingHistory',
  'getTodoStatus', 'getGoalProgress', 'getGrowthState', 'getGrowthProfile', 'getLearningHistory'
];
var INTENTS = {
  today: ['今天', '今日', '现在', '下一步', '做什么', '安排'],
  week: ['本周', '这一周', '7天', '最近七天'],
  trend: ['趋势', '变化', '下降', '上升', '为什么', '效率', '最近'],
  course: ['课程', '课业', '进度', '学习'],
  english: ['英语', '单词', '口语', '听力'],
  focus: ['专注', '番茄', '注意力'],
  exercise: ['运动', '锻炼', '健身'],
  reading: ['阅读', '书', '读书'],
  todo: ['待办', '任务', '计划', '拖延', '积压'],
  goal: ['目标', '进度', '风险', '落后']
};

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
function str(value) { return value == null ? '' : String(value); }
function requireSnapshot(data) {
  if (!data || typeof data !== 'object') throw new TypeError('Growth data snapshot is required');
  var safe = Object.assign({}, data);
  ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus', 'goals'].forEach(function (key) {
    safe[key] = Array.isArray(safe[key]) ? safe[key].filter(function (item) { return item && typeof item === 'object'; }) : [];
  });
  return safe;
}
function rangeEnd(span, today) { return [dateOffset(today, -(span - 1)), today]; }

function getTodaySummary(data, opts) {
  var snap = requireSnapshot(data);
  var today = (opts && opts.today) || todayStr();
  var summary = Analytics.getDailySummary(today, snap);
  return summary ? { scope: 'today', data: summary } : { scope: 'today', data: null, insufficientData: true };
}

function getWeekSummary(data, opts) {
  var snap = requireSnapshot(data);
  var today = (opts && opts.today) || todayStr();
  var range = rangeEnd(7, today);
  return { scope: 'week', data: Analytics.getDateRangeSummary(range[0], range[1], snap) };
}

function getRecentTrends(data, opts) {
  var snap = requireSnapshot(data);
  var state = GrowthIntelligence.computeGrowthState(snap, opts);
  function compactTrends(window) {
    var out = {};
    Object.keys(window || {}).forEach(function (metric) {
      var trend = window[metric];
      out[metric] = {
        metric: trend.metric,
        label: trend.label,
        span: trend.span,
        current: trend.current,
        previous: trend.previous,
        delta: trend.delta,
        status: trend.status,
        volatility: trend.volatility,
        insufficientData: trend.insufficientData
      };
    });
    return out;
  }
  return {
    scope: 'trends',
    data: {
      windows: {
        days7: compactTrends(state.trendState.windows['7d']),
        days14: compactTrends(state.trendState.windows['14d']),
        days30: compactTrends(state.trendState.windows['30d'])
      },
      importantChanges: state.trendState.importantChanges
    },
    insufficientData: state.overall === 'insufficient_data'
  };
}

function getCourseProgress(data, opts) {
  var snap = requireSnapshot(data);
  var courses = arr(snap.courses).map(function (course) {
    return {
      id: str(course && course.id),
      name: str(course && course.name),
      progress: Math.max(0, Math.min(100, num(course && course.progress))),
      status: str(course && course.status),
      __untrustedUserContent: true
    };
  });
  return {
    scope: 'courses',
    data: { summary: Analytics.getCourseSummary(snap), courses: courses },
    insufficientData: courses.length === 0
  };
}

function historyResponse(scope, records, keys, opts) {
  var today = (opts && opts.today) || todayStr();
  var range = rangeEnd(Math.max(7, Math.min(30, num(opts && opts.days) || 30)), today);
  var filtered = arr(records).filter(function (item) {
    var date = str(item && item.date);
    return date >= range[0] && date <= range[1];
  }).map(function (item) {
    var out = { date: str(item.date) };
    keys.forEach(function (key) { out[key] = item[key]; });
    out.__untrustedUserContent = true;
    return out;
  });
  return { scope: scope, data: filtered, range: range, insufficientData: filtered.length === 0 };
}

function getEnglishHistory(data, opts) {
  return historyResponse('english', requireSnapshot(data).english, ['minutes', 'words'], opts);
}

function getFocusHistory(data, opts) {
  return historyResponse('focus', requireSnapshot(data).focus, ['minutes', 'task'], opts);
}

function getExerciseHistory(data, opts) {
  return historyResponse('exercise', requireSnapshot(data).sports, ['duration', 'calories', 'type'], opts);
}

function getReadingHistory(data, opts) {
  return historyResponse('reading', requireSnapshot(data).readings, ['pages', 'bookName'], opts);
}

function getTodoStatus(data, opts) {
  var snap = requireSnapshot(data);
  var today = (opts && opts.today) || todayStr();
  var week = rangeEnd(7, today);
  return {
    scope: 'todos',
    data: {
      today: Analytics.getTodoSummary(today, today, snap, today),
      week: Analytics.getTodoSummary(week[0], week[1], snap, today),
      items: arr(snap.todos).filter(function (item) {
        var date = str(item && item.date);
        return date >= week[0] && date <= today;
      }).slice(0, 10).map(function (item) {
        return { date: str(item.date), text: str(item.text), done: !!item.done, priority: str(item.priority) || 'normal', __untrustedUserContent: true };
      })
    },
    insufficientData: arr(snap.todos).length === 0
  };
}

function getGoalProgress(data, opts) {
  var snap = requireSnapshot(data);
  var today = (opts && opts.today) || todayStr();
  var progress = GoalEngine.computeGoalsProgress(arr(snap.goals), snap, { today: today });
  var safeProgress = progress.map(function (item) {
    var goal = (item && item.goal) || {};
    return {
      id: str(goal.id),
      title: str(goal.title),
      type: str(goal.type),
      metric: str(goal.metric),
      targetValue: num(goal.targetValue),
      currentValue: num(item && item.currentValue),
      percentage: Math.round(num(item && item.percentage)),
      remaining: num(item && item.remaining),
      daysRemaining: num(item && item.daysRemaining),
      status: (item && item.status) || 'active',
      __untrustedUserContent: true
    };
  });
  return { scope: 'goals', data: safeProgress, insufficientData: safeProgress.length === 0 };
}

function getGrowthState(data, opts) {
  var snap = requireSnapshot(data);
  var state = GrowthIntelligence.computeGrowthState(snap, opts);
  return {
    scope: 'growthState',
    data: {
      overall: state.overall,
      learningState: state.learningState,
      executionState: state.executionState,
      focusState: state.focusState,
      englishState: state.englishState,
      readingState: state.readingState,
      exerciseState: state.exerciseState,
      courseState: state.courseState,
      goalState: state.goalState,
      workloadState: state.workloadState,
      consistencyState: state.consistencyState,
      importantChanges: state.trendState.importantChanges,
      riskSignals: state.riskSignals,
      positiveSignals: state.positiveSignals,
      recommendedFocus: state.recommendedFocus,
      actionProposals: state.actionProposals,
      dataSufficiency: state.dataSufficiency
    },
    insufficientData: false
  };
}

function getGrowthProfile(data, opts) {
  var snap = requireSnapshot(data);
  return { scope: 'growthProfile', data: GrowthIntelligence.buildGrowthProfile(snap, opts), insufficientData: false };
}

function getLearningHistory(data, opts) {
  var snap = requireSnapshot(data);
  var range = rangeEnd(Math.max(7, Math.min(30, num(opts && opts.days) || 30)), (opts && opts.today) || todayStr());
  var data30 = Analytics.getDateRangeSummary(range[0], range[1], snap);
  return {
    scope: 'learningHistory',
    data: {
      range: { start: range[0], end: range[1] },
      englishMinutes: data30 ? data30.study.englishMinutes : 0,
      focusMinutes: data30 ? data30.focus.minutes : 0,
      totalMinutes: data30 ? data30.study.minutes : 0,
      activeDays: data30 ? data30.activity.activeDays : 0
    },
    insufficientData: !data30 || data30.activity.activeDays === 0
  };
}

var HANDLERS = {
  getTodaySummary: getTodaySummary,
  getWeekSummary: getWeekSummary,
  getRecentTrends: getRecentTrends,
  getCourseProgress: getCourseProgress,
  getEnglishHistory: getEnglishHistory,
  getFocusHistory: getFocusHistory,
  getExerciseHistory: getExerciseHistory,
  getReadingHistory: getReadingHistory,
  getTodoStatus: getTodoStatus,
  getGoalProgress: getGoalProgress,
  getGrowthState: getGrowthState,
  getGrowthProfile: getGrowthProfile,
  getLearningHistory: getLearningHistory
};

function detectIntents(message) {
  var text = str(message).toLowerCase();
  if (!text.trim()) return ['today', 'trend', 'goal', 'todo'];
  return Object.keys(INTENTS).filter(function (intent) {
    return INTENTS[intent].some(function (keyword) { return text.indexOf(keyword.toLowerCase()) >= 0; });
  });
}

function query(message, data, opts) {
  var snap = requireSnapshot(data);
  var intents = detectIntents(message);
  var mapping = {
    today: ['getTodaySummary', 'getTodoStatus'],
    week: ['getWeekSummary'],
    trend: ['getRecentTrends', 'getFocusHistory'],
    course: ['getCourseProgress'],
    english: ['getEnglishHistory'],
    focus: ['getFocusHistory'],
    exercise: ['getExerciseHistory'],
    reading: ['getReadingHistory'],
    todo: ['getTodoStatus'],
    goal: ['getGoalProgress'],
    learning: ['getLearningHistory']
  };
  var requested = [];
  intents.forEach(function (intent) {
    (mapping[intent] || []).forEach(function (name) { if (requested.indexOf(name) < 0) requested.push(name); });
  });
  if (!requested.length) requested = ['getGrowthState'];
  if (requested.length > 4) requested = requested.slice(0, 4);
  var results = {};
  requested.forEach(function (name) { results[name] = HANDLERS[name](snap, opts); });
  var always = getGrowthState(snap, opts);
  results.getGrowthState = always;
  return {
    version: VERSION,
    question: str(message).slice(0, 500),
    intents: intents,
    requestedQueries: requested.concat('getGrowthState'),
    allowedQueries: QUERIES,
    results: results,
    currentUserOnly: true
  };
}

function planTools(message) {
  var intents = detectIntents(message);
  var mapping = {
    today: ['today_summary', 'todo_status'],
    week: ['recent_trends'],
    trend: ['recent_trends', 'focus_history'],
    course: ['course_progress'],
    english: ['english_history'],
    focus: ['focus_history'],
    exercise: ['exercise_history'],
    reading: ['reading_history'],
    todo: ['todo_status'],
    goal: ['goal_progress'],
    learning: ['learning_history']
  };
  var requested = [];
  intents.forEach(function (intent) {
    (mapping[intent] || []).forEach(function (tool) {
      if (requested.indexOf(tool) < 0) requested.push(tool);
    });
  });
  if (!requested.length) requested = ['growth_state'];
  if (requested.length > 4) requested = requested.slice(0, 4);
  return requested.concat('growth_state');
}

var AIRetrieval = {
  VERSION: VERSION,
  QUERIES: QUERIES,
  query: query,
  planTools: planTools,
  getTodaySummary: getTodaySummary,
  getWeekSummary: getWeekSummary,
  getRecentTrends: getRecentTrends,
  getCourseProgress: getCourseProgress,
  getEnglishHistory: getEnglishHistory,
  getFocusHistory: getFocusHistory,
  getExerciseHistory: getExerciseHistory,
  getReadingHistory: getReadingHistory,
  getTodoStatus: getTodoStatus,
  getGoalProgress: getGoalProgress,
  getGrowthState: getGrowthState,
  getGrowthProfile: getGrowthProfile,
  getLearningHistory: getLearningHistory
};

globalThis.CGAIRetrieval = AIRetrieval;
export default AIRetrieval;
export { query, planTools, QUERIES };
