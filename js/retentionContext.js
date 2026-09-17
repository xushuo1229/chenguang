'use strict';

import Analytics from './analytics.js';
import { isValidDateStr } from './analytics.js';
import { todayStr, dateOffset } from './utils/date.js';

var VERSION = '1.0';

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
function text(value, max) {
  var clean = value == null ? '' : String(value).trim();
  return max ? clean.slice(0, max) : clean;
}

function buildWelcomeBack(snapshot, opts) {
  var options = opts && typeof opts === 'object' ? opts : {};
  var snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  var today = isValidDateStr(options.today) ? options.today : todayStr();
  var yesterday = dateOffset(today, -1);
  if (!isValidDateStr(yesterday)) return null;
  var summary = Analytics.getDateRangeSummary(yesterday, yesterday, snap);
  if (!summary || num(summary.activity && summary.activity.activeDays) === 0) return null;

  var items = [];
  var focusMin = num(summary.focus && summary.focus.minutes);
  if (focusMin > 0) items.push('专注 ' + focusMin + ' 分钟');
  var pages = num(summary.readings && summary.readings.pages);
  if (pages > 0) items.push('阅读 ' + pages + ' 页');
  var sportMin = num(summary.sports && summary.sports.minutes);
  if (sportMin > 0) items.push('运动 ' + sportMin + ' 分钟');
  var englishMin = num(summary.study && summary.study.englishMinutes);
  if (englishMin > 0) items.push('英语 ' + englishMin + ' 分钟');
  var todosDone = num(summary.todos && summary.todos.done);
  if (todosDone > 0) items.push('完成待办 ' + todosDone + ' 项');
  if (num(summary.checkins && summary.checkins.doneDays) > 0) items.push('完成打卡');

  if (!items.length) return null;

  return {
    version: VERSION,
    date: yesterday,
    records: items.slice(0, 4),
    message: '继续保持今天的成长节奏。'
  };
}

function buildStreakReminder(snapshot, opts) {
  var options = opts && typeof opts === 'object' ? opts : {};
  var snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  var today = isValidDateStr(options.today) ? options.today : todayStr();
  var streaks = Analytics.getStreaks(snap, { today: today });
  if (!streaks || num(streaks.currentStreak) <= 0 || streaks.todayDone) return null;
  return {
    version: VERSION,
    streak: num(streaks.currentStreak),
    message: '你的连续成长记录已经保持 ' + num(streaks.currentStreak) + ' 天。今天记录一点点，就能继续保持这个节奏。'
  };
}

function getRetentionCandidate(memory) {
  var source = memory && typeof memory === 'object' ? memory : {};
  var candidates = arr(source.candidates).filter(function (c) {
    return c && c.id && c.content && c.status === 'pending';
  });
  if (!candidates.length) return null;
  var first = candidates[0];
  var evidence = arr(first.evidence).map(function (row) {
    if (!row || typeof row !== 'object') return null;
    var metric = text(row.metric, 60);
    var val = row.value != null ? row.value : row.delta;
    if (metric && val != null) return metric + ' ' + String(val);
    return null;
  }).filter(Boolean).slice(0, 3);
  return {
    id: text(first.id, 120),
    type: text(first.type, 40),
    content: text(first.content, 220),
    evidence: evidence
  };
}

var RetentionContext = {
  VERSION: VERSION,
  buildWelcomeBack: buildWelcomeBack,
  buildStreakReminder: buildStreakReminder,
  getRetentionCandidate: getRetentionCandidate
};

globalThis.CGRetentionContext = RetentionContext;

export default RetentionContext;
export { buildWelcomeBack, buildStreakReminder, getRetentionCandidate };