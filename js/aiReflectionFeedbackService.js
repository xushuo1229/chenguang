'use strict';

import CGAPI from './apiClient.js';

const FEEDBACK_TIMEOUT_MS = 10000;
const ALLOWED_RATINGS = new Set(['helpful', 'not_helpful']);

function createAiReflectionFeedbackService(options) {
  const client = (options && options.client) || CGAPI;
  return {
    submit({ reflectionId, rating }) {
      if (typeof reflectionId !== 'string' || !reflectionId.trim()) {
        return Promise.reject(new Error('INVALID_REFLECTION_ID'));
      }
      if (!ALLOWED_RATINGS.has(rating)) {
        return Promise.reject(new Error('INVALID_RATING'));
      }

      return client.ai.reflectionFeedback({
        reflectionId,
        rating,
        timeoutMs: FEEDBACK_TIMEOUT_MS
      }).then((response) => {
        if (!response || response.success !== true) {
          throw new Error('INVALID_FEEDBACK_RESPONSE');
        }
        return response;
      });
    }
  };
}

export {
  ALLOWED_RATINGS,
  FEEDBACK_TIMEOUT_MS,
  createAiReflectionFeedbackService
};
