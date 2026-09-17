/**
 * 知行 · Growth Context Layer (Phase 23.1)
 * ============================================================
 * 架构定位：
 *
 *   CGStore → Analytics → GrowthContext → AIContext → AI Coach
 *
 * 本文件是纯派生层：
 *   - 输入：Analytics 统计结果 + GoalEngine 进度 + 今日 Todo 摘要
 *   - 输出：面向行动的成长上下文（结构化 JSON）
 *   - 只读：不写 Store / 不写 localStorage / 不触发同步
 *   - 不重新计算：所有统计口径来自 Analytics / GoalEngine（唯一事实来源）
 *
 * 【不是】
 *   - 不是 Store
 *   - 不是 Cache
 *   - 不是 Analytics 替代品
 *   - 不是新数据类型
 * ------------------------------------------------------------
 */
'use strict';

import Analytics from './analytics.js';
import GoalEngine from './goals.js';
import { todayStr, dateOffset } from './utils/date.js';

var VERSION = '1.0';

function _num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function _arr(v) { return Array.isArray(v) ? v : []; }

/**
 * buildGrowthContext(snap, opts) — 组装面向行动的成长上下文
 *
 * @param {Object}  snap           CGStore.get() 的数据快照（只读）
 * @param {Object}  [opts]         { today } 可注入，测试确定性
 * @returns {Object}               growthContext 结构化 JSON
 */
function buildGrowthContext(snap, opts) {
  opts = opts || {};
  var today = todayStr(opts && opts.today ? undefined : undefined);
  if (opts && typeof opts.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.today)) {
    today = opts.today;
  }

  var yesterday = dateOffset(today, -1);

  /* ---- 今日任务摘要（Analytics 唯一口径） ---- */
  var todayTodos = Analytics.getTodoSummary(today, today, snap, today) || { total: 0, done: 0, pending: 0, overdue: 0, completionRate: 0 };
  var yesterdayTodos = Analytics.getTodoSummary(yesterday, yesterday, snap, today) || { total: 0, done: 0, pending: 0, overdue: 0, completionRate: 0 };

  /* ---- 今日专注/学习摘要 ---- */
  var todaySummary = Analytics.getDateRangeSummary(today, today, snap) || {};
  var todayFocus = (todaySummary.focus && todaySummary.focus.minutes) || 0;
  var todayStudy = (todaySummary.study && todaySummary.study.minutes) || 0;
  var todayExercise = (todaySummary.sports && todaySummary.sports.minutes) || 0;
  var todayActive = !!(todaySummary.activity && todaySummary.activity.activeDays > 0);

  /* ---- Streak（Analytics 唯一口径） ---- */
  var streaks = Analytics.getStreaks(snap, { today: today }) || { currentStreak: 0, longestStreak: 0, todayDone: false };

  /* ---- Goals（GoalEngine 派生，不重算） ---- */
  var goalsRaw = GoalEngine.computeGoalsProgress(_arr(snap.goals), snap, { today: today });
  var buckets = GoalEngine.classifyGoals(goalsRaw);
  var activeGoals = _arr(buckets.active);
  var atRiskGoals = activeGoals.filter(function (g) {
    return g && !g.isComplete && g.daysRemaining <= 7 && g.percentage < 70;
  }).slice(0, 3);

  /* ---- Signals ---- */
  var positive = [];
  var risks = [];

  if (todayTodos.done > 0) {
    positive.push({ type: 'task_progress', message: '今日已完成 ' + todayTodos.done + ' / ' + todayTodos.total + ' 项任务' });
  }
  if (streaks.currentStreak > 0) {
    positive.push({ type: 'streak', message: '连续打卡 ' + streaks.currentStreak + ' 天' });
  }
  if (todayFocus > 0) {
    positive.push({ type: 'focus_time', message: '今日专注 ' + todayFocus + ' 分钟' });
  }
  if (todayStudy > 0) {
    positive.push({ type: 'learning', message: '今日学习 ' + todayStudy + ' 分钟' });
  }

  if (todayTodos.pending > 0 && !todayActive) {
    risks.push({ type: 'pending_no_activity', severity: 'medium', message: '今日有 ' + todayTodos.pending + ' 项任务未完成且尚未开始记录' });
  }
  if (yesterdayTodos.pending > 0) {
    risks.push({ type: 'yesterday_pending', severity: 'low', message: '昨日有 ' + yesterdayTodos.pending + ' 项任务未完成' });
  }
  atRiskGoals.forEach(function (g) {
    risks.push({
      type: 'goal_at_risk',
      severity: 'high',
      message: '目标「' + (g.goal && g.goal.title ? g.goal.title : '未命名') + '」进度 ' + Math.round(g.percentage) + '%，剩余 ' + g.daysRemaining + ' 天',
      goalId: g.goal && g.goal.id
    });
  });
  if (streaks.currentStreak === 0 && streaks.longestStreak > 0) {
    risks.push({ type: 'streak_broken', severity: 'medium', message: '连续打卡已中断（历史最长 ' + streaks.longestStreak + ' 天）' });
  }

  /* ---- Suggestions（规则引擎，不调 AI） ---- */
  var suggestions = [];
  if (todayTodos.pending > 0) {
    suggestions.push('今日还有 ' + todayTodos.pending + ' 项任务待完成，建议从最重要的开始');
  }
  if (!todayActive && todayTodos.total > 0) {
    suggestions.push('今天还没有记录任何活动，先做一件 10 分钟的小事启动状态');
  }
  if (atRiskGoals.length > 0) {
    suggestions.push('有 ' + atRiskGoals.length + ' 个目标进度落后，建议优先推进');
  }
  if (streaks.currentStreak > 0 && !streaks.todayDone) {
    suggestions.push('保持连续打卡，今天还没打卡');
  }
  if (suggestions.length === 0 && todayTodos.total === 0) {
    suggestions.push('今天还没有计划，添加一件小事让今天有方向');
  }

  return {
    version: VERSION,
    today: today,
    taskSummary: {
      total: todayTodos.total,
      completed: todayTodos.done,
      pending: todayTodos.pending,
      completionRate: todayTodos.completionRate,
      yesterdayPending: yesterdayTodos.pending
    },
    focusSummary: {
      minutes: todayFocus,
      studyMinutes: todayStudy,
      exerciseMinutes: todayExercise,
      activeToday: todayActive
    },
    streaks: {
      current: streaks.currentStreak,
      longest: streaks.longestStreak,
      todayDone: streaks.todayDone
    },
    goals: {
      activeCount: activeGoals.length,
      atRisk: atRiskGoals.map(function (g) {
        return {
          title: g.goal && g.goal.title ? g.goal.title : '未命名',
          percentage: Math.round(g.percentage),
          daysRemaining: g.daysRemaining
        };
      })
    },
    signals: {
      positive: positive,
      risks: risks
    },
    suggestions: suggestions
  };
}

var GrowthContext = {
  VERSION: VERSION,
  buildGrowthContext: buildGrowthContext
};

export default GrowthContext;
export { buildGrowthContext, VERSION };
