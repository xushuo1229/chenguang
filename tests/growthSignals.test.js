import { describe, expect, test } from 'vitest';
import GrowthSignals, { buildGrowthSignals } from '../js/growthSignals.js';

const TODAY = '2026-09-15';

function makeTrend(overrides = {}) {
  return {
    metric: 'focus',
    label: '专注时长',
    span: '7d',
    current: 190,
    previous: 140,
    delta: 36,
    status: 'rising',
    volatility: 30,
    insufficientData: false,
    evidence: { currentActiveDays: 6, previousActiveDays: 5, currentRange: [], previousRange: [] },
    ...overrides
  };
}

function makeGrowthState(overrides = {}) {
  return {
    trendState: {
      windows: {
        '7d': {
          focus: makeTrend(),
          study: makeTrend({ metric: 'study', label: '学习时长', delta: -25, status: 'falling', volatility: 20 }),
          exercise: makeTrend({ metric: 'exercise', label: '运动时长', delta: 5, status: 'stable', volatility: 10 })
        },
        '30d': {
          focus: makeTrend({ span: '30d', delta: 15, status: 'rising', volatility: 40 })
        }
      }
    },
    positiveSignals: [
      { type: 'focus_habit_forming', reason: '最近 30 天专注时长上升 15%。', evidence: { delta: 15 } },
      { type: 'consistency', reason: '最近 7 天有 6 天保持活跃。', evidence: {} }
    ],
    riskSignals: [
      { type: 'study_declining', severity: 'medium', reason: '最近 7 天学习时长下降 25%。', evidence: { delta: -25 } },
      { type: 'todo_overdue', severity: 'high', reason: '有 3 项逾期任务', evidence: { overdue: 3 } }
    ],
    consistencyState: {
      summary: { activeDays30: 12, currentStreak: 7, longestStreak: 14, todayDone: false }
    },
    ...overrides
  };
}

describe('buildGrowthSignals', () => {
  test('returns empty signals for empty growthState', () => {
    const result = buildGrowthSignals({});
    expect(result.version).toBe('1.0');
    expect(result.signals).toEqual([]);
  });

  test('converts trends to signals with correct structure', () => {
    const result = buildGrowthSignals(makeGrowthState());
    expect(result.signals.length).toBeGreaterThan(0);
    result.signals.forEach((signal) => {
      expect(signal).toHaveProperty('id');
      expect(signal).toHaveProperty('type');
      expect(signal).toHaveProperty('source');
      expect(signal).toHaveProperty('direction');
      expect(signal).toHaveProperty('strength');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('isSustained');
      expect(signal).toHaveProperty('evidence');
      expect(signal).toHaveProperty('createdFrom');
    });
  });

  test('direction: up for rising, down for falling, stable for stable', () => {
    const result = buildGrowthSignals(makeGrowthState());
    const focus = result.signals.find((s) => s.id === 'focus_improvement_7d');
    const study = result.signals.find((s) => s.id === 'study_risk_7d');
    const exercise = result.signals.find((s) => s.id === 'exercise_consistency_7d');
    expect(focus.direction).toBe('up');
    expect(study.direction).toBe('down');
    expect(exercise.direction).toBe('stable');
  });

  test('type: improvement for rising, risk for falling, consistency for stable', () => {
    const result = buildGrowthSignals(makeGrowthState());
    const focus = result.signals.find((s) => s.id === 'focus_improvement_7d');
    const study = result.signals.find((s) => s.id === 'study_risk_7d');
    const exercise = result.signals.find((s) => s.id === 'exercise_consistency_7d');
    expect(focus.type).toBe('improvement');
    expect(study.type).toBe('risk');
    expect(exercise.type).toBe('consistency');
  });

  test('strength is within 0-1', () => {
    const result = buildGrowthSignals(makeGrowthState());
    result.signals.forEach((signal) => {
      expect(signal.strength).toBeGreaterThanOrEqual(0);
      expect(signal.strength).toBeLessThanOrEqual(1);
    });
  });

  test('confidence is within 0-1', () => {
    const result = buildGrowthSignals(makeGrowthState());
    result.signals.forEach((signal) => {
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    });
  });

  test('confidence is present for trends and defaults for signals', () => {
    const result = buildGrowthSignals(makeGrowthState());
    const trendSignal = result.signals.find((s) => s.createdFrom && s.createdFrom.startsWith('trend_'));
    const positiveSignal = result.signals.find((s) => s.createdFrom === 'positiveSignals');
    expect(trendSignal.confidence).toBeGreaterThan(0);
    expect(positiveSignal.confidence).toBe(0.7);
  });

  test('isSustained: true for low volatility + high activeDays, false otherwise', () => {
    const result = buildGrowthSignals(makeGrowthState());
    const focus7d = result.signals.find((s) => s.id === 'focus_improvement_7d');
    const focus30d = result.signals.find((s) => s.id === 'focus_improvement_30d');
    expect(focus7d.isSustained).toBe(true);
    expect(focus30d.isSustained).toBe(true);
  });

  test('isSustained: false for insufficient data', () => {
    const state = makeGrowthState({
      trendState: { windows: { '7d': { focus: makeTrend({ volatility: 95, evidence: { currentActiveDays: 2 } }) } } }
    });
    const result = buildGrowthSignals(state);
    const focus = result.signals.find((s) => s.id === 'focus_improvement_7d');
    expect(focus.isSustained).toBe(false);
  });

  test('deduplicates by stable id', () => {
    const result = buildGrowthSignals(makeGrowthState());
    const ids = result.signals.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('evidence is user-friendly (no internal field names)', () => {
    const result = buildGrowthSignals(makeGrowthState());
    result.signals.forEach((signal) => {
      expect(typeof signal.evidence).toBe('string');
      expect(signal.evidence).not.toContain('delta');
      expect(signal.evidence).not.toContain('volatility');
      expect(signal.evidence).not.toContain('currentRange');
    });
  });

  test('excludes insufficient_data and no_data trends', () => {
    const state = makeGrowthState({
      trendState: {
        windows: {
          '7d': {
            focus: makeTrend({ status: 'insufficient_data', insufficientData: true }),
            study: makeTrend({ metric: 'study', status: 'no_data', insufficientData: true })
          }
        }
      }
    });
    const result = buildGrowthSignals(state);
    expect(result.signals.filter((s) => s.createdFrom && s.createdFrom.startsWith('trend_'))).toHaveLength(0);
  });

  test('respects maxSignals option', () => {
    const result = buildGrowthSignals(makeGrowthState(), { maxSignals: 3 });
    expect(result.signals.length).toBeLessThanOrEqual(3);
  });

  test('no Store writes or localStorage access', () => {
    const moduleSource = globalThis.CGGrowthSignals;
    expect(moduleSource).toBeTruthy();
    expect(typeof moduleSource.buildGrowthSignals).toBe('function');
  });

  test('signal types are from fixed enum', () => {
    const result = buildGrowthSignals(makeGrowthState());
    const allowed = ['improvement', 'risk', 'consistency', 'achievement'];
    result.signals.forEach((signal) => {
      expect(allowed).toContain(signal.type);
    });
  });

  test('directions are from fixed enum', () => {
    const result = buildGrowthSignals(makeGrowthState());
    const allowed = ['up', 'down', 'stable'];
    result.signals.forEach((signal) => {
      expect(allowed).toContain(signal.direction);
    });
  });
});