import { test, expect } from 'vitest';
import GrowthMemory from '../js/growthMemory.js';
import { dateStr } from '../js/utils/date.js';

const TODAY = dateStr(0);

function memoryItem(id, overrides = {}) {
  return {
    id,
    type: 'Habit',
    content: `stable behavior ${id}`,
    status: 'confirmed',
    confidence: 0.8,
    evidence: [{
      source: 'GrowthIntelligence',
      metric: 'focus',
      value: 20,
      timestamp: TODAY
    }],
    ...overrides
  };
}

function memory(overrides = {}) {
  return {
    patterns: [],
    milestones: [],
    preferences: [],
    insights: [],
    candidates: [
      memoryItem('candidate:focus-up'),
      memoryItem('candidate:english-up', {
        evidence: [{ source: 'Analytics', metric: 'english', value: 15, timestamp: TODAY }]
      }),
      memoryItem('candidate:focus-down', {
        evidence: [{ source: 'Goals', metric: 'focus', value: -10, timestamp: TODAY }]
      })
    ],
    ...overrides
  };
}

test('relations only derive from current context nodes', () => {
  const context = GrowthMemory.buildContextMemory(memory(), { today: TODAY });
  const ids = new Set(context.relations.flatMap((relation) => [relation.sourceId, relation.targetId]));

  expect(context.relations.length).toBeGreaterThan(0);
  ids.forEach((id) => expect(id).toMatch(/^(candidate:|pattern:|milestone:|preference:)/));
});

test('relation rules and direction are deterministic', () => {
  const context = GrowthMemory.buildContextMemory(memory(), { today: TODAY });
  const relation = context.relations.find((item) => item.sourceId === 'candidate:focus-up' &&
    item.targetId === 'candidate:focus-down');

  expect(relation).toEqual({
    sourceId: 'candidate:focus-up',
    targetId: 'candidate:focus-down',
    type: 'conflicts',
    strength: expect.any(Number)
  });
  expect(relation.strength).toBeGreaterThan(0);
  expect(relation.strength).toBeLessThanOrEqual(1);
});

test('invalid, self, and missing-target relations are filtered', () => {
  const context = GrowthMemory.buildContextMemory({
    patterns: [], milestones: [], preferences: [], insights: [],
    candidates: [memoryItem('candidate:focus-up', {
      relations: [
        { sourceId: 'candidate:focus-up', targetId: 'candidate:focus-up', type: 'hack', strength: 2 },
        { sourceId: 'candidate:focus-up', targetId: 'candidate:missing', type: 'supports', strength: 1 }
      ]
    })]
  }, { today: TODAY });

  expect(context.relations).toEqual([]);
});

test('relation limits stay within context budget', () => {
  const candidates = [];
  for (let index = 0; index < 8; index += 1) {
    candidates.push(memoryItem(`candidate:focus-${index}`, {
      evidence: [{ source: 'Analytics', metric: 'focus', value: index + 1, timestamp: TODAY }]
    }));
  }
  const context = GrowthMemory.buildContextMemory({
    patterns: [], milestones: [], preferences: [], insights: [], candidates
  }, { today: TODAY });
  const bySource = context.relations.reduce((counts, relation) => {
    counts[relation.sourceId] = (counts[relation.sourceId] || 0) + 1;
    return counts;
  }, {});

  expect(context.relations.length).toBeLessThanOrEqual(8);
  Object.values(bySource).forEach((count) => expect(count).toBeLessThanOrEqual(3));
});
