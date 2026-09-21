'use strict';

import CGAPI from './apiClient.js';

const AGENT_CONTEXT_VERSION = 'learning-context-v1';
const AGENT_INSIGHT_VERSION = 'agent-insight-v1';
const AGENT_REASONING_VERSION = 'agent-reasoning-v1';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeContext(response) {
  const context = isObject(response) && isObject(response.data) ? response.data : null;
  if (!context || context.version !== AGENT_CONTEXT_VERSION || context.readOnly !== true) {
    throw new Error('INVALID_AGENT_CONTEXT');
  }
  return context;
}

function normalizeInsights(response) {
  const payload = isObject(response) && isObject(response.data) ? response.data : null;
  if (!payload || payload.version !== AGENT_INSIGHT_VERSION || !Array.isArray(payload.insights)) {
    throw new Error('INVALID_AGENT_INSIGHTS');
  }
  if (!isObject(payload.metadata) || payload.metadata.readOnly !== true || payload.metadata.actionLevel !== 'insight_only') {
    throw new Error('INVALID_AGENT_INSIGHTS');
  }
  if (payload.insights.some((insight) => insight && insight.actionLevel && insight.actionLevel !== 'insight_only')) {
    throw new Error('INVALID_AGENT_INSIGHTS');
  }
  return payload;
}

function normalizeReasoning(response) {
  const reasoning = isObject(response) && isObject(response.data) ? response.data : null;
  if (!reasoning || reasoning.version !== AGENT_REASONING_VERSION || reasoning.scope !== 'agent_home') {
    throw new Error('INVALID_AGENT_REASONING');
  }
  if (!isObject(reasoning.permissions) || !Array.isArray(reasoning.permissions.write) || reasoning.permissions.write.length > 0) {
    throw new Error('INVALID_AGENT_REASONING');
  }
  if (!isObject(reasoning.metadata) || reasoning.metadata.readOnly !== true || reasoning.metadata.actionLevel !== 'insight_only') {
    throw new Error('INVALID_AGENT_REASONING');
  }
  if (!Array.isArray(reasoning.explanations)) {
    throw new Error('INVALID_AGENT_REASONING');
  }
  if (reasoning.available === true && !reasoning.explanations.length) {
    throw new Error('INVALID_AGENT_REASONING');
  }
  if (reasoning.explanations.some((explanation) => explanation && explanation.actionLevel && explanation.actionLevel !== 'insight_only')) {
    throw new Error('INVALID_AGENT_REASONING');
  }
  return reasoning;
}

function createReasoningFallback(context) {
  return {
    version: AGENT_REASONING_VERSION,
    generatedAt: new Date().toISOString(),
    userId: context && context.userId,
    scope: 'agent_home',
    available: false,
    reason: 'reasoning_unavailable',
    summary: {
      title: '暂无推理解释',
      narrative: '当前没有可解释的结构化洞察。',
      insightCount: 0,
      evidenceCount: 0,
    },
    explanations: [],
    permissions: {
      read: ['deterministic_insights'],
      write: [],
    },
    metadata: {
      readOnly: true,
      actionLevel: 'insight_only',
      sourceInsightVersion: AGENT_INSIGHT_VERSION,
      contextVersion: AGENT_CONTEXT_VERSION,
    },
  };
}

function normalizeLearningConversation(response) {
  const result = isObject(response) && isObject(response.data) ? response.data : null;
  if (!result || result.version !== 'learning-conversation-v1' || result.readOnly !== true
    || !isObject(result.permissions) || result.permissions.write.length > 0) {
    throw new Error('INVALID_LEARNING_CONVERSATION');
  }
  return result;
}

function createAgentHomeService(options) {
  const client = (options && options.client) || CGAPI;
  return {
    load() {
      return Promise.all([
        client.agentHome.context().then(normalizeContext),
        client.agentHome.insights().then(normalizeInsights),
      ]).then(([context, insights]) => client.agentHome.reasoning()
        .then(normalizeReasoning)
        .catch(() => createReasoningFallback(context))
        .then((reasoning) => ({ context, insights, reasoning })));
    },
    async askLearningConversation(payload) {
      return client.agentHome.learningConversation(payload).then(normalizeLearningConversation);
    },
  };
}

export {
  AGENT_CONTEXT_VERSION,
  AGENT_INSIGHT_VERSION,
  AGENT_REASONING_VERSION,
  createAgentHomeService,
  normalizeContext,
  normalizeInsights,
  normalizeReasoning,
  normalizeLearningConversation,
};
