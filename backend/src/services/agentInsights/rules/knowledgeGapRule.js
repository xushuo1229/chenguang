'use strict';

const {
  asArray,
  boundedNumber,
  boundedText,
  boundaryHasType,
  createEvidence,
  createInsight,
} = require('../ruleSupport');

function buildKnowledgeGapRule(knowledgeStates) {
  if (!boundaryHasType(knowledgeStates, 'student_knowledge_state_projection')) return null;
  const value = knowledgeStates.value || {};
  const weakTopics = asArray(value.weakTopics)
    .filter((topic) => topic && boundedText(topic.title))
    .slice(0, 5);
  if (!weakTopics.length) return null;

  const titles = weakTopics.map((topic) => boundedText(topic.title, 80));
  return createInsight({
    id: 'knowledge-gap-detected',
    type: 'knowledge_gap_detected',
    title: `检测到 ${weakTopics.length} 个薄弱知识主题。`,
    explanation: `掌握度最低的主题包括：${titles.slice(0, 3).join('、')}。`,
    source: knowledgeStates.source,
    authority: knowledgeStates.authority,
    evidence: weakTopics.map((topic, index) => createEvidence({
      source: 'student_knowledge_adapter',
      authority: knowledgeStates.authority,
      metric: `weakTopics[${index}].masteryLevel`,
      period: 'current',
      value: boundedNumber(topic.masteryLevel, 1),
    })),
  });
}

module.exports = {
  buildKnowledgeGapRule,
};
