import { test, expect } from 'vitest';
import GrowthMemory from '../js/growthMemory.js';
import { dateStr } from '../js/utils/date.js';

const TODAY = dateStr(0);

function evidence(overrides = {}) {
  return {
    source: 'GrowthIntelligence',
    metric: 'focus',
    value: 32,
    timestamp: TODAY,
    ...overrides
  };
}

function item(overrides = {}) {
  return {
    id: 'candidate:focus_habit_forming',
    type: 'Habit',
    content: '稳定专注习惯。',
    status: 'pending',
    evidence: [evidence()],
    updatedAt: TODAY,
    ...overrides
  };
}

test('calculateConfidence 输出 0-1 与可解释 confidenceMeta', () => {
  const result = GrowthMemory.calculateConfidence(item(), { today: TODAY });

  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(result.confidenceMeta).toEqual({
    evidenceScore: expect.any(Number),
    recencyWeight: expect.any(Number),
    confirmationWeight: expect.any(Number),
    calculatedAt: TODAY
  });
  expect(result.confidenceMeta.evidenceScore).toBeGreaterThanOrEqual(0);
  expect(result.confidenceMeta.evidenceScore).toBeLessThanOrEqual(1);
  expect(result.confidenceMeta.recencyWeight).toBeGreaterThanOrEqual(0);
  expect(result.confidenceMeta.recencyWeight).toBeLessThanOrEqual(1);
  expect(result.confidenceMeta.confirmationWeight).toBeGreaterThanOrEqual(0);
  expect(result.confidenceMeta.confirmationWeight).toBeLessThanOrEqual(1);
});

test('无 evidence 或非法 evidence source 时 confidence 为 0', () => {
  expect(GrowthMemory.calculateConfidence(item({ evidence: [] }), { today: TODAY }).confidence).toBe(0);
  expect(GrowthMemory.calculateConfidence(item({
    evidence: [evidence({ source: 'AI' })]
  }), { today: TODAY }).confidence).toBe(0);
});

test('更强 evidence 提升 confidence', () => {
  const weak = GrowthMemory.calculateConfidence(item({
    evidence: [evidence({ value: 5 })]
  }), { today: TODAY });
  const strong = GrowthMemory.calculateConfidence(item({
    evidence: [evidence({ value: 50 })]
  }), { today: TODAY });

  expect(strong.confidence).toBeGreaterThan(weak.confidence);
});

test('更多 evidence 提升 evidenceScore', () => {
  const one = GrowthMemory.calculateConfidence(item(), { today: TODAY });
  const three = GrowthMemory.calculateConfidence(item({
    evidence: [
      evidence(),
      evidence({ metric: 'study', value: 30 }),
      evidence({ metric: 'goal', value: 2, source: 'Goals' })
    ]
  }), { today: TODAY });

  expect(three.confidenceMeta.evidenceScore).toBeGreaterThan(one.confidenceMeta.evidenceScore);
});

test('时间衰减降低 confidence，90 天后过期', () => {
  const current = GrowthMemory.calculateConfidence(item(), { today: TODAY });
  const aged = GrowthMemory.calculateConfidence(item({
    evidence: [evidence({ timestamp: dateStr(-60) })]
  }), { today: TODAY });
  const expired = GrowthMemory.calculateConfidence(item({
    status: 'confirmed',
    evidence: [evidence({ timestamp: dateStr(-90) })]
  }), { today: TODAY });

  expect(current.confidence).toBeGreaterThan(aged.confidence);
  expect(expired.confidence).toBe(0);
});

test('confirmed confidence 高于 pending，expired confidence 归零', () => {
  const pending = GrowthMemory.calculateConfidence(item({ status: 'pending' }), { today: TODAY });
  const confirmed = GrowthMemory.calculateConfidence(item({ status: 'confirmed' }), { today: TODAY });
  const expired = GrowthMemory.calculateConfidence(item({ status: 'expired' }), { today: TODAY });

  expect(confirmed.confidence).toBeGreaterThan(pending.confidence);
  expect(expired.confidence).toBe(0);
});
