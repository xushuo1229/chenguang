'use strict';

const stateService = require('./studentKnowledgeStateService');

const STATE_LIMIT = 50;

function evaluateState(state) {
  const passed = state.state === 'mastered';
  return {
    courseId: state.courseId,
    knowledgeNodeId: state.knowledgeNodeId,
    nodeTitle: state.nodeTitle,
    masteryLevel: state.masteryLevel,
    confidence: state.confidence,
    state: state.state,
    evidenceCount: state.evidenceCount,
    gate: passed ? 'passed' : 'not_ready',
    requirements: {
      masteryAtLeast75: state.masteryLevel >= 0.75,
      twoEvidenceItems: state.evidenceCount >= 2,
      assessmentEvidencePresent: state.state === 'mastered',
    },
  };
}

async function evaluateMasteryPromotion({ userId, courseId }) {
  const result = await stateService.listCourseStates({
    userId,
    courseId,
    query: { limit: STATE_LIMIT, offset: 0 },
  });
  return {
    courseId: result.courseId,
    evaluations: result.states.map(evaluateState),
    limit: STATE_LIMIT,
    metadata: {
      gateVersion: 'mastery-promotion-gate-v1',
      derivedFrom: 'student_knowledge_state',
      readOnly: true,
    },
  };
}

async function buildReviewQueue({ userId, courseId }) {
  const result = await stateService.listCourseStates({
    userId,
    courseId,
    query: { limit: STATE_LIMIT, offset: 0 },
  });
  const items = result.states
    .filter((state) => state.state !== 'mastered')
    .map((state) => ({
      courseId: state.courseId,
      knowledgeNodeId: state.knowledgeNodeId,
      nodeTitle: state.nodeTitle,
      masteryLevel: state.masteryLevel,
      confidence: state.confidence,
      state: state.state,
      evidenceCount: state.evidenceCount,
      priority: state.state === 'weak' ? 1 : 2,
      reason: state.state === 'weak' ? 'weak_state' : 'consolidation_needed',
    }))
    .sort((left, right) => left.priority - right.priority
      || left.masteryLevel - right.masteryLevel
      || left.nodeTitle.localeCompare(right.nodeTitle))
    .slice(0, STATE_LIMIT);
  return {
    courseId: result.courseId,
    items,
    limit: STATE_LIMIT,
    metadata: {
      queueVersion: 'review-queue-v1',
      derivedFrom: 'student_knowledge_state',
      readOnly: true,
    },
  };
}

module.exports = {
  buildReviewQueue,
  evaluateMasteryPromotion,
};
