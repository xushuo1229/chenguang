'use strict';

const { createAdapter } = require('./adapterContract');

function buildReflectionSummary() {
  return createAdapter({
    adapter: 'reflection',
    source: 'reflection_storage',
    authority: 'unavailable',
    type: 'user_reflection',
    data: {
      available: false,
      reason: 'reflection_storage_adapter_not_available',
    },
    confidence: 0,
  });
}

module.exports = {
  buildReflectionSummary,
};
