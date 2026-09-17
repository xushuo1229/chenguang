'use strict';

import CGAPI from './apiClient.js';

const REFLECTION_TIMEOUT_MS = 35000;

function normalizeReflectionResponse(response) {
  const reflection = response && response.data && response.data.reflection;
  if (!reflection || typeof reflection !== 'object' || Array.isArray(reflection)) {
    throw new Error('INVALID_REFLECTION_RESPONSE');
  }

  return {
    reflection,
    reflectionId: response.data.reflectionId || '',
    meta: response.meta || {}
  };
}

function createAiReflectionService(options) {
  const client = (options && options.client) || CGAPI;
  return {
    generate(context) {
      return client.ai.reflection({
        context: context || {},
        timeoutMs: REFLECTION_TIMEOUT_MS
      }).then(normalizeReflectionResponse);
    }
  };
}

export {
  REFLECTION_TIMEOUT_MS,
  createAiReflectionService,
  normalizeReflectionResponse
};
