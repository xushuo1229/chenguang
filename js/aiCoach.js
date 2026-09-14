'use strict';

var VERSION = '1.0';
var ROLE = 'growth_coach';

var PERSONA = {
  name: '知行成长教练',
  tone: '温和、数据驱动、具体',
  autonomyStatement: '教练只提供分析和选项，行动选择权始终在用户手中。',
  boundaries: [
    '不制造焦虑',
    '不夸大结果',
    '不做绝对化判断',
    '不提供医疗建议',
    '尊重用户自主选择'
  ]
};

function arr(value) { return Array.isArray(value) ? value : []; }

function text(value) {
  return value == null ? '' : String(value).trim().slice(0, 220);
}

function severity(value, fallback) {
  var allowed = ['positive', 'low', 'medium', 'high'];
  var normalized = text(value).toLowerCase();
  return allowed.indexOf(normalized) >= 0 ? normalized : fallback;
}

function dedupe(items) {
  var seen = {};
  var out = [];
  arr(items).forEach(function (item) {
    if (!item) return;
    var key = [item.type, item.message, item.title].join('|');
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(item);
  });
  return out;
}

function mapSignal(item, type, fallbackSeverity) {
  if (typeof item === 'string') {
    var directMessage = text(item);
    return directMessage ? { type: type, severity: fallbackSeverity, message: directMessage } : null;
  }
  if (!item || typeof item !== 'object') return null;
  var message = text(item.reason || item.description || item.message || item.statement || item.text);
  if (!message) return null;
  return {
    type: text(item.type) || type,
    severity: severity(item.severity || item.level, fallbackSeverity),
    message: message,
    evidence: item.evidence && typeof item.evidence === 'object' ? item.evidence : null
  };
}

function mapTrendSignals(trends) {
  var insights = [];
  var warnings = [];
  ['7d', '30d', '90d'].forEach(function (key) {
    var range = trends && trends[key];
    var trend = range && range.learningTrend;
    if (!trend || trend.status === 'insufficient_data') return;
    var span = key.replace('d', '') + ' 天';
    if (trend.status === 'rising' || trend.status === 'new_activity') {
      insights.push({
        type: 'growth_momentum',
        severity: 'positive',
        message: text(trend.description) || '最近 ' + span + '的学习趋势出现改善。'
      });
    }
    if (trend.status === 'falling') {
      warnings.push({
        type: 'growth_pause',
        severity: 'medium',
        message: text(trend.description) || '最近 ' + span + '的学习节奏有所回落。'
      });
    }
    arr(range && range.strengths).forEach(function (item) {
      var insight = mapSignal(item, 'strength', 'positive');
      if (insight) insights.push(insight);
    });
    arr(range && range.risks).forEach(function (item) {
      var warning = mapSignal(item, 'risk', 'medium');
      if (warning) warnings.push(warning);
    });
  });
  return { insights: insights, warnings: warnings };
}

function buildRecommendations(growthState, goals) {
  var recommendations = arr(growthState && growthState.actionProposals).slice(0, 3).map(function (proposal) {
    if (!proposal || typeof proposal !== 'object') return null;
    var title = text(proposal.title);
    var why = text(proposal.why || proposal.reason);
    if (!title && !why) return null;
    return {
      type: 'recommendation',
      severity: proposal.priority === 'high' ? 'medium' : 'low',
      title: title || '下一步建议',
      message: why || '可以把它拆成一个今天就能开始的小行动。',
      evidence: Object.assign({ id: text(proposal.id) }, proposal.evidence || {}),
      requiresConfirmation: true
    };
  });

  if (recommendations.filter(Boolean).length < 3) {
    arr(growthState && growthState.recommendedFocus).forEach(function (focus) {
      if (recommendations.filter(Boolean).length >= 3) return;
      var signal = mapSignal(focus, 'recommended_focus', 'low');
      if (!signal) return;
      recommendations.push({
        type: 'recommendation',
        severity: 'low',
        title: '下一步重点',
        message: signal.message,
        evidence: signal.evidence,
        requiresConfirmation: true
      });
    });
  }

  if (!recommendations.filter(Boolean).length && goals && Array.isArray(goals.active) && goals.active.length) {
    var goal = goals.active[0];
    if (goal && typeof goal === 'object' && text(goal.title)) {
      recommendations.push({
        type: 'recommendation',
        severity: 'low',
        title: '回到当前目标',
        message: '可以先围绕「' + text(goal.title) + '」安排一个 10-25 分钟的小行动。',
        evidence: { goalId: text(goal.id) },
        requiresConfirmation: true
      });
    }
  }

  return recommendations.filter(Boolean);
}

function buildEncouragement(score, dataSufficient, warningCount) {
  if (!dataSufficient) return '现在数据还比较少，先从一次小记录开始就好。';
  var value = Number(score && score.value);
  if (Number.isFinite(value) && value >= 70) return '你的节奏已经有稳定基础，继续选择一个重点推进就好。';
  if (warningCount > 0) return '有些节奏出现回落很常见，选一个小行动先稳住今天。';
  return '你已经在积累有用的成长记录，继续按自己的节奏推进。';
}

function buildCoachContext(context) {
  var source = context && typeof context === 'object' ? context : {};
  var growth = source.growth && typeof source.growth === 'object' ? source.growth : {};
  var growthState = source.growthState && typeof source.growthState === 'object' ? source.growthState : {};
  var goals = source.goals && typeof source.goals === 'object' ? source.goals : {};
  var memory = source.memory && typeof source.memory === 'object' ? source.memory : {};
  var trendSignals = mapTrendSignals(growth.trends);

  var memoryChallenges = arr(memory.patterns).filter(function (pattern) {
    return pattern && (String(pattern.id || '').indexOf('declining') >= 0 ||
      (pattern.evidence && Number(pattern.evidence.delta) < 0));
  }).map(function (pattern) {
    return mapSignal(pattern, 'memory_challenge', 'medium');
  }).filter(Boolean);

  var memoryInsights = arr(memory.patterns).filter(function (pattern) {
    return pattern && !memoryChallenges.some(function (warning) {
      return warning && pattern.statement === warning.message;
    });
  }).concat(arr(memory.insights)).map(function (signal) {
    return mapSignal(signal, 'long_term_memory', 'positive');
  }).filter(Boolean);

  var insights = dedupe(memoryInsights.concat(trendSignals.insights.concat(
    arr(growth.strengths).concat(arr(growthState.strengths)).map(function (item) {
      return mapSignal(item, 'strength', 'positive');
    })
  ).filter(Boolean)));

  var warnings = dedupe(memoryChallenges.concat(trendSignals.warnings.concat(
    arr(growth.risks).concat(arr(growthState.risks)).map(function (item) {
      return mapSignal(item, 'risk', 'medium');
    })
  ).filter(Boolean)));

  var recommendations = dedupe(buildRecommendations(growthState, goals));
  var score = growth.score && typeof growth.score === 'object' ? growth.score : {};
  var dataSufficient = score.dataSufficient === true ||
    (growthState.dataSufficiency && growthState.dataSufficiency.overall === true);

  return {
    version: VERSION,
    role: ROLE,
    persona: PERSONA,
    insights: insights.slice(0, 4),
    recommendations: recommendations.slice(0, 3),
    warnings: warnings.slice(0, 4),
    encouragement: buildEncouragement(score, dataSufficient, warnings.length),
    dataSufficient: dataSufficient === true,
    readOnly: true
  };
}

var AICoach = {
  VERSION: VERSION,
  ROLE: ROLE,
  PERSONA: PERSONA,
  buildCoachContext: buildCoachContext
};

globalThis.CGAICoach = AICoach;
export default AICoach;
export { buildCoachContext };
