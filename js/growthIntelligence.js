'use strict';

import CGStore from './store.js';
import Analytics from './analytics.js';
import GoalEngine from './goals.js';
import { todayStr, dateOffset } from './utils/date.js';

var VERSION = '1.0';
var SPANS = [7, 14, 30];
var stateCache = { key: null, state: null };
var METRICS = {
  study: { label: '学习时长', reader: 'study' },
  focus: { label: '专注时长', reader: 'focus' },
  english: { label: '英语学习', reader: 'english' },
  exercise: { label: '运动时长', reader: 'exerciseMinutes' },
  reading: { label: '阅读页数', reader: 'pages' },
  todoDone: { label: '任务完成', reader: 'todoDone' },
  activity: { label: '活跃天数', reader: 'activity' }
};

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
function str(value) { return value == null ? '' : String(value); }
function pct(value) { return Math.round(Math.max(0, Math.min(100, num(value))) * 10) / 10; }
function round(value) { return Math.round(num(value) * 10) / 10; }
function rangeFor(span, today) { return [dateOffset(today, -(span - 1)), today]; }

function safeCollection(value) {
  return arr(value).filter(function (item) { return item && typeof item === 'object'; });
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return {};
  var out = Object.assign({}, snapshot);
  ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus', 'goals'].forEach(function (key) {
    out[key] = safeCollection(out[key]);
  });
  out.user = (out.user && typeof out.user === 'object') ? out.user : {};
  return out;
}

function cacheKey(snapshot, today) {
  var meta = snapshot && snapshot._meta;
  if (!meta || typeof meta !== 'object') return null;
  return [today, meta.revision, meta.updatedAt, meta.deviceId].join('|');
}

function metricSum(metric, range, data) {
  var series = Analytics.getTrend(metric, range[0], range[1], 'daily', data) || [];
  return series.reduce(function (sum, item) { return sum + num(item && item.value); }, 0);
}

function buildTrend(metricKey, span, today, data) {
  var meta = METRICS[metricKey];
  var currentRange = rangeFor(span, today);
  var previousRange = [dateOffset(today, -(span * 2 - 1)), dateOffset(today, -span)];
  var current = metricSum(meta.reader, currentRange, data);
  var previous = metricSum(meta.reader, previousRange, data);
  var series = Analytics.getTrend(meta.reader, currentRange[0], currentRange[1], 'daily', data) || [];
  var activeCurrent = series.filter(function (item) { return num(item && item.value) > 0; }).length;
  var previousSeries = Analytics.getTrend(meta.reader, previousRange[0], previousRange[1], 'daily', data) || [];
  var activePrevious = previousSeries.filter(function (item) { return num(item && item.value) > 0; }).length;
  var nonzero = series.map(function (item) { return num(item && item.value); }).filter(function (value) { return value > 0; });
  var mean = nonzero.length ? nonzero.reduce(function (sum, value) { return sum + value; }, 0) / nonzero.length : 0;
  var variance = mean ? nonzero.reduce(function (sum, value) { return sum + Math.pow(value - mean, 2); }, 0) / nonzero.length : 0;
  var volatility = mean ? Math.round((Math.sqrt(variance) / mean) * 100) : 0;
  var delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0);
  var status = 'insufficient_data';
  if (activePrevious === 0 && activeCurrent === 0) status = 'no_data';
  else if (activePrevious === 0) status = 'new_activity';
  else if (delta >= 20) status = 'rising';
  else if (delta <= -20) status = 'falling';
  else status = volatility >= 90 ? 'volatile' : 'stable';
  return {
    metric: metricKey,
    label: meta.label,
    span: span + 'd',
    current: round(current),
    previous: round(previous),
    delta: delta,
    status: status,
    volatility: volatility,
    insufficientData: status === 'insufficient_data' || status === 'no_data',
    evidence: { currentActiveDays: activeCurrent, previousActiveDays: activePrevious, currentRange: currentRange, previousRange: previousRange }
  };
}

function domain(name, status, confidence, summary, evidence) {
  return {
    name: name,
    status: status,
    confidence: confidence,
    insufficientData: status === 'insufficient_data',
    summary: summary || {},
    evidence: evidence || []
  };
}

function trendForRange(trends, span, metricKey) {
  return (trends[span + 'd'] && trends[span + 'd'][metricKey]) || null;
}

function stateFromTrend(trend) {
  if (!trend || trend.insufficientData) return 'insufficient_data';
  if (trend.status === 'rising' || trend.status === 'new_activity') return 'improving';
  if (trend.status === 'falling') return 'declining';
  if (trend.status === 'volatile') return 'volatile';
  return 'stable';
}

function buildGoalSignals(goals, data, today) {
  var progress = GoalEngine.computeGoalsProgress(arr(goals), data, { today: today });
  var buckets = GoalEngine.classifyGoals(progress);
  var active = buckets.active || [];
  var atRisk = active.filter(function (item) {
    return item && !item.isComplete && (num(item.daysRemaining) <= 7 ? pct(item.percentage) < 60 : pct(item.percentage) < 20);
  });
  return {
    active: active.length,
    completed: (buckets.completed || []).length,
    expired: (buckets.expired || []).length,
    atRisk: atRisk.length,
    risk: atRisk.slice(0, 3).map(function (item) {
      return {
        id: str(item.goal && item.goal.id),
        title: str(item.goal && item.goal.title),
        percentage: pct(item.percentage),
        daysRemaining: num(item.daysRemaining),
        remaining: num(item.remaining)
      };
    })
  };
}

function buildSignals(data, today, trends, todoToday, course, goalSignals) {
  var risks = [];
  var positives = [];
  if (todoToday.overdue > 0) risks.push({ type: 'todo_overdue', severity: 'high', reason: '有 ' + todoToday.overdue + ' 项逾期任务', evidence: { overdue: todoToday.overdue } });
  if (todoToday.total >= 4 && todoToday.completionRate < 50) risks.push({ type: 'todo_backlog', severity: 'medium', reason: '近期待办完成率偏低，当前还有 ' + todoToday.pending + ' 项未完成', evidence: { pending: todoToday.pending, completionRate: todoToday.completionRate } });
  if (course.pending > 0 && course.lowProgressCount > 0) risks.push({ type: 'course_progress_low', severity: 'medium', reason: course.lowProgressCount + ' 门进行中课程进度低于 40%', evidence: { lowProgressCount: course.lowProgressCount } });
  var focus30 = trendForRange(trends, 30, 'focus');
  if (focus30 && focus30.status === 'falling') risks.push({ type: 'focus_declining', severity: 'medium', reason: '最近 30 天专注时长下降 ' + Math.abs(focus30.delta) + '%', evidence: { current: focus30.current, previous: focus30.previous, delta: focus30.delta } });
  var english30 = trendForRange(trends, 30, 'english');
  if (english30 && english30.status === 'falling') risks.push({ type: 'english_break', severity: 'medium', reason: '最近 30 天英语学习下降 ' + Math.abs(english30.delta) + '%', evidence: { current: english30.current, previous: english30.previous, delta: english30.delta } });
  goalSignals.risk.forEach(function (goal) {
    risks.push({ type: 'goal_risk', severity: goal.daysRemaining <= 3 ? 'high' : 'medium', reason: '目标「' + goal.title + '」进度 ' + goal.percentage + '%，剩余 ' + goal.daysRemaining + ' 天', evidence: { goalId: goal.id, percentage: goal.percentage, daysRemaining: goal.daysRemaining } });
  });
  if (todoToday.completionRate >= 80 && todoToday.total >= 3) positives.push({ type: 'execution_momentum', reason: '今日任务完成率 ' + todoToday.completionRate + '%', evidence: { completionRate: todoToday.completionRate } });
  if (focus30 && focus30.status === 'rising') positives.push({ type: 'focus_habit_forming', reason: '最近 30 天专注时长上升 ' + focus30.delta + '%', evidence: { delta: focus30.delta } });
  if (english30 && english30.status === 'rising') positives.push({ type: 'english_momentum', reason: '最近 30 天英语学习上升 ' + english30.delta + '%', evidence: { delta: english30.delta } });
  if (course.pending > 0 && course.avgProgress >= 60) positives.push({ type: 'course_stable', reason: '课程平均进度已达 ' + course.avgProgress + '%', evidence: { avgProgress: course.avgProgress } });
  if (goalSignals.completed > 0) positives.push({ type: 'goal_achieved', reason: '已有 ' + goalSignals.completed + ' 个目标达成', evidence: { completed: goalSignals.completed } });
  return { risks: risks, positives: positives };
}

function recommendedFocus(signals, todoToday) {
  var order = { high: 3, medium: 2, low: 1 };
  var candidates = signals.risks.slice().sort(function (a, b) { return (order[b.severity] || 0) - (order[a.severity] || 0); }).slice(0, 2);
  if (!candidates.length && todoToday.total > 0 && todoToday.pending > 0) {
    candidates.push({ type: 'todo_backlog', severity: 'low', reason: '先完成今日待办，再安排新增投入', evidence: { pending: todoToday.pending } });
  }
  if (!candidates.length && signals.positives.length) {
    candidates.push({ type: 'keep_momentum', severity: 'low', reason: '保持当前节奏，优先记录今天的一次专注', evidence: { positiveType: signals.positives[0].type } });
  }
  return candidates;
}

function buildActionProposals(data, today, signals, todoToday, goalSignals) {
  var proposals = [];
  if (!signals.risks.length && !signals.positives.length) return proposals;
  if (todoToday.overdue > 0 || todoToday.pending > 0) {
    proposals.push({ id: 'today-critical-todo', type: 'add_todo', title: '先完成一件最重要的待办', date: today, priority: 'high', why: signals.risks[0] ? signals.risks[0].reason : '今日还有未完成任务', evidence: { pending: todoToday.pending, overdue: todoToday.overdue }, requiresConfirmation: true });
  }
  if (signals.risks.some(function (risk) { return risk.type === 'focus_declining'; })) {
    proposals.push({ id: 'focus-recovery', type: 'add_todo', title: '安排一次 15 分钟专注', date: today, priority: 'high', why: '最近专注趋势下降，先用短周期重启节奏', evidence: { metric: 'focus', span: '30d' }, requiresConfirmation: true });
  }
  if (signals.risks.some(function (risk) { return risk.type === 'english_break'; })) {
    proposals.push({ id: 'english-restart', type: 'add_todo', title: '做 10 分钟英语练习', date: today, priority: 'medium', why: '最近英语学习趋势下降，需要先恢复连续性', evidence: { metric: 'english', span: '30d' }, requiresConfirmation: true });
  }
  if (goalSignals.risk.length) {
    proposals.push({ id: 'review-risk-goal', type: 'review_goal', title: '复核最可能落后的目标', why: goalSignals.risk[0].title + ' 进度偏低', evidence: { goalId: goalSignals.risk[0].id }, requiresConfirmation: true });
  }
  if (!proposals.length) {
    proposals.push({ id: 'keep-positive-focus', type: 'add_todo', title: '延续一次有效专注', date: today, priority: 'normal', why: '当前有正向趋势，适合维持节奏', evidence: { positiveType: signals.positives[0].type }, requiresConfirmation: true });
  }
  return proposals.slice(0, 3);
}

function computeGrowthState(data, opts) {
  opts = opts || {};
  var rawSnapshot = (data && typeof data === 'object') ? data : (CGStore.get ? CGStore.get() : {});
  var today = opts.today || todayStr();
  var cache = cacheKey(rawSnapshot, today);
  if (cache && stateCache.key === cache) return stateCache.state;
  var snap = normalizeSnapshot(rawSnapshot);
  var trends = {};
  SPANS.forEach(function (span) {
    trends[span + 'd'] = {};
    Object.keys(METRICS).forEach(function (metricKey) {
      trends[span + 'd'][metricKey] = buildTrend(metricKey, span, today, snap);
    });
  });
  var todaySummary = Analytics.getDateRangeSummary(today, today, snap) || {};
  var todoToday = Analytics.getTodoSummary(today, today, snap, today) || { total: 0, done: 0, pending: 0, overdue: 0, completionRate: 0 };
  var study30 = Analytics.getStudySummary(rangeFor(30, today)[0], today, snap) || {};
  var focus30 = Analytics.getFocusSummary(rangeFor(30, today)[0], today, snap) || {};
  var exercise30 = Analytics.getExerciseSummary(rangeFor(30, today)[0], today, snap) || {};
  var courses = arr(snap.courses);
  var doingCourses = courses.filter(function (course) { return course && course.status !== 'done' && course.status !== 'completed'; });
  var lowProgressCount = doingCourses.filter(function (course) { return num(course.progress) < 40; }).length;
  var avgProgress = courses.length ? Math.round(courses.reduce(function (sum, course) { return sum + num(course.progress); }, 0) / courses.length) : 0;
  var goalSignals = buildGoalSignals(arr(snap.goals), snap, today);
  var streaks = Analytics.getStreaks(snap, { today: today });
  var signals = buildSignals(snap, today, trends, todoToday, {
    total: courses.length,
    pending: doingCourses.length,
    lowProgressCount: lowProgressCount,
    avgProgress: avgProgress
  }, goalSignals);
  var trendState = {
    direction: stateFromTrend(trendForRange(trends, 30, 'activity')),
    windows: trends,
    importantChanges: SPANS.slice().reverse().map(function (span) {
      return Object.keys(METRICS).map(function (metricKey) { return trendForRange(trends, span, metricKey); }).filter(function (trend) { return trend && !trend.insufficientData && Math.abs(trend.delta) >= 20; });
    }).reduce(function (all, items) { return all.concat(items); }, []).slice(0, 6)
  };
  var learningTrend = trendForRange(trends, 30, 'study');
  var focusTrend = trendForRange(trends, 30, 'focus');
  var englishTrend = trendForRange(trends, 30, 'english');
  var exerciseTrend = trendForRange(trends, 30, 'exercise');
  var activeDays30 = (trendForRange(trends, 30, 'activity') || {}).current || 0;
  var workloadStatus = 'insufficient_data';
  if (todoToday.total > 0) workloadStatus = todoToday.pending >= 6 || todoToday.overdue > 0 ? 'high' : (todoToday.pending <= 3 ? 'balanced' : 'moderate');
  var consistencyStatus = activeDays30 === 0 ? 'insufficient_data' : (activeDays30 >= 12 ? 'strong' : (activeDays30 >= 5 ? 'building' : 'interrupted'));
  var learningStatus = (study30 && study30.minutes > 0) ? ((learningTrend && learningTrend.status === 'falling') ? 'declining' : ((study30.minutes >= 300 || activeDays30 >= 12) ? 'strong' : 'stable')) : 'insufficient_data';
  var focusStatus = (focus30 && focus30.minutes > 0) ? ((focusTrend && focusTrend.status === 'falling') ? 'declining' : ((focus30.minutes >= 180 || activeDays30 >= 12) ? 'strong' : 'stable')) : 'insufficient_data';
  var englishStatus = (study30 && study30.englishMinutes > 0) ? ((englishTrend && englishTrend.status === 'falling') ? 'declining' : 'stable') : 'insufficient_data';
  var readingStatus = (study30 && study30.readingPages > 0) ? 'stable' : 'insufficient_data';
  var exerciseStatus = (exercise30 && exercise30.minutes > 0) ? ((exerciseTrend && exerciseTrend.status === 'falling') ? 'declining' : 'stable') : 'insufficient_data';
  var courseStatus = !courses.length ? 'insufficient_data' : (lowProgressCount > 0 || avgProgress < 40 ? 'needs_attention' : 'stable');
  var goalStatus = !goalSignals.active && !goalSignals.completed ? 'insufficient_data' : (goalSignals.atRisk ? 'needs_attention' : 'stable');
  var executionStatus = todoToday.total === 0 ? 'insufficient_data' : (todoToday.completionRate >= 80 ? 'strong' : (todoToday.completionRate >= 40 ? 'stable' : 'needs_attention'));
  var domains = {
    learningState: domain('learning', learningStatus, activeDays30 >= 7 ? 'medium' : 'low', { minutes30: round(study30.minutes || 0), activeDays30: activeDays30 }, ['Analytics.getStudySummary']),
    executionState: domain('execution', executionStatus, todoToday.total ? 'high' : 'low', todoToday, ['Analytics.getTodoSummary']),
    focusState: domain('focus', focusStatus, activeDays30 >= 7 ? 'medium' : 'low', { minutes30: round(focus30.minutes || 0), sessions30: num(focus30.sessions) }, ['Analytics.getFocusSummary']),
    englishState: domain('english', englishStatus, activeDays30 >= 7 ? 'medium' : 'low', { minutes30: round(study30.englishMinutes || 0), words30: round(study30.words || 0) }, ['Analytics.getStudySummary']),
    readingState: domain('reading', readingStatus, activeDays30 >= 7 ? 'medium' : 'low', { pages30: round(study30.readingPages || 0) }, ['Analytics.getStudySummary']),
    exerciseState: domain('exercise', exerciseStatus, activeDays30 >= 7 ? 'medium' : 'low', exercise30, ['Analytics.getExerciseSummary']),
    courseState: domain('course', courseStatus, courses.length ? 'high' : 'low', { total: courses.length, doing: doingCourses.length, avgProgress: avgProgress, lowProgressCount: lowProgressCount }, ['CGStore.courses']),
    goalState: domain('goal', goalStatus, goalSignals.active || goalSignals.completed ? 'high' : 'low', goalSignals, ['GoalEngine.computeGoalsProgress']),
    workloadState: domain('workload', workloadStatus, todoToday.total ? 'high' : 'low', todoToday, ['Analytics.getTodoSummary']),
    consistencyState: domain('consistency', consistencyStatus, activeDays30 ? 'medium' : 'low', { activeDays30: activeDays30, currentStreak: streaks.currentStreak, longestStreak: streaks.longestStreak, todayDone: streaks.todayDone }, ['Analytics.getStreaks'])
  };
  var dataSufficiency = {
    overall: activeDays30 > 0 || courses.length > 0 || goalSignals.active > 0,
    activeDays30: activeDays30,
    courses: courses.length,
    activeGoals: goalSignals.active,
    minimumRecommendedDays: 7
  };
  var overallStatus = !dataSufficiency.overall ? 'insufficient_data' : (signals.risks.some(function (risk) { return risk.severity === 'high'; }) ? 'needs_attention' : (signals.positives.length >= 2 ? 'improving' : 'stable'));
  var focus = recommendedFocus(signals, todoToday);
  var proposals = buildActionProposals(snap, today, signals, todoToday, goalSignals);
  var state = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    today: today,
    overall: overallStatus,
    learningState: domains.learningState,
    executionState: domains.executionState,
    focusState: domains.focusState,
    englishState: domains.englishState,
    readingState: domains.readingState,
    exerciseState: domains.exerciseState,
    courseState: domains.courseState,
    goalState: domains.goalState,
    workloadState: domains.workloadState,
    consistencyState: domains.consistencyState,
    trendState: trendState,
    riskSignals: signals.risks,
    positiveSignals: signals.positives,
    recommendedFocus: focus,
    actionProposals: proposals,
    dataSufficiency: dataSufficiency
  };
  if (cache) {
    stateCache.key = cache;
    stateCache.state = state;
  }
  return state;
}

function buildDailyInsight(data, opts) {
  var state = computeGrowthState(data, opts);
  var insufficient = state.overall === 'insufficient_data';
  return {
    version: VERSION,
    date: state.today,
    dataSufficient: !insufficient,
    status: insufficient ? '当前数据不足，暂时无法判断成长趋势。' : (state.overall === 'needs_attention' ? '今天需要优先处理执行风险。' : (state.overall === 'improving' ? '你的成长节奏正在改善。' : '状态总体稳定。')),
    changes: state.trendState.importantChanges.slice(0, 3),
    concern: state.riskSignals[0] || null,
    strength: state.positiveSignals[0] || null,
    recommendedActions: state.actionProposals,
    why: insufficient ? '没有足够的连续记录或目标数据。' : (state.recommendedFocus[0] ? state.recommendedFocus[0].reason : '当前没有高风险信号。'),
    growthState: state
  };
}

function buildGrowthProfile(data, opts) {
  var state = computeGrowthState(data, opts);
  var stableHabits = [];
  if (num(state.consistencyState.summary.activeDays30) >= 5) stableHabits.push('活跃记录');
  if (num(state.focusState.summary.minutes30) > 0) stableHabits.push('专注练习');
  if (num(state.englishState.summary.minutes30) > 0) stableHabits.push('英语学习');
  if (num(state.readingState.summary.pages30) > 0) stableHabits.push('阅读');
  if (num(state.exerciseState.summary.minutes30) > 0) stableHabits.push('运动');
  return {
    version: VERSION,
    derivedAt: new Date().toISOString(),
    currentFocus: state.recommendedFocus.map(function (item) { return item.reason; }),
    stableHabits: stableHabits,
    commonRisks: state.riskSignals.map(function (risk) { return risk.type; }),
    effectiveStrategies: state.positiveSignals.map(function (signal) { return signal.type; }),
    bestTimeSlots: [],
    bestTimeSlotsAvailable: false,
    source: 'derived_profile',
    dataSufficiency: state.dataSufficiency
  };
}

function buildWeeklyReview(data, opts, coachContext) {
  opts = opts || {};
  var today = opts.today || todayStr();
  var snap = normalizeSnapshot((data && typeof data === 'object') ? data : (CGStore.get ? CGStore.get() : {}));
  var currentRange = Analytics.thisWeek(today);
  var previousRange = [dateOffset(currentRange[0], -7), dateOffset(currentRange[0], -1)];
  var current = Analytics.getDateRangeSummary(currentRange[0], currentRange[1], snap) || {};
  var previous = Analytics.getDateRangeSummary(previousRange[0], previousRange[1], snap) || {};
  var state = computeGrowthState(snap, { today: today });
  var trends = state.trendState.windows['7d'];
  var changes = ['study', 'focus', 'english', 'exercise', 'reading', 'activity'].map(function (key) { return trends[key]; }).filter(Boolean);
  var positive = changes.filter(function (trend) { return trend.status === 'rising'; }).sort(function (a, b) { return b.delta - a.delta; })[0] || null;
  var concern = state.riskSignals[0] || null;
  var possibleCauses = [];
  if (concern && concern.type === 'todo_backlog') possibleCauses.push('今日待办数量与完成率变化可能与任务负荷相关。');
  if (concern && concern.type === 'focus_declining') possibleCauses.push('专注时长趋势下降，可能与连续执行节奏相关。');
  if (concern && concern.type === 'course_progress_low') possibleCauses.push('低进度课程数量较多，可能与投入分布相关。');
  if (!possibleCauses.length && !state.dataSufficiency.overall) possibleCauses.push('数据不足，不能判断原因。');
  var dataSufficient = state.dataSufficiency.overall && (current.activity ? current.activity.activeDays > 0 : false);
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    range: { start: currentRange[0], end: currentRange[1] },
    dataSufficient: dataSufficient,
    performance: {
      activeDays: current.activity ? current.activity.activeDays : 0,
      previousActiveDays: previous.activity ? previous.activity.activeDays : 0,
      studyMinutes: current.study ? current.study.minutes : 0,
      focusMinutes: current.focus ? current.focus.minutes : 0,
      todosCompleted: current.todos ? current.todos.done : 0,
      todosTotal: current.todos ? current.todos.total : 0
    },
    importantChanges: changes.filter(function (trend) { return !trend.insufficientData && Math.abs(trend.delta) >= 20; }).slice(0, 4),
    biggestProgress: positive,
    mainProblem: concern,
    possibleCauses: possibleCauses,
    goals: state.goalState.summary,
    recommendations: state.actionProposals,
    nextFocus: state.recommendedFocus,
    feedbackSummary: (coachContext && coachContext.feedbackSummary) || [],
    memoryFacts: (coachContext && coachContext.facts) || [],
    evidenceSources: ['Analytics.getDateRangeSummary', 'GrowthIntelligence.computeGrowthState', 'GoalEngine.computeGoalsProgress', 'CoachMemory']
  };
}

var GrowthIntelligence = {
  VERSION: VERSION,
  computeGrowthState: computeGrowthState,
  buildDailyInsight: buildDailyInsight,
  buildGrowthProfile: buildGrowthProfile,
  buildWeeklyReview: buildWeeklyReview
};

globalThis.CGGrowthIntelligence = GrowthIntelligence;
export default GrowthIntelligence;
export { computeGrowthState, buildDailyInsight, buildGrowthProfile, buildWeeklyReview };
