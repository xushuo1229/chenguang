'use strict';

const {
  asArray,
  boundedNumber,
  boundaryHasType,
  createEvidence,
  createInsight,
} = require('../ruleSupport');

function buildCourseProgressRule(courseKnowledge) {
  if (!boundaryHasType(courseKnowledge, 'course_knowledge_projection')) return null;
  const nodes = asArray(courseKnowledge.value && courseKnowledge.value.nodes)
    .slice(0, 10);
  if (!nodes.length) return null;

  const accepted = nodes.filter((node) => node && node.status === 'accepted').length;
  const validated = nodes.filter((node) => node && node.status === 'validated').length;
  const total = nodes.length;
  return createInsight({
    id: 'course-progress-status',
    type: 'course_progress_status',
    title: `课程知识节点共 ${total} 个。`,
    explanation: accepted === total
      ? '全部知识节点已进入 accepted 状态。'
      : `其中 accepted ${accepted} 个，validated ${validated} 个。`,
    source: courseKnowledge.source,
    authority: courseKnowledge.authority,
    evidence: [
      createEvidence({
        source: 'course_knowledge_adapter',
        authority: courseKnowledge.authority,
        metric: 'nodes.total',
        period: 'current',
        value: total,
      }),
      createEvidence({
        source: 'course_knowledge_adapter',
        authority: courseKnowledge.authority,
        metric: 'nodes.accepted',
        period: 'current',
        value: boundedNumber(accepted, 10),
      }),
      createEvidence({
        source: 'course_knowledge_adapter',
        authority: courseKnowledge.authority,
        metric: 'nodes.validated',
        period: 'current',
        value: boundedNumber(validated, 10),
      }),
    ],
  });
}

module.exports = {
  buildCourseProgressRule,
};
