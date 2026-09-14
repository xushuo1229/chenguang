'use strict';

var VERSION = '1.0';
var PERIODS = ['daily', 'weekly', 'monthly'];

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value).trim().slice(0, 220);
}

function number(value) {
  var n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pushUnique(list, message) {
  var clean = text(message);
  if (!clean || list.indexOf(clean) >= 0 || list.length >= 4) return;
  list.push(clean);
}

function signalMessage(item, fallback) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return text(item.message || item.reason || item.description || item.title || fallback);
}

function recommendationMessage(item) {
  if (!item || typeof item !== 'object') return '';
  var title = text(item.title);
  var message = text(item.message || item.why || item.reason);
  if (title && message && title !== message) return title + '：' + message;
  return title || message;
}

function isSufficient(context) {
  var growth = context.growth || {};
  var state = context.growthState || {};
  return !((growth.score && growth.score.dataSufficient === false) ||
    (state.dataSufficiency && state.dataSufficiency.overall === false));
}

function trendFor(context, period) {
  var trends = (context.growth && context.growth.trends) || {};
  var range = trends[period === 'monthly' ? '30d' : '7d'] || {};
  return range.learningTrend || {};
}

function buildDailySummary(context, daily, sufficient) {
  if (!sufficient) return '今日数据不足，先记录一个小行动，明天就能看到更完整的反馈。';
  if (daily.studyMinutes > 0) return '今日学习 ' + number(daily.studyMinutes) + ' 分钟，成长状态总体稳定。';
  if (daily.focusMinutes > 0) return '今日专注 ' + number(daily.focusMinutes) + ' 分钟，继续保持当前节奏。';
  if (daily.activity) return '今日已有成长记录，继续保持这个节奏。';
  return '今天还没有成长记录，可以先安排一个 10 分钟的小行动。';
}

function buildPeriodSummary(context, period, sufficient) {
  var trend = trendFor(context, period);
  var label = period === 'monthly' ? '月度' : '本周';
  if (!sufficient) return label + '数据不足，暂时无法给出可靠趋势结论。';
  if (trend.description) return label + '报告：' + text(trend.description) + '。';
  if (period === 'monthly') return '月度数据显示你的成长节奏仍在积累，适合回顾长期稳定性。';
  return '本周状态总体稳定，可以继续围绕当前重点推进。';
}

function buildAchievements(context, period, daily) {
  var achievements = [];
  var overview = context.overview || {};
  var state = context.growthState || {};

  if (period === 'daily') {
    if (number(overview.currentStreak) > 0) pushUnique(achievements, '已连续成长 ' + number(overview.currentStreak) + ' 天。');
    if (daily.activity) pushUnique(achievements, '今日已完成一次成长记录。');
    if (daily.studyMinutes > 0) pushUnique(achievements, '今日完成学习 ' + number(daily.studyMinutes) + ' 分钟。');
    if (daily.focusMinutes > 0) pushUnique(achievements, '今日完成专注 ' + number(daily.focusMinutes) + ' 分钟。');
    if (daily.exerciseMinutes > 0) pushUnique(achievements, '今日完成运动 ' + number(daily.exerciseMinutes) + ' 分钟。');
    if (daily.todosCompleted > 0) {
      pushUnique(achievements, '今日完成待办 ' + number(daily.todosCompleted) + '/' + number(daily.todosTotal) + ' 项。');
    }
  } else {
    if (number(overview.studyMinutes) > 0) {
      pushUnique(achievements, (period === 'monthly' ? '近 30 天' : '本周') + '学习 ' + number(overview.studyMinutes) + ' 分钟。');
    }
    if (number(overview.activeDays) > 0) {
      pushUnique(achievements, (period === 'monthly' ? '近 30 天' : '本周') + '活跃 ' + number(overview.activeDays) + ' 天。');
    }
    if (number(overview.currentStreak) > 0) pushUnique(achievements, '已连续成长 ' + number(overview.currentStreak) + ' 天。');
    if (number(overview.completionRate) > 0) {
      pushUnique(achievements, '待办完成率保持在 ' + number(overview.completionRate) + '%。');
    }
  }

  arr(context.goals && context.goals.active).forEach(function (goal) {
    if (!goal || achievements.length >= 4) return;
    var percent = number(goal.percentage);
    if (percent > 0) pushUnique(achievements, '目标「' + text(goal.title) + '」已完成 ' + percent + '%。');
  });

  if (period === 'monthly') {
    arr(state.importantChanges).forEach(function (change) {
      if (achievements.length >= 4 || !change || change.status !== 'rising') return;
      pushUnique(achievements, text(change.label) + '出现长期改善信号。');
    });
  }

  return achievements;
}

function buildInsights(context, period, trend) {
  var insights = [];
  var coach = context.coach || {};
  var state = context.growthState || {};
  var growth = context.growth || {};

  arr(coach.insights).forEach(function (item) { pushUnique(insights, signalMessage(item)); });
  arr(state.strengths).concat(arr(growth.strengths)).forEach(function (item) {
    pushUnique(insights, signalMessage(item));
  });
  if (trend.status === 'rising') pushUnique(insights, text(trend.description) || '学习趋势出现改善。');
  if (period === 'monthly') {
    arr(state.importantChanges).forEach(function (change) {
      if (change && change.status === 'rising') {
        pushUnique(insights, text(change.label) + '在 30 天内保持改善。');
      }
    });
  }
  return insights;
}

function buildChallenges(context, trend) {
  var challenges = [];
  var coach = context.coach || {};
  var state = context.growthState || {};
  var growth = context.growth || {};

  arr(coach.warnings).forEach(function (item) { pushUnique(challenges, signalMessage(item)); });
  arr(state.risks).concat(arr(growth.risks)).forEach(function (item) {
    pushUnique(challenges, signalMessage(item));
  });
  if (trend.status === 'falling') pushUnique(challenges, text(trend.description) || '学习节奏有所回落。');
  return challenges;
}

function buildRecommendations(context) {
  var recommendations = [];
  var coach = context.coach || {};
  var state = context.growthState || {};

  arr(coach.recommendations).forEach(function (item) { pushUnique(recommendations, recommendationMessage(item)); });
  arr(state.actionProposals).forEach(function (item) { pushUnique(recommendations, recommendationMessage(item)); });
  return recommendations;
}

function buildNextSteps(context, period) {
  var nextSteps = [];
  var state = context.growthState || {};
  var coach = context.coach || {};

  arr(coach.recommendations).forEach(function (item) { pushUnique(nextSteps, recommendationMessage(item)); });
  arr(state.recommendedFocus).forEach(function (item) { pushUnique(nextSteps, signalMessage(item)); });
  if (period === 'monthly' && nextSteps.length) nextSteps[0] = '下一阶段：' + nextSteps[0];
  return nextSteps;
}

function buildReport(context, period) {
  var source = context && typeof context === 'object' ? context : {};
  var normalizedPeriod = PERIODS.indexOf(period) >= 0 ? period : 'weekly';
  var daily = source.daily && typeof source.daily === 'object' ? source.daily : {};
  var trend = trendFor(source, normalizedPeriod);
  var sufficient = isSufficient(source);

  return {
    version: VERSION,
    readOnly: true,
    period: normalizedPeriod,
    summary: normalizedPeriod === 'daily'
      ? buildDailySummary(source, daily, sufficient)
      : buildPeriodSummary(source, normalizedPeriod, sufficient),
    achievements: sufficient ? buildAchievements(source, normalizedPeriod, daily) : [],
    insights: sufficient ? buildInsights(source, normalizedPeriod, trend) : [],
    challenges: buildChallenges(source, trend),
    recommendations: buildRecommendations(source),
    nextSteps: buildNextSteps(source, normalizedPeriod),
    dataSufficient: sufficient === true
  };
}

function buildReports(context) {
  return {
    daily: buildReport(context, 'daily'),
    weekly: buildReport(context, 'weekly'),
    monthly: buildReport(context, 'monthly')
  };
}

function formatReport(report) {
  if (!report || typeof report !== 'object') return '成长报告暂不可用，请稍后重试。';
  var title = report.period === 'daily' ? '今日成长报告' : report.period === 'monthly' ? '月度成长报告' : '本周成长报告';
  var lines = [title, report.summary || '暂无成长总结。'];
  var sections = [
    ['成果', report.achievements],
    ['亮点', report.insights],
    ['挑战', report.challenges],
    ['建议', report.recommendations],
    ['下一步', report.nextSteps]
  ];
  sections.forEach(function (section) {
    var items = arr(section[1]);
    if (!items.length) return;
    lines.push(section[0] + '：');
    items.forEach(function (item) { lines.push('- ' + text(item)); });
  });
  if (!report.dataSufficient) lines.push('当前数据不足，结论只作为参考。');
  return lines.join('\n');
}

var GrowthReport = {
  VERSION: VERSION,
  PERIODS: PERIODS,
  buildReport: buildReport,
  buildReports: buildReports,
  formatReport: formatReport
};

globalThis.CGGrowthReport = GrowthReport;
export default GrowthReport;
export { buildReport, buildReports, formatReport };
