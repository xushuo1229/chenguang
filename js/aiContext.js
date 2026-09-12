/**
 * 晨光自律台 · AI Context Builder (Phase 13)
 * ============================================================
 * 架构落点：
 *
 *   CGAnalytics + Goal Engine
 *        ↓
 *   AI Context Builder（本文件）
 *        ↓
 *   结构化 AI Context（版本化 JSON，发给后端 → Provider）
 *
 * 【职责】
 *   - 从 CGAnalytics / Goal Engine 聚合出「晨光 AI 教练」需要的结构化上下文。
 *   - 内置确定性洞察层（Insights / Risk Detector）：目标风险、趋势下滑、
 *     强习惯、异常、机会——基础统计由规则引擎做，AI 只负责「解释」和「建议」。
 *   - 应用层 Context 预算控制（estimateTokens / trimContextToBudget），
 *     即使用户积累一年数据也不会把全量历史发给模型。
 *
 * 【铁律】
 *   - 本文件「只读」：绝不写 Store / localStorage / revision++。
 *   - 只复用 CGAnalytics / Goal Engine 的统计口径，绝不重写第二套算法。
 *   - 不发送用户原始 Todo / 课程 / 笔记全文（除非显式开启，且打上 untrustedUserContent）。
 *
 *  测试见 tests/aiContext.test.js（含 revision +0 不变性断言）。
 * ------------------------------------------------------------
 */
'use strict';

import CGStore from './store.js';
import Analytics, { isValidDateStr } from './analytics.js';
import GoalEngine from './goals.js';
import { todayStr, dateOffset } from './utils/date.js';

/* ====================================================================
   常量
   ==================================================================== */

/** Context Schema 版本（与后端校验一致，见 backend/.../aiService.js） */
var VERSION = '1.0';

/** 课程最多传入门数（超出按风险/低进度/活跃度有限筛选） */
var MAX_COURSES = 20;
/** 用户请求分析 Todo 原文时才传，最多 10 条，且都标记 untrusted */
var MAX_TODO_ITEMS = 10;
/** 上下文总量预算（token 估算） */
var MAX_CONTEXT_TOKENS = 6000;
/** insights 中「机会」等可压缩条目上限 */
var MAX_INSIGHTS = 12;

/** 快捷趋势窗口 */
var D7 = 7;
var D30 = 30;

/* ====================================================================
   数值 / 数组 防御工具
   ==================================================================== */

function _num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
function _arr(v) { return Array.isArray(v) ? v : []; }
function _str(v) { return v == null ? '' : String(v); }
function _round(v) { return Math.round(_num(v) * 10) / 10; }

/* ====================================================================
   Token 估算（轻量，不引入大型 tokenizer）
   ==================================================================== */

/**
 * estimateTokens(str) —— 估算一段文本大概消耗的 token 数。
 * 中文/全角字符按 1 token/1.5 字符，ASCII 按 1 token/4 字符，
 * 加权求和。纯启发式，用于预算裁剪，不追求精确。
 */
function estimateTokens(str) {
  if (typeof str !== 'string' || !str.length) return 0;
  var cjk = 0; var ascii = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c >= 0x2E80 && c <= 0x9FFF) cjk++;       // 常见 CJK 区段
    else if (c > 0x00FF) cjk++;                   // 其他多字节（Kana/Hangul 等）近似
    else ascii++;
  }
  return Math.ceil(cjk / 1.5 + ascii / 4);
}

/** estimateContextTokens(obj) —— JSON 序列化后估算整体 token（含键名/数字）。 */
function estimateContextTokens(obj) {
  try { return estimateTokens(JSON.stringify(obj)); }
  catch (_) { return 0; }
}

/* ====================================================================
   趋势窗口
   ==================================================================== */

/**
 * metricAgg(metric, range, snap) —— 用 Analytics.getTrend 求某指标在某区间总和。
 * 复用 Analytics 逐日读写器，不自己扫描原始记录。
 */
function metricAgg(metric, range, snap) {
  var out = { sum: 0, days: 0 };
  if (!range || !isValidDateStr(range[0]) || !isValidDateStr(range[1])) return out;
  var series = Analytics.getTrend(metric, range[0], range[1], 'daily', snap) || [];
  series.forEach(function (p) { var v = _num(p && p.value); out.sum += v; if (v > 0) out.days++; });
  out.sum = _round(out.sum);
  return out;
}

/**
 * buildTrend(metric, cur, prev) —— 构造带环比的趋势对象。
 * delta 单位 %（正=上升，负=下降）。上一期无数据时，cur>0 记为 +100。
 */
function buildTrend(metric, cur, prev) {
  var delta;
  if (prev > 0) delta = Math.round(((cur - prev) / prev) * 100);
  else delta = (cur > 0) ? 100 : 0;
  return { metric: metric, current: _round(cur), previous: _round(prev), delta: delta };
}

/* ====================================================================
   主构建入口
   ==================================================================== */

/**
 * buildContext(data, opts) —— 生成完整结构化 AI Context。
 * @param {Object} [data]  数据快照（缺省用 CGStore.get()——只读）
 * @param {Object} [opts]  { today } 可注入，测试确定性；{ includeTodoText } 仅当用户显式要求时才含 Todo 原文
 * @returns {Object} 符合 Phase 13 Context Schema 的对象
 */
function buildContext(data, opts) {
  opts = opts || {};
  var snap = (data && typeof data === 'object') ? data : (CGStore.get ? CGStore.get() : {});
  var today = isValidDateStr(opts.today) ? opts.today : todayStr();
  var generatedAt = new Date().toISOString();

  /* ---- 窗口 ---- */
  var w7 = [dateOffset(today, -(D7 - 1)), today];            // 近 7 天
  var w7Prev = [dateOffset(today, -(2 * D7 - 1)), dateOffset(today, -D7)]; // 上个 7 天
  var w30 = [dateOffset(today, -(D30 - 1)), today];
  var w30Prev = [dateOffset(today, -(2 * D30 - 1)), dateOffset(today, -D30)];

  /* ---- 一次 snapshot 全量统计 ---- */
  var day7 = Analytics.getDateRangeSummary(w7[0], w7[1], snap);
  var study7 = Analytics.getStudySummary(w7[0], w7[1], snap);
  var study30 = Analytics.getStudySummary(w30[0], w30[1], snap);
  var focus7 = Analytics.getFocusSummary(w7[0], w7[1], snap);
  var exercise7 = Analytics.getExerciseSummary(w7[0], w7[1], snap);
  var todos7 = Analytics.getTodoSummary(w7[0], w7[1], snap, today);
  var streaks = Analytics.getStreaks(snap, { today: today });
  var courseLib = Analytics.getCourseSummary(snap); // 课程库概览

  /* 各指标近 7 / 上 7 环比（previous 与 current 同口径，键名取自 Analytics.TREND_READERS） */
  var tFocus = buildTrend('focus', focus7 ? focus7.minutes : 0, metricAgg('focus', w7Prev, snap).sum);
  var tStudy = buildTrend('study', day7 ? day7.study.minutes : 0, metricAgg('study', w7Prev, snap).sum);
  var tExercise = buildTrend('exercise', exercise7 ? exercise7.minutes : 0, metricAgg('exerciseMinutes', w7Prev, snap).sum);
  var tEnglish = buildTrend('english', study7 ? study7.englishMinutes : 0, metricAgg('english', w7Prev, snap).sum);
  var tTodos = buildTrend('todo', todos7 ? todos7.total : 0, metricAgg('todo', w7Prev, snap).sum);

  /* ---- overview ---- */
  var overview = {
    activeDays: (day7 && day7.activity) ? day7.activity.activeDays : 0,
    completionRate: (todos7 && todos7.completionRate != null) ? _num(todos7.completionRate) : 0,
    currentStreak: (streaks && streaks.currentStreak) || 0,
    longestStreak: (streaks && streaks.longestStreak) || 0,
    totalFocusMinutes: (focus7 && focus7.minutes) || 0,
    studyMinutes: (study7 && study7.minutes) || 0
  };

  /* ---- trends ---- */
  var trends = {
    days7: {
      // 口径：current/previous 都是「有记录的天数」（metricAgg.days = 值>0 的天数）
      activity: buildTrend('activity', (day7 && day7.activity) ? day7.activity.activeDays : 0, metricAgg('activity', w7Prev, snap).days),
      study: tStudy, exercise: tExercise, english: tEnglish, focus: tFocus, todos: tTodos
    },
    days30: {
      study: { current: _round(study30 ? study30.minutes : 0), span: '30d' }
    }
  };

  /* ---- 分主题 ---- */
  var english = {
    minutes: (study7 && study7.englishMinutes) || 0,
    words: (study7 && study7.words) || 0,
    activeDays: (day7 && day7.activity) ? day7.activity.activeDays : 0,
    trend: tEnglish
  };
  var focus = {
    minutes: (focus7 && focus7.minutes) || 0,
    activeDays: (day7 && day7.activity) ? day7.activity.activeDays : 0,
    averageDailyMinutes: (day7 && day7.activity && day7.activity.activeDays)
      ? _round(focus7.minutes / Math.max(1, day7.activity.activeDays)) : 0,
    trend: tFocus
  };
  var exercise = {
    minutes: (exercise7 && exercise7.minutes) || 0,
    days: (exercise7 && exercise7.count) || 0,
    calories: (exercise7 && exercise7.calories) || 0,
    trend: tExercise,
    types: exercise7 && exercise7.types ? exercise7.types : {}
  };
  var study = {
    minutes: (study7 && study7.minutes) || 0,
    trend: tStudy,
    activeDays: (day7 && day7.activity) ? day7.activity.activeDays : 0,
    courseCount: _arr(snap.courses).length,
    averageCourseProgress: _num(courseLib && courseLib.avgProgress)
  };

  /* ---- courses（最多 20 门，按风险/进度筛选） ---- */
  var courses = pickCourses(_arr(snap.courses));

  /* ---- todos（默认不带原文；显式开启才带 ≤10 条）+ 优先级分布 ---- */
  var todos = {
    total: (todos7 && todos7.total) || 0,
    completed: (todos7 && todos7.done) || 0,
    completionRate: (todos7 && todos7.completionRate != null) ? _num(todos7.completionRate) : 0,
    overdueOrIncomplete: (todos7 && todos7.pending) || 0,
    priorityDistribution: priorityDistribution(_arr(snap.todos))
  };
  if (opts.includeTodoText) {
    todos.items = _arr(snap.todos).slice(0, MAX_TODO_ITEMS).map(function (t) {
      return { text: _str(t.text), done: !!t.done };
    });
    todos.items.forEach(function (it) { it.__untrustedUserContent = true; });
  }

  /* ---- goals（Phase 12 Goal Engine 派生，只读） ---- */
  var goalsRaw = GoalEngine.computeGoalsProgress(_arr(snap.goals), snap, { today: today });
  var buckets = GoalEngine.classifyGoals(goalsRaw);
  var goals = {
    active: buckets.active.slice(0, 10).map(stripGoal),
    completed: buckets.completed.slice(0, 5).map(stripGoal),
    expired: buckets.expired.slice(0, 5).map(stripGoal)
  };

  /* ---- insights（确定性规则） ---- */
  var insights = buildInsights(buckets, { activeDays: overview.activeDays, currentStreak: overview.currentStreak, longestStreak: overview.longestStreak, trends: trends, courseLib: courseLib, courses: courses, todos: todos }).slice(0, MAX_INSIGHTS);

  /* ---- 组装 Schema ---- */
  var ctx = {
    version: VERSION,
    generatedAt: generatedAt,
    today: today,
    overview: overview,
    trends: trends,
    study: study,
    exercise: exercise,
    english: english,
    focus: focus,
    todos: todos,
    courses: courses,
    goals: goals,
    insights: insights
  };

  return trimContextToBudget(ctx);
}

/* ====================================================================
   课程筛选（最多 MAX_COURSES 门，优先低位者以凸显风险）
   ==================================================================== */

function pickCourses(courses) {
  var out = courses.map(function (c) {
    return {
      id: _str(c.id),
      name: _str(c.name),
      progress: _num(c.progress),
      status: _str(c.status),
      credits: _num(c.credits)
    };
  });
  // 排序：进行中的低进度优先（更能揭示风险），最多保留 MAX_COURSES
  out.sort(function (a, b) {
    var sa = (a.status === 'doing' || !a.status) ? 0 : 1;
    var sb = (b.status === 'doing' || !b.status) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.progress - b.progress;
  });
  return out.slice(0, MAX_COURSES);
}

/* ====================================================================
   目标裁剪（只透传允许字段；进度字面由 Goal Engine 派生）
   ==================================================================== */

function stripGoal(p) {
  var g = (p && p.goal) || {};
  return {
    id: _str(g.id),
    title: _str(g.title),
    type: _str(g.type),
    metric: _str(g.metric),
    targetValue: _num(g.targetValue),
    currentValue: _num(p.currentValue),
    percentage: Math.round(_num(p.percentage)),
    remaining: _num(p.remaining),
    period: _str(g.period),
    startDate: _str(g.startDate),
    endDate: _str(g.endDate),
    status: p.status || 'active'
  };
}

/* ====================================================================
   优先级分布（仅当 Todo 上带 priority 字段才统计，否则空对象）
   ==================================================================== */

function priorityDistribution(todos) {
  var dist = { high: 0, medium: 0, low: 0 };
  var has = false;
  todos.forEach(function (t) {
    var pr = _str(t.priority).toLowerCase();
    if (pr === 'high') { dist.high++; has = true; }
    else if (pr === 'medium' || pr === 'mid') { dist.medium++; has = true; }
    else if (pr === 'low') { dist.low++; has = true; }
  });
  return has ? dist : {};
}

/* ====================================================================
   确定性洞察层（Insights / Risk Detector）
   ==================================================================== */

/**
 * buildInsights(buckets, info) —— 规则引擎：确定性数据问题在“这里”算，
 * 解释与行动建议交给 AI。
 * 返回 [{ type, severity, title?, reason, goalId?, metric? }]。
 */
function buildInsights(buckets, info) {
  var out = [];
  var active = (buckets && buckets.active) || [];

  /* 目标风险：进行中的目标，剩余时间不足而进度偏低 */
  active.forEach(function (p) {
    if (!p || p.isComplete) return;
    var g = p.goal || {};
    if (g.period === 'daily') return;   // 每日目标循环重算，没有「剩余时间不足」概念，不产生误报
    var pct = _num(p.percentage);
    var dr = _num(p.daysRemaining);
    var severity = null; var reason = '';
    if (p.isExpired || (dr <= 2 && pct < 100)) {
      severity = 'high';
      reason = '目标「' + _str(g.title) + '」剩余时间不足仍差 ' + _round(p.remaining) + '，很可能无法按期达成';
    } else if (dr <= 5 && pct < 60) {
      severity = 'medium';
      reason = '目标「' + _str(g.title) + '」剩余 ' + dr + ' 天但进度仅 ' + Math.round(pct) + '%';
    } else if (dr <= 7 && pct < 40) {
      severity = 'low';
      reason = '目标「' + _str(g.title) + '」进度偏低（' + Math.round(pct) + '%）';
    }
    if (severity) out.push({ type: 'goal_risk', severity: severity, goalId: _str(g.id), title: _str(g.title), reason: reason, percentage: Math.round(pct), daysRemaining: dr });
  });

  /* 趋势下滑 */
  var declines = ['study', 'exercise', 'english', 'focus'].filter(function (m) {
    var t = info.trends && info.trends.days7 && info.trends.days7[m];
    return t && t.previous > 0 && t.delta <= -30;
  });
  declines.forEach(function (m) {
    var t = info.trends.days7[m];
    out.push({ type: 'declining_trend', severity: 'medium', metric: m, reason: LABELS[m] + '较上一周下滑 ' + Math.abs(t.delta) + '%' });
  });

  /* 强习惯 */
  if (info.currentStreak >= 3) {
    out.push({ type: 'strong_habit', severity: 'positive', reason: '已连续自律 ' + info.currentStreak + ' 天，习惯坚持得很稳' });
  } else if (info.longestStreak >= 7 && info.currentStreak > 0) {
    out.push({ type: 'strong_habit', severity: 'positive', reason: '近况不错，正在追回之前 ' + info.longestStreak + ' 天的最长连续记录' });
  }
  if (info.activeDays >= 5) {
    out.push({ type: 'strong_habit', severity: 'positive', reason: '本周 ' + info.activeDays + ' 天保持活跃，节奏很好' });
  }

  /* 机会：进行中但进度过低的课程，提示优先投入 */
  if (info.courses && info.courses.length) {
    info.courses.slice(0, 3).forEach(function (c) {
      if ((c.status === 'doing' || !c.status) && c.progress < 40 && c.progress >= 0 && c.credits > 0) {
        out.push({ type: 'opportunity', severity: 'low', reason: '课程「' + c.name + '」进度仅 ' + Math.round(c.progress) + '%，建议优先补足' });
      }
    });
  }

  /* 异常：数据大幅波动（近 7 天几乎归零而上一期有量） */
  ['study', 'exercise', 'english', 'focus'].forEach(function (m) {
    var t = info.trends && info.trends.days7 && info.trends.days7[m];
    if (t && t.previous >= 30 && t.current === 0) {
      out.push({ type: 'anomaly', severity: 'medium', metric: m, reason: LABELS[m] + '本周中断，和上周相比落差明显' });
    }
  });

  return out;
}

/* metric → 中文标签 */
var LABELS = {
  study: '学习时长', exercise: '运动时长', english: '英语学习', focus: '专注时长', activity: '活跃天数'
};

/* ====================================================================
   Context 预算控制
   ==================================================================== */

/**
 * trimContextToBudget(ctx, maxTokens) —— 轻量裁剪：优先保留 Level A
 * （today / overview / 7天趋势 / active goals / risks），
 * 空间不足时先丢 days30、弱化 insights，再超则丢 Level C 原文。
 * 始终返回一个干净的纯对象（不修改入参）。
 */
function trimContextToBudget(ctx, maxTokens) {
  maxTokens = maxTokens || MAX_CONTEXT_TOKENS;
  if (!ctx || typeof ctx !== 'object') return ctx || {};
  var out = JSON.parse(JSON.stringify(ctx));

  if (estimateContextTokens(out) <= maxTokens) return out;

  // 1) 丢弃 30 天趋势（Level B 里的最次要项）
  if (out.trends) out.trends.days30 = null;
  if (estimateContextTokens(out) <= maxTokens) return out;

  // 2) 收缩 insights：只留 high / 前几条
  if (Array.isArray(out.insights)) {
    var keep = out.insights.filter(function (i) { return i.severity === 'high'; });
    out.insights = keep.slice(0, 4);
  }
  if (estimateContextTokens(out) <= maxTokens) return out;

  // 3) 再收窄 courses 到 8 门、goals 到 active 8
  if (Array.isArray(out.courses) && out.courses.length > 8) out.courses = out.courses.slice(0, 8);
  if (out.goals && Array.isArray(out.goals.active) && out.goals.active.length > 8) out.goals.active = out.goals.active.slice(0, 8);
  if (estimateContextTokens(out) <= maxTokens) return out;

  // 4) 丢弃 todos.items（Level C 原文）
  if (out.todos && out.todos.items) { out.todos.items = null; }
  if (estimateContextTokens(out) <= maxTokens) return out;

  // 5) 终极兜底：极限收窄（正常数据到不了这里；保证预算承诺尽量兑现）
  if (Array.isArray(out.courses)) out.courses = out.courses.slice(0, 5);
  if (Array.isArray(out.insights)) out.insights = out.insights.slice(0, 2);
  if (out.goals) {
    if (Array.isArray(out.goals.active)) out.goals.active = out.goals.active.slice(0, 5);
    out.goals.completed = [];
    out.goals.expired = [];
  }
  return out;
}

/* ====================================================================
   便捷：UI 判定数据是否足够丰富
   ==================================================================== */

/**
 * hasEvidence(context) —— 判定当前是否有足够数据可供教练分析（UI 空态判断）。
 */
function hasEvidence(context) {
  if (!context) return false;
  var o = context.overview || {};
  var c = context.courses || [];
  var g = context.goals || {};
  return o.totalFocusMinutes > 0 || o.studyMinutes > 0 || o.activeDays > 0 ||
    (o.currentStreak > 0) || c.length > 0 || (g.active && g.active.length > 0);
}

/* ====================================================================
   导出
   ==================================================================== */

var AIContext = {
  VERSION: VERSION,
  MAX_COURSES: MAX_COURSES,
  MAX_TODO_ITEMS: MAX_TODO_ITEMS,
  MAX_CONTEXT_TOKENS: MAX_CONTEXT_TOKENS,
  estimateTokens: estimateTokens,
  estimateContextTokens: estimateContextTokens,
  buildContext: buildContext,
  trimContextToBudget: trimContextToBudget,
  buildInsights: buildInsights,
  hasEvidence: hasEvidence
};

globalThis.CGAIContext = AIContext;

export default AIContext;
export {
  estimateTokens, estimateContextTokens, buildContext, trimContextToBudget,
  buildInsights, hasEvidence,
  VERSION, MAX_COURSES
};