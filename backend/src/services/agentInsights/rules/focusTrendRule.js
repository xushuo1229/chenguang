'use strict';

const {
  boundedNumber,
  boundaryHasType,
  createEvidence,
  createInsight,
} = require('../ruleSupport');

function average(minutes, days) {
  return Math.round((minutes / days) * 10) / 10;
}

function buildFocusTrendRule(behavior) {
  if (!boundaryHasType(behavior, 'behavior_summary')) return null;
  const recent7 = behavior.value && behavior.value.recent7
    ? behavior.value.recent7
    : {};
  const current3 = boundedNumber(recent7.current3FocusMinutes, 100000);
  const previous4 = boundedNumber(recent7.previous4FocusMinutes, 100000);
  const total = boundedNumber(recent7.focusMinutes, 100000);
  if (total <= 0 || current3 === previous4) return null;

  const increased = current3 > previous4;
  const currentAverage = average(current3, 3);
  const previousAverage = average(previous4, 4);

  return createInsight({
    id: 'focus-trend-7d',
    type: increased ? 'focus_increase' : 'focus_decline',
    title: increased ? '过去 7 天专注趋势上升。' : '过去 7 天专注趋势下降。',
    explanation: increased
      ? `最近 3 天日均专注 ${currentAverage} 分钟，此前 4 天日均 ${previousAverage} 分钟。`
      : `最近 3 天日均专注 ${currentAverage} 分钟，此前 4 天日均 ${previousAverage} 分钟。`,
    source: behavior.source,
    authority: behavior.authority,
    evidence: [
      createEvidence({
        source: 'behavior_adapter',
        authority: behavior.authority,
        metric: 'focus_minutes',
        period: 'current_3d',
        value: current3,
      }),
      createEvidence({
        source: 'behavior_adapter',
        authority: behavior.authority,
        metric: 'focus_minutes',
        period: 'previous_4d',
        value: previous4,
      }),
      createEvidence({
        source: 'behavior_adapter',
        authority: behavior.authority,
        metric: 'focus_minutes',
        period: '7d',
        value: total,
      }),
    ],
  });
}

module.exports = {
  buildFocusTrendRule,
};
