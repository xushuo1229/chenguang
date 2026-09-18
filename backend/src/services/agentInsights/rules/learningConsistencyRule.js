'use strict';

const {
  boundedNumber,
  boundaryHasType,
  createEvidence,
  createInsight,
} = require('../ruleSupport');

function buildLearningConsistencyRule(behavior) {
  if (!boundaryHasType(behavior, 'behavior_summary')) return null;
  const recent7 = behavior.value && behavior.value.recent7
    ? behavior.value.recent7
    : {};
  const activeDays = boundedNumber(recent7.studyActiveDays, 7);
  const current3 = boundedNumber(recent7.current3StudyDays, 3);
  const previous4 = boundedNumber(recent7.previous4StudyDays, 4);
  if (activeDays <= 0) return null;

  if (previous4 > 0 && current3 === 0) {
    return createInsight({
      id: 'learning-consistency-drop',
      type: 'consistency_drop',
      title: '学习连续性出现下降。',
      explanation: `此前 4 天有 ${previous4} 天学习记录，最近 3 天暂无学习记录。`,
      source: behavior.source,
      authority: behavior.authority,
      evidence: [
        createEvidence({
          source: 'behavior_adapter',
          authority: behavior.authority,
          metric: 'study_active_days',
          period: 'previous_4d',
          value: previous4,
        }),
        createEvidence({
          source: 'behavior_adapter',
          authority: behavior.authority,
          metric: 'study_active_days',
          period: 'current_3d',
          value: current3,
        }),
      ],
    });
  }

  if (activeDays >= 3 && current3 > 0) {
    return createInsight({
      id: 'learning-consistency-stable',
      type: 'consistency_stable',
      title: '学习连续性保持稳定。',
      explanation: `最近 7 天有 ${activeDays} 天学习记录，最近 3 天保持活跃。`,
      source: behavior.source,
      authority: behavior.authority,
      evidence: [
        createEvidence({
          source: 'behavior_adapter',
          authority: behavior.authority,
          metric: 'study_active_days',
          period: '7d',
          value: activeDays,
        }),
        createEvidence({
          source: 'behavior_adapter',
          authority: behavior.authority,
          metric: 'study_active_days',
          period: 'current_3d',
          value: current3,
        }),
      ],
    });
  }

  return null;
}

module.exports = {
  buildLearningConsistencyRule,
};
