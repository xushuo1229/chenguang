'use strict';

var VERSION = '1.0';

var SIGNAL_TYPES = ['improvement', 'risk', 'consistency', 'achievement'];
var DIRECTIONS = ['up', 'down', 'stable'];
var METRIC_SOURCES = {
  study: 'study', focus: 'focus', english: 'english',
  exercise: 'exercise', reading: 'reading', todoDone: 'todo', activity: 'streak'
};

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
function clamp01(value) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
function directionFromStatus(status) {
  if (status === 'rising' || status === 'new_activity') return 'up';
  if (status === 'falling') return 'down';
  return 'stable';
}

function trendStrength(trend) {
  var absDelta = Math.abs(num(trend.delta));
  var volatility = num(trend.volatility);
  return clamp01(absDelta / (100 + volatility));
}

function trendConfidence(trend) {
  var active = num(trend.evidence && trend.evidence.currentActiveDays);
  var volatility = num(trend.volatility);
  var base = clamp01(active / 7);
  var penalty = clamp01(volatility / 200);
  return clamp01(base - penalty + 0.2);
}

function isSustainedTrend(trend) {
  var active = num(trend.evidence && trend.evidence.currentActiveDays);
  var volatility = num(trend.volatility);
  return volatility < 50 && active >= 5;
}

function trendEvidence(trend) {
  var label = trend.label || trend.metric;
  var delta = num(trend.delta);
  if (trend.status === 'rising' || trend.status === 'new_activity') {
    return '最近 ' + trend.span + ' ' + label + '上升 ' + delta + '%。';
  }
  if (trend.status === 'falling') {
    return '最近 ' + trend.span + ' ' + label + '下降 ' + Math.abs(delta) + '%。';
  }
  return '最近 ' + trend.span + ' ' + label + '保持稳定。';
}

function trendSignal(trend, span) {
  var direction = directionFromStatus(trend.status);
  var type = direction === 'up' ? 'improvement' : direction === 'down' ? 'risk' : 'consistency';
  var metricKey = trend.metric;
  return {
    id: metricKey + '_' + type + '_' + span,
    type: type,
    source: METRIC_SOURCES[metricKey] || metricKey,
    direction: direction,
    strength: trendStrength(trend),
    confidence: trendConfidence(trend),
    isSustained: isSustainedTrend(trend),
    evidence: trendEvidence(trend),
    createdFrom: 'trend_' + span
  };
}

function positiveToSignal(item) {
  var type = item.type === 'consistency' ? 'consistency' : item.type === 'goal_achieved' ? 'achievement' : 'improvement';
  var direction = type === 'consistency' ? 'stable' : 'up';
  return {
    id: (item.type || 'positive') + '_signal',
    type: type,
    source: 'growth',
    direction: direction,
    strength: 0.6,
    confidence: 0.7,
    isSustained: type === 'consistency',
    evidence: item.reason || '',
    createdFrom: 'positiveSignals'
  };
}

function riskToSignal(item) {
  var severity = item.severity || 'medium';
  return {
    id: (item.type || 'risk') + '_signal',
    type: 'risk',
    source: 'growth',
    direction: 'down',
    strength: severity === 'high' ? 0.8 : severity === 'low' ? 0.3 : 0.5,
    confidence: severity === 'high' ? 0.85 : 0.6,
    isSustained: false,
    evidence: item.reason || '',
    createdFrom: 'riskSignals'
  };
}

function consistencySignal(consistencyState) {
  var summary = (consistencyState && consistencyState.summary) || {};
  var activeDays = num(summary.activeDays30);
  var streak = num(summary.currentStreak);
  if (activeDays === 0 && streak === 0) return null;
  var strength = clamp01(activeDays / 30);
  return {
    id: 'activity_consistent',
    type: 'consistency',
    source: 'streak',
    direction: streak > 0 ? 'up' : 'stable',
    strength: strength,
    confidence: clamp01(activeDays / 14),
    isSustained: activeDays >= 5,
    evidence: '近 30 天有 ' + activeDays + ' 天保持活跃，当前连续 ' + streak + ' 天。',
    createdFrom: 'consistencyState'
  };
}

function dedupe(signals) {
  var seen = {};
  return arr(signals).filter(function (signal) {
    if (!signal || !signal.id || seen[signal.id]) return false;
    seen[signal.id] = true;
    return true;
  });
}

function sortSignals(signals) {
  var typeOrder = { improvement: 0, achievement: 1, risk: 2, consistency: 3 };
  return signals.slice().sort(function (a, b) {
    var typeDiff = (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9);
    if (typeDiff !== 0) return typeDiff;
    return (b.strength || 0) - (a.strength || 0);
  });
}

function buildGrowthSignals(growthState, opts) {
  var options = opts && typeof opts === 'object' ? opts : {};
  var state = growthState && typeof growthState === 'object' ? growthState : {};
  var maxSignals = Math.max(1, num(options.maxSignals) || 12);
  var windows = (state.trendState && state.trendState.windows) || {};
  var spans = options.spans || ['7d', '30d'];
  var signals = [];

  spans.forEach(function (span) {
    var windowTrends = windows[span];
    if (!windowTrends || typeof windowTrends !== 'object') return;
    Object.keys(windowTrends).forEach(function (metricKey) {
      var trend = windowTrends[metricKey];
      if (!trend || trend.insufficientData || trend.status === 'no_data') return;
      signals.push(trendSignal(trend, span));
    });
  });

  arr(state.positiveSignals).forEach(function (item) {
    if (item && item.reason) signals.push(positiveToSignal(item));
  });
  arr(state.riskSignals).forEach(function (item) {
    if (item && item.reason) signals.push(riskToSignal(item));
  });

  var cs = consistencySignal(state.consistencyState);
  if (cs) signals.push(cs);

  return {
    version: VERSION,
    signals: sortSignals(dedupe(signals)).slice(0, maxSignals)
  };
}

var GrowthSignals = {
  VERSION: VERSION,
  TYPES: SIGNAL_TYPES,
  DIRECTIONS: DIRECTIONS,
  buildGrowthSignals: buildGrowthSignals
};

globalThis.CGGrowthSignals = GrowthSignals;

export default GrowthSignals;
export { buildGrowthSignals };