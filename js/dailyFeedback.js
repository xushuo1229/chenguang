'use strict';

import Analytics from './analytics.js';
import GrowthIntelligence from './growthIntelligence.js';
import { isValidDateStr } from './analytics.js';
import { todayStr } from './utils/date.js';

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function text(value, maxLength) {
  var clean = value == null ? '' : String(value).trim();
  return maxLength ? clean.slice(0, maxLength) : clean;
}

function recordCount(summary) {
  return num(summary.focus && summary.focus.sessions) +
    num(summary.sports && summary.sports.count) +
    num(summary.readings && summary.readings.entries) +
    num(summary.todos && summary.todos.done) +
    (num(summary.checkins && summary.checkins.doneDays) > 0 ? 1 : 0) +
    (num(summary.study && summary.study.englishMinutes) > 0 ? 1 : 0);
}

function buildHighlights(summary, state) {
  var highlights = [];
  if (num(summary.focus && summary.focus.sessions) > 0) {
    highlights.push('今天记录了专注 ' + num(summary.focus.minutes) + ' 分钟。');
  }
  if (num(summary.checkins && summary.checkins.doneDays) > 0) {
    highlights.push('今日打卡已记录。');
  }
  if (num(summary.todos && summary.todos.done) > 0) {
    highlights.push('完成了 ' + num(summary.todos.done) + ' 项待办。');
  }
  if (num(summary.sports && summary.sports.count) > 0) {
    highlights.push('记录了 ' + num(summary.sports.count) + ' 次运动。');
  }
  if (num(summary.readings && summary.readings.pages) > 0) {
    highlights.push('阅读了 ' + num(summary.readings.pages) + ' 页。');
  }
  if (num(summary.study && summary.study.englishMinutes) > 0) {
    highlights.push('英语学习 ' + num(summary.study.englishMinutes) + ' 分钟。');
  }
  var strength = state.positiveSignals && state.positiveSignals[0];
  if (strength && text(strength.reason)) {
    highlights.push('最近记录显示：' + text(strength.reason, 100));
  }
  return highlights.filter(text).slice(0, 3);
}

function buildChanges(state) {
  var window = state.trendState && state.trendState.windows && state.trendState.windows['7d'];
  if (!window) return [];
  return ['study', 'focus', 'english', 'exercise', 'reading', 'todoDone', 'activity']
    .map(function (metric) { return window[metric]; })
    .filter(function (trend) { return trend && trend.status !== 'insufficient_data' && trend.status !== 'no_data'; })
    .map(function (trend) {
      var delta = num(trend.delta);
      var direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
      var description = direction === 'flat'
        ? '最近 7 天' + trend.label + '保持稳定。'
        : '最近 7 天' + trend.label + (direction === 'up' ? '上升 ' : '下降 ') + Math.abs(delta) + '%。';
      return { metric: trend.metric, direction: direction, description: description };
    })
    .slice(0, 3);
}

function buildNextActions(state, summary) {
  if (state.overall === 'insufficient_data') {
    return ['完成一次记录后，这里会生成你的今日成长反馈。'];
  }
  var actions = arr(state.actionProposals)
    .map(function (proposal) {
      var title = text(proposal && proposal.title, 60);
      var why = text(proposal && (proposal.why || proposal.reason), 80);
      return title && why && title !== why ? title + '：' + why : title;
    })
    .filter(text)
    .map(function (action) { return '可以尝试' + action; });
  if (num(summary.todos && summary.todos.pending) > 0) {
    actions.push('可以尝试完成一件今日待办。');
  }
  if (num(summary.focus && summary.focus.sessions) === 0) {
    actions.push('可以尝试安排一次 10-25 分钟专注。');
  }
  if (!actions.length) actions.push('可以尝试继续保持当前学习节奏。');
  return actions.slice(0, 2);
}

function buildDailyFeedback(snapshot, opts) {
  var options = opts && typeof opts === 'object' ? opts : {};
  var source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  var today = isValidDateStr(options.today) ? options.today : todayStr();
  var todaySummary = options.todaySummary && typeof options.todaySummary === 'object'
    ? options.todaySummary
    : (Analytics.getDateRangeSummary(today, today, source) || {});
  var state = options.growthState && typeof options.growthState === 'object'
    ? options.growthState
    : (GrowthIntelligence.buildDailyInsight(source, { today: today }).growthState || {});
  var count = recordCount(todaySummary);

  return {
    summary: count > 0
      ? '今天完成了 ' + count + (count === 1 ? ' 次成长记录。' : ' 项成长记录。')
      : '今天还没有成长记录，完成一次记录后，这里会生成你的今日成长反馈。',
    highlights: state.overall === 'insufficient_data' ? [] : buildHighlights(todaySummary, state),
    changes: buildChanges(state),
    nextActions: buildNextActions(state, todaySummary),
    generatedAt: new Date().toISOString()
  };
}

var DailyFeedback = { VERSION: '1.0', buildDailyFeedback: buildDailyFeedback };
globalThis.CGDailyFeedback = DailyFeedback;

export default DailyFeedback;
export { buildDailyFeedback };
