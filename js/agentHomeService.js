'use strict';

import CGAPI from './apiClient.js';

const AGENT_CONTEXT_VERSION = 'learning-context-v1';
const AGENT_INSIGHT_VERSION = 'agent-insight-v1';

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
  if (!isObject(payload.metadata) || payload.metadata.readOnly !== true) {
    throw new Error('INVALID_AGENT_INSIGHTS');
  }
  return payload;
}

function createAgentHomeService(options) {
  const client = (options && options.client) || CGAPI;
  return {
    load() {
      return Promise.all([
        client.agentHome.context().then(normalizeContext),
        client.agentHome.insights().then(normalizeInsights),
      ]).then(([context, insights]) => ({ context, insights }));
    },
  };
}

export {
  AGENT_CONTEXT_VERSION,
  AGENT_INSIGHT_VERSION,
  createAgentHomeService,
  normalizeContext,
  normalizeInsights,
};
