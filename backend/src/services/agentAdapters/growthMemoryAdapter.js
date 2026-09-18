'use strict';

const { asArray, boundedNumber, boundedText, createAdapter } = require('./adapterContract');

const MEMORY_LIMIT = 10;

function projectMemory(payload) {
  const memory = payload && payload.user && payload.user.memory && typeof payload.user.memory === 'object'
    ? payload.user.memory
    : {};
  const items = ['patterns', 'milestones', 'preferences', 'insights']
    .flatMap((category) => asArray(memory[category]).map((item) => ({ item, category })))
    .filter(({ item }) => item && item.content && item.status !== 'inactive')
    .slice(0, MEMORY_LIMIT)
    .map(({ item, category }) => ({
      id: boundedText(item.id, 120),
      category: boundedText(category, 40),
      type: boundedText(item.type, 40),
      content: boundedText(item.content, 220),
      confidence: boundedNumber(item.confidence, 1),
      updatedAt: boundedText(item.updatedAt, 30),
    }))
    .filter((item) => item.id && item.content);

  return {
    available: items.length > 0,
    items,
  };
}

function buildGrowthMemoryProjection({ snapshot }) {
  if (!snapshot || snapshot.adapter !== 'sync_data' || snapshot.readOnly !== true) {
    const error = new Error('INVALID_ADAPTER_INPUT');
    error.code = 'INVALID_ADAPTER_INPUT';
    error.statusCode = 400;
    throw error;
  }

  return createAdapter({
    adapter: 'growth_memory',
    source: 'cgstore.user.memory',
    authority: 'derived_memory',
    type: 'growth_memory_projection',
    data: projectMemory(snapshot.data),
    confidence: 0.5,
  });
}

module.exports = {
  buildGrowthMemoryProjection,
};
