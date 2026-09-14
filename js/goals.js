/**
 * 知行 · Goal Engine (ES Module)
 * --------------------------------------------------------------------------
 * 目标系统「唯一事实来源」：
 *
 *   用户行为数据 (checkins/focus/sports/...)
 *        ↓
 *   CGStore（业务数据：goals 定义在这里）
 *        ↓
 *   CGAnalytics（统计 Truth Source）
 *        ↓
 *   Goal Engine（本文件）→ 目标进度（派生结果，NEW OBJECT）
 *        ↓
 *   Goals UI
 *
 * 【铁律】
 *   - 本文件是「纯计算」：只接收数据、返回新对象。
 *   - 禁止 CGStore.set / localStorage / revision++。
 *   - 禁止自己扫描原始记录算 focus/sports/english……一律委托 CGAnalytics。
 *   - 进度 / currentValue / percentage / remaining 都是派生值，从不写回 Store。
 *   - 状态（completed/expired）按事实派生，只有 archived 是用户主动持久化的生命周期。
 *
 * 时间范围：
 *   复用 CGAnalytics 的 thisWeek / thisMonth 与 utils/date.js 的今天/偏移能力，
 *   不新写第二套星期/月份算法；不使用浏览器 UTC 字符串解析业务日期。
 * --------------------------------------------------------------------------
 */
'use strict';

import CGStore from './store.js';
import Analytics, { isValidDateStr } from './analytics.js';
import { todayStr } from './utils/date.js';

/* ====================================================================
   类型 / 指标 / 周期 常量（表单与校验共用同一张表，避免两份口径）
   ==================================================================== */

/** 每种 type 允许的 metric（只放现有 Analytics 可靠支持的口径） */
var TYPE_METRICS = {
  focus: ['minutes', 'count'],
  exercise: ['minutes', 'count'],
  reading: ['pages'],
  english: ['minutes', 'words'],
  todo: ['count'],
  checkin: ['days'],
  // 课程：仅可靠库级口径（已完成数 / 平均进度%），不用「出勤/周完成」这类无据指标
  course: ['count', 'progress']
};

/** type 中文名 */
var TYPE_LABELS = {
  focus: '专注', exercise: '运动', reading: '阅读', english: '英语',
  todo: '待办', checkin: '打卡', course: '课程'
};

/** metric 中文名（含单位示意） */
var METRIC_LABELS = {
  minutes: '分钟', count: '次数', pages: '页', words: '单词', days: '天', progress: '进度(%)'
};

/** period 中文名 */
var PERIOD_LABELS = { daily: '每日', weekly: '每周', monthly: '每月', custom: '自定义' };

/** 自定义范围硬上限（与 Phase 11 统计上限一致，防创建几十年目标拖垮扫描） */
var MAX_CUSTOM_DAYS = 733;

var VALID_PERIODS = ['daily', 'weekly', 'monthly', 'custom'];

/* ====================================================================
   日期工具（复用 project date.js 语义：本地解析，无 UTC 穿越）
   ==================================================================== */

/** 两个 YYYY-MM-DD 的天数差（b - a；用本地时间解析，与 date.js 一致） */
function diffDays(a, b) {
  var da = new Date(String(a || '').slice(0, 10) + 'T00:00:00');
  var db = new Date(String(b || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/* isValidDateStr 复用 Analytics 导出（含真实日历 round-trip，'2026-02-30' 会被判定非法） */

/* ====================================================================
   校验
   ==================================================================== */

/**
 * validateGoal(def) —— 校验一条目标定义，返回 { ok, errors }。
 * errors: [{ field, message }]。任何一条不满足即 ok=false。
 */
function validateGoal(def) {
  var g = (def && typeof def === 'object') ? def : {};
  var errs = [];

  if (!g.title || !String(g.title).trim()) errs.push({ field: 'title', message: '请填写目标名称' });

  if (!TYPE_METRICS[g.type]) errs.push({ field: 'type', message: '目标类型不合法' });

  if (g.type && TYPE_METRICS[g.type] && TYPE_METRICS[g.type].indexOf(g.metric) === -1) {
    errs.push({ field: 'metric', message: '该类型不支持所选指标' });
  }

  var tv = Number(g.targetValue);
  if (!(tv > 0) || !isFinite(tv)) errs.push({ field: 'targetValue', message: '目标值必须大于 0' });

  if (VALID_PERIODS.indexOf(g.period) === -1) errs.push({ field: 'period', message: '周期不合法' });

  var s = String(g.startDate || '');
  var e = String(g.endDate || '');

  if (g.period === 'custom') {
    if (!isValidDateStr(s) || !isValidDateStr(e)) {
      errs.push({ field: 'date', message: '自定义周期需要有效的开始与结束日期' });
    } else if (s > e) {
      errs.push({ field: 'date', message: '开始日期不能晚于结束日期' });
    } else if (diffDays(s, e) > MAX_CUSTOM_DAYS) {
      errs.push({ field: 'date', message: '自定义周期过长，请控制在两年以内' });
    }
  } else {
    // 非 custom：日期也要合法，且 start <= end
    if (!isValidDateStr(s) || !isValidDateStr(e) || s > e) {
      errs.push({ field: 'date', message: '日期不合法或开始晚于结束' });
    }
  }

  return { ok: errs.length === 0, errors: errs };
}

/* ====================================================================
   周期 → Analytics 查询范围
   ==================================================================== */

/**
 * goalRange(goal, opts) —— 目标的周期 → [start, end] 闭区间。
 * 复用 CGAnalytics.thisWeek / thisMonth（基于 date.js 的周/月语义），不新写算法。
 */
function goalRange(g, opts) {
  g = g || {};
  opts = opts || {};
  var s = String(g.startDate || '');
  var e = String(g.endDate || '');
  if (!isValidDateStr(s)) return null;
  switch (g.period) {
    case 'daily':
      // 每日目标：循环评估「今天」单独一天，绝不从创建日累计到今天（§44 不累计原则保留）。
      // 未到开始日则评估开始日当天。
      // （V2 验收修复：此前只评估 startDate 单日，导致「每天学习 2 小时」这类
      //  最常见目标第二天就被误判为「已过期」，与用户预期「每天重来」冲突。）
      var d = (isValidDateStr(opts.today) && s <= opts.today) ? opts.today : s;
      return [d, d];
    case 'weekly':
      return Analytics.thisWeek(s);        // [周一, 周日] 含 startDate 所在周
    case 'monthly':
      return Analytics.thisMonth(s);       // [当月1日, 月末]
    case 'custom':
      if (!isValidDateStr(e)) return null;
      return [s <= e ? s : e, s <= e ? e : s];
    default:
      return null;
  }
}

/* ====================================================================
   摘要 → 当前值（按 type:metric 取数，只读 Analytics 输出）
   ==================================================================== */

function pickMetric(g, summary, words) {
  if (!summary) { return (g.type === 'english' && g.metric === 'words') ? numOr0(words) : 0; }
  switch (g.type + ':' + g.metric) {
    case 'focus:minutes': return numOr0(summary.focus && summary.focus.minutes);
    case 'focus:count': return numOr0(summary.focus && summary.focus.sessions);
    case 'exercise:minutes': return numOr0(summary.sports && summary.sports.minutes);
    case 'exercise:count': return numOr0(summary.sports && summary.sports.count);
    case 'reading:pages': return numOr0(summary.readings && summary.readings.pages);
    case 'english:minutes': return numOr0(summary.study && summary.study.englishMinutes);
    case 'english:words': return numOr0(words);
    case 'todo:count': return numOr0(summary.todos && summary.todos.done);
    case 'checkin:days': return numOr0(summary.checkins && summary.checkins.doneDays);
    default: return 0;
  }
}
function numOr0(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* ====================================================================
   状态派生
   ==================================================================== */

/**
 * deriveStatus(g, currentValue, targetValue, endDate, today) → active/completed/expired/archived
 * 只有 archived 是持久化的用户生命周期；completed/expired 一律按事实派生，避免同步漂移。
 */
function deriveStatus(g, cur, tv, endDate, today) {
  if (g && g.status === 'archived') return 'archived';
  if (cur >= tv && tv > 0) return 'completed';      // 达成即完成，即使未到 end
  if (today > endDate) return 'expired';            // 已过截止且未完成
  return 'active';
}

/* ====================================================================
   单目标进度
   ==================================================================== */

/**
 * buildProgress(g, summary, range, today, courseLib) —— 把目标 + 摘要 合成派生进度对象。
 * 返回 NEW OBJECT（不是 Store 数据）。字段：goal/currentValue/targetValue/percentage/
 * remaining/status/daysRemaining/isComplete/isExpired。
 */
function buildProgress(g, summary, range, today, courseLib, words) {
  var tv = numOr0(g && g.targetValue);
  var cur;
  if (g && g.type === 'course') {
    cur = (g.metric === 'progress')
      ? numOr0(courseLib && courseLib.avgProgress)
      : numOr0(courseLib && courseLib.done);
    // 课程为库级口径：currentValue 不受周期影响
  } else {
    cur = pickMetric(g, summary, words);
  }

  var endDate = (range && range[1]) || g.endDate || today;
  var status = deriveStatus(g, cur, tv, endDate, today);
  var isComplete = status === 'completed';
  var isExpired = status === 'expired';
  var daysRemaining = diffDays(today, endDate); // 截止日-今天；负=已过
  var remaining = Math.max(tv - cur, 0);        // 展示值，绝不写回
  var percentage = clamp(tv > 0 ? (cur / tv) * 100 : 0, 0, 100);
  // 保留实际值（超额不丢），百分比用于视觉进度条上限 100%（§18）
  var percentRaw = tv > 0 ? (cur / tv) * 100 : 0;

  return {
    goal: g,
    currentValue: cur,
    targetValue: tv,
    percentRaw: percentRaw,
    percentage: percentage,
    remaining: remaining,
    status: status,
    daysRemaining: daysRemaining,
    isComplete: isComplete,
    isExpired: isExpired,
    range: range,
    date: today
  };
}

/* ====================================================================
   汇总（优化：一次 snapshot，按唯一 range 缓存摘要，避免 O(N × snapshot)）
   ==================================================================== */

/**
 * computeGoalsProgress(goals, data, opts) —— 批量计算。
 * - goals: 目标定义数组
 * - data:  数据快照（缺省用 CGStore.get()——只读，绝无写操作）
 * - opts:  { today } 可注入，测试确定性
 * 【性能】非课程目标按去重后的 range 缓存 getDateRangeSummary；课程目标只算一次
 * getCourseSummary。不做复杂缓存系统，简单可靠。
 */
function computeGoalsProgress(goals, data, opts) {
  opts = opts || {};
  var snap = (data && typeof data === 'object') ? data : CGStore.get();
  var today = opts.today || todayStr();
  goals = Array.isArray(goals) ? goals : [];

  var out = [];
  var cache = {};           // '<start>|<end>' → 日期范围摘要
  var courseLib = null;     // 课程库摘要（只算一次）

  // getDateRangeSummary 不含 words，需要时附加取一次 getStudySummary
var needsWords = goals.some(function (g) { return g && g.type === 'english' && g.metric === 'words'; });

goals.forEach(function (g) {
    // 单条坏目标（无/非法日期、坏数值等）必须被隔离，绝不拖垮整批
    try {
      if (!g || typeof g !== 'object') { out.push(buildProgressWrapper(g, null, null, today, null)); return; }
      if (g.type === 'course') {
        if (!courseLib) courseLib = Analytics.getCourseSummary(snap);
        var cr = goalRangeSafe(g);
        out.push(buildProgress(g, null, cr, today, courseLib));
        return;
      }
      var r = goalRange(g, { today: today });
      var key = r ? r[0] + '|' + r[1] : '';
      var words = 0;
      if (!(key in cache)) {
        var s = r ? Analytics.getDateRangeSummary(r[0], r[1], snap) : null;
        if (r && needsWords && s) words = numOr0(Analytics.getStudySummary(r[0], r[1], snap).words);
        cache[key] = { summary: s, words: words };
      } else {
        words = cache[key].words;
      }
      out.push(buildProgress(g, cache[key].summary, r, today, null, words));
    } catch (_) {
      out.push(buildProgressWrapper(g, null, null, today, null));
    }
  });
  return out;
}

/* 坏目标的防守：不崩，返回一个 status 为 active 的最小派生对象 */
function buildProgressWrapper(g, summary, range, today, courseLib) {
  return buildProgress(g || {}, summary, range, today || todayStr(), courseLib);
}

/** goalRange 的带默认返回值包装（非法 → null） */
function goalRangeSafe(g) {
  return goalRange(g, {});
}

/* ====================================================================
   单目标 / 分类 便捷 API
   ==================================================================== */

/** getGoalProgress(goal, data, opts) —— 单目标进度 */
function getGoalProgress(goal, data, opts) {
  var list = computeGoalsProgress([goal], data, opts);
  return list && list[0] ? list[0] : buildProgress(goal || {}, null, null, (opts && opts.today) || todayStr(), null);
}

/**
 * classifyGoals(progressList) —— 把进度列表按派生状态分桶。
 * 返回 { active: [], completed: [], expired: [], archived: [] }。
 */
function classifyGoals(progressList) {
  var buckets = { active: [], completed: [], expired: [], archived: [] };
  (Array.isArray(progressList) ? progressList : []).forEach(function (p) {
    if (!p || !p.status) return;
    if (buckets[p.status]) buckets[p.status].push(p);
    else buckets.active.push(p); // 未知状态兜底
  });
  return buckets;
}

/** 便捷分类：直接传 goals + data */
function getActiveGoals(goals, data, opts) { return classifyGoals(computeGoalsProgress(goals, data, opts)).active; }
function getCompletedGoals(goals, data, opts) { return classifyGoals(computeGoalsProgress(goals, data, opts)).completed; }
function getExpiredGoals(goals, data, opts) { return classifyGoals(computeGoalsProgress(goals, data, opts)).expired; }

/* ====================================================================
   标签 / 单位（UI 展示用，纯格式化）
   ==================================================================== */

/** metricUnit(type, metric) —— 单位短标签，如 'min' / '页' / '次' / '天' */
function metricUnit(type, metric) {
  if (metric === 'progress') return '%';
  var label = METRIC_LABELS[metric] || '';
  if (metric === 'minutes') return 'min';
  return label;
}

/** periodLabel / typeLabel / metricLabel —— 中文标签 */
function periodLabel(p) { return PERIOD_LABELS[p] || ''; }
function typeLabel(t) { return TYPE_LABELS[t] || (t || ''); }
function metricLabel(m) { return METRIC_LABELS[m] || ''; }

/* ====================================================================
   全局 & 导出
   ==================================================================== */

var GoalEngine = {
  TYPE_METRICS: TYPE_METRICS,
  MAX_CUSTOM_DAYS: MAX_CUSTOM_DAYS,
  validateGoal: validateGoal,
  goalRange: goalRange,
  computeGoalProgress: getGoalProgress,
  computeGoalsProgress: computeGoalsProgress,
  classifyGoals: classifyGoals,
  getGoalProgress: getGoalProgress,
  getGoalsProgress: computeGoalsProgress,
  getGoalStatus: function (p) { return p && p.status ? p.status : 'active'; },
  getActiveGoals: getActiveGoals,
  getCompletedGoals: getCompletedGoals,
  getExpiredGoals: getExpiredGoals,
  metricUnit: metricUnit,
  periodLabel: periodLabel,
  typeLabel: typeLabel,
  metricLabel: metricLabel
};

globalThis.CGGoal = GoalEngine;

export default GoalEngine;
export {
  validateGoal, goalRange, computeGoalsProgress, getGoalProgress, classifyGoals,
  metricUnit, periodLabel, typeLabel, metricLabel
};
