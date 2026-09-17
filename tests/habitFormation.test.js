import { describe, expect, test } from 'vitest';
import HabitFormation, { detectHabitFormation } from '../js/habitFormation.js';

const WINDOW = 7;

function series(pattern, base = 25) {
  return pattern.map(function (v, i) {
    const date = new Date(Date.UTC(2026, 8, 1 + i));
    return { date: date.toISOString().slice(0, 10), value: typeof v === 'function' ? v(i, base) : v };
  });
}

function zeros(n) { return Array.from({ length: n }, () => 0); }

describe('detectHabitFormation', () => {
  test('hardened API exposes additive fields and stable identifiers', () => {
    const result = detectHabitFormation(series([25, 25, 25, 25, 25, 25, 25]), WINDOW);
    expect(result.version).toBe('1.2');
    expect(result).toHaveProperty('currentConsecutive', 7);
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('reason');
    expect(HabitFormation.STATUS_VALUES).toEqual([
      'insufficient',
      'not_forming',
      'early',
      'forming',
      'stable'
    ]);
    expect(HabitFormation.REASON_VALUES).toEqual([
      'insufficient_data',
      'low_frequency',
      'low_continuity',
      'unstable',
      'habit_stopped',
      'forming'
    ]);
  });

  test('status represents observation stages', () => {
    const insufficient = detectHabitFormation(series([25, 0, 0, 0, 0, 0, 0]), WINDOW);
    expect(insufficient.status).toBe('insufficient');
    expect(insufficient.reason).toBe('insufficient_data');

    const early = detectHabitFormation(series([0, 0, 0, 0, 25, 25, 25]), WINDOW);
    expect(early.isHabitForming).toBe(true);
    expect(early.status).toBe('early');

    const forming = detectHabitFormation(series([25, 25, 25, 25, 25, 25, 25]), WINDOW);
    expect(forming.isHabitForming).toBe(true);
    expect(forming.status).toBe('forming');

    const stable = detectHabitFormation(series(Array.from({ length: 14 }, () => 25)), 14);
    expect(stable.isHabitForming).toBe(true);
    expect(stable.status).toBe('stable');
  });

  test('reason explains why behavior is not forming', () => {
    const stopped = detectHabitFormation(series([25, 25, 25, 0, 0, 0, 0]), WINDOW);
    expect(stopped.isHabitForming).toBe(true);
    expect(stopped.status).toBe('not_forming');
    expect(stopped.reason).toBe('habit_stopped');

    const lowContinuity = detectHabitFormation(
      series([...Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 25 : 0)), 25, 25]),
      30
    );
    expect(lowContinuity.reason).toBe('low_continuity');

    const lowFrequency = detectHabitFormation(
      series(Array.from({ length: 30 }, (_, i) => ([1, 5, 27, 28, 29].includes(i) ? 25 : 0))),
      30
    );
    expect(lowFrequency.reason).toBe('low_frequency');

    const unstable = detectHabitFormation(series([1, 1, 1000]), WINDOW);
    expect(unstable.consistency).toBeLessThan(0.1);
    expect(unstable.isHabitForming).toBe(false);
    expect(unstable.reason).toBe('unstable');
  });

  test('minFrequency can be overridden by caller', () => {
    const pattern = [0, 0, 0, 0, 0, 0, 0, 25, 25, 25];
    const defaulted = detectHabitFormation(series(pattern), 10);
    const overridden = detectHabitFormation(series(pattern), 10, { minFrequency: 0.2 });
    expect(defaulted.frequency).toBe(0.3);
    expect(defaulted.isHabitForming).toBe(true);
    const stricter = detectHabitFormation(series(pattern), 10, { minFrequency: 0.4 });
    expect(stricter.isHabitForming).toBe(false);
    expect(overridden.isHabitForming).toBe(true);
  });

  test('extreme value volatility is rejected', () => {
    const result = detectHabitFormation(series([1, 1, 1000]), WINDOW);
    expect(result.maxConsecutive).toBe(3);
    expect(result.currentConsecutive).toBe(3);
    expect(result.isHabitForming).toBe(false);
    expect(result.reason).toBe('unstable');
  });

  test('legacy result fields remain available', () => {
    const result = detectHabitFormation(series([25, 25, 25, 25, 25, 25, 25]), WINDOW);
    expect(result).toHaveProperty('isHabitForming', true);
    expect(result).toHaveProperty('habitScore');
    expect(result).toHaveProperty('frequency');
    expect(result).toHaveProperty('consistency');
    expect(result).toHaveProperty('maxConsecutive', 7);
  });

  test('window limits all observations to the last N days', () => {
    const result = detectHabitFormation(
      series([25, 25, 25, 25, 0, 0, 0, 25, 25, 25]),
      7
    );
    expect(result.activeDays).toBe(4);
    expect(result.windowDays).toBe(7);
    expect(result.frequency).toBeCloseTo(4 / 7, 3);
    expect(result.maxConsecutive).toBe(3);
    expect(result.currentConsecutive).toBe(3);
  });

  test('currentConsecutive cannot cross the window boundary', () => {
    const result = detectHabitFormation(
      series([25, 25, 25, 25, 0, 25, 25, 25]),
      7
    );
    expect(result.maxConsecutive).toBe(3);
    expect(result.currentConsecutive).toBe(3);
  });

  test('window boundaries are preserved', () => {
    const oneDay = detectHabitFormation(series([25, 25, 25]), 1);
    expect(oneDay.activeDays).toBe(1);
    expect(oneDay.windowDays).toBe(1);
    expect(oneDay.currentConsecutive).toBe(1);
    expect(oneDay.status).toBe('insufficient');

    const exactWindow = detectHabitFormation(series([25, 25, 25, 25, 25, 25, 25]), 7);
    expect(exactWindow.currentConsecutive).toBe(7);
    expect(exactWindow.status).toBe('forming');

    const largerWindow = detectHabitFormation(series([25, 25, 25]), 10);
    expect(largerWindow.activeDays).toBe(3);
    expect(largerWindow.windowDays).toBe(10);
    expect(largerWindow.frequency).toBe(0.3);
    expect(largerWindow.currentConsecutive).toBe(3);

    const empty = detectHabitFormation([], 7);
    expect(empty.activeDays).toBe(0);
    expect(empty.windowDays).toBe(7);
    expect(empty.currentConsecutive).toBe(0);
    expect(empty.status).toBe('insufficient');
  });

  test('early is an observation stage that can occur with or without the legacy boolean', () => {
    const legacyForming = detectHabitFormation(series([0, 0, 0, 0, 25, 25, 25]), WINDOW);
    expect(legacyForming.isHabitForming).toBe(true);
    expect(legacyForming.status).toBe('early');

    const evidenceOnly = detectHabitFormation(
      series([0, 0, 0, 0, 0, 0, 0, 25, 25, 25]),
      10,
      { minFrequency: 0.4 }
    );
    expect(evidenceOnly.isHabitForming).toBe(false);
    expect(evidenceOnly.status).toBe('early');
    expect(evidenceOnly.reason).toBe('low_frequency');
  });

  test('habitScore failure is not mislabeled as low frequency', () => {
    const values = [];
    for (let i = 0; i < 10; i += 1) values.push(25, 25, 0);
    values.push(25, 25, 25);
    for (let i = 0; i < 5; i += 1) values.push(25, 0);
    while (values.length < 98) values.push(0);
    values.push(25, 25);

    const result = detectHabitFormation(series(values), 100);
    expect(result.frequency).toBe(0.3);
    expect(result.habitScore).toBeLessThan(0.5);
    expect(result.maxConsecutive).toBeGreaterThanOrEqual(3);
    expect(result.currentConsecutive).toBeGreaterThanOrEqual(2);
    expect(result.isHabitForming).toBe(false);
    expect(result.status).toBe('early');
    expect(result.reason).toBe('unstable');
  });

  test('v1.0 boolean semantics remain backward compatible', () => {
    const stoppedStreak = detectHabitFormation(series([25, 25, 25, 0, 0, 0, 0]), WINDOW);
    expect(stoppedStreak.isHabitForming).toBe(true);
    expect(stoppedStreak.currentConsecutive).toBe(0);

    const trailingSingleActive = detectHabitFormation(series([25, 25, 25, 25, 25, 0, 25]), WINDOW);
    expect(trailingSingleActive.isHabitForming).toBe(true);
    expect(trailingSingleActive.currentConsecutive).toBe(1);

    const extremeValues = detectHabitFormation(series([1, 1, 1, 1, 1, 1, 1000]), WINDOW);
    expect(extremeValues.isHabitForming).toBe(true);
  });

  test('T1: 0 days returns not forming', () => {
    const result = detectHabitFormation([], WINDOW);
    expect(result.isHabitForming).toBe(false);
    expect(result.habitScore).toBe(0);
  });

  test('T2: 1 active day returns not forming (cold start)', () => {
    const result = detectHabitFormation(series([25, 0, 0, 0, 0, 0, 0]), WINDOW);
    expect(result.isHabitForming).toBe(false);
  });

  test('T3: 2 active days returns not forming (below minSamples)', () => {
    const result = detectHabitFormation(series([25, 25, 0, 0, 0, 0, 0]), WINDOW);
    expect(result.isHabitForming).toBe(false);
  });

  test('T4: single spike returns not forming', () => {
    const result = detectHabitFormation(series([100, 0, 0, 0, 0, 0, 25]), WINDOW);
    expect(result.isHabitForming).toBe(false);
  });

  test('T5: 3-day short trend with growing values', () => {
    const result = detectHabitFormation(series([10, 30, 50, 0, 0, 0, 0]), WINDOW);
    expect(result.isHabitForming).toBe(false);
  });

  test('T6: 7-day improving trend (values changing, not stable)', () => {
    const result = detectHabitFormation(series([10, 15, 20, 25, 30, 35, 40]), WINDOW);
    expect(result.maxConsecutive).toBe(7);
    expect(result.frequency).toBe(1);
    expect(result.consistency).toBeLessThan(1);
  });

  test('T7: high consistency (same value every day)', () => {
    const result = detectHabitFormation(series([25, 25, 25, 25, 25, 25, 25]), WINDOW);
    expect(result.consistency).toBe(1);
    expect(result.maxConsecutive).toBe(7);
    expect(result.frequency).toBe(1);
    expect(result.isHabitForming).toBe(true);
  });

  test('T8: sustained behavior', () => {
    const result = detectHabitFormation(series([25, 30, 28, 26, 27, 25, 24]), WINDOW);
    expect(result.maxConsecutive).toBe(7);
    expect(result.frequency).toBe(1);
    expect(result.isHabitForming).toBe(true);
  });

  test('T9: interruption (5 consecutive, gap, 1 active) retains v1.0 signal', () => {
    const result = detectHabitFormation(series([25, 25, 25, 25, 25, 0, 25]), WINDOW);
    expect(result.maxConsecutive).toBe(5);
    expect(result.currentConsecutive).toBe(1);
    expect(result.isHabitForming).toBe(true);
  });

  test('T9b: interruption with recovery (gap then 2+ active)', () => {
    const result = detectHabitFormation(series([25, 25, 25, 0, 0, 25, 25]), WINDOW);
    expect(result.maxConsecutive).toBe(3);
    expect(result.currentConsecutive).toBe(2);
    expect(result.isHabitForming).toBe(true);
  });

  test('T10: recovery after interruption', () => {
    const data = series([0, 0, 25, 25, 25, 25, 25]);
    const result = detectHabitFormation(data, WINDOW);
    expect(result.maxConsecutive).toBe(5);
    expect(result.isHabitForming).toBe(true);
  });

  test('T11: low frequency (30d window, 6 active days)', () => {
    const pattern = [25, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 25, 0, 0, 0, 0, 0];
    const result = detectHabitFormation(series(pattern), 30);
    expect(result.frequency).toBeCloseTo(5 / 30, 3);
    expect(result.isHabitForming).toBe(false);
  });

  test('T12: weekend pattern (weekend active, weekday zero)', () => {
    const pattern = [0, 0, 0, 0, 0, 30, 30, 0, 0, 0, 0, 0, 30, 30];
    const result = detectHabitFormation(series(pattern), 14);
    expect(result.maxConsecutive).toBe(2);
    expect(result.isHabitForming).toBe(false);
  });

  test('T13: long-term stable pattern (30d)', () => {
    const pattern = Array.from({ length: 30 }, (_, i) => ([1, 2, 4, 8, 12, 16, 20, 24].includes(i) ? 0 : 25));
    const result = detectHabitFormation(series(pattern), 30);
    expect(result.frequency).toBeCloseTo(22 / 30, 3);
    expect(result.isHabitForming).toBe(true);
  });

  test('T14: huge delta with insufficient data', () => {
    const result = detectHabitFormation(series([500, 0, 0]), 7);
    expect(result.isHabitForming).toBe(false);
  });

  test('T15: 30d with 25 active days', () => {
    const pattern = Array.from({ length: 30 }, (_, i) => (i >= 28 ? 25 : (i % 6 === 5 ? 0 : 25)));
    const result = detectHabitFormation(series(pattern), 30);
    expect(result.frequency).toBeCloseTo(26 / 30, 3);
    expect(result.isHabitForming).toBe(true);
  });

  test('T16: multi-domain metrics produce independent results', () => {
    const focus = detectHabitFormation(series([25, 25, 25, 25, 25, 25, 25]), WINDOW);
    const exercise = detectHabitFormation(series([0, 0, 30, 0, 0, 0, 30]), WINDOW);
    expect(focus.isHabitForming).toBe(true);
    expect(exercise.isHabitForming).toBe(false);
  });

  test('T17: cold-start boundary at exactly 3 samples', () => {
    const below = detectHabitFormation(series([25, 25, 0, 0, 0, 0, 0]), WINDOW);
    const at = detectHabitFormation(series([25, 25, 25, 0, 0, 0, 0]), WINDOW);
    expect(below.isHabitForming).toBe(false);
    expect(at.activeDays).toBe(3);
  });

  test('T18: no Store writes or localStorage access', () => {
    expect(globalThis.CGHabitFormation).toBeTruthy();
    expect(typeof HabitFormation.detectHabitFormation).toBe('function');
  });

  test('observation contract rejects invalid dates and accepts local dates', () => {
    const valid = detectHabitFormation([
      { date: new Date(2026, 8, 1), value: 25 },
      { date: new Date(2026, 8, 2), value: 25 },
      { date: new Date(2026, 8, 3), value: 25 }
    ], 7);
    expect(valid.activeDays).toBe(3);
    expect(valid.currentConsecutive).toBe(3);

    const invalid = detectHabitFormation([
      { date: '2026-02-30', value: 25 },
      { date: 'not-a-date', value: 25 },
      { date: 123, value: 25 },
      { date: new Date('invalid'), value: 25 }
    ], 7);
    expect(invalid.activeDays).toBe(0);
    expect(invalid.evidence).toContain('无效记录');
  });

  test('invalid observations are disclosed even when valid observations are sufficient', () => {
    const result = detectHabitFormation([
      { date: '2026-09-01', value: 25 },
      { date: '2026-09-02', value: 25 },
      { date: '2026-09-03', value: 25 },
      { date: 'not-a-date', value: 25 }
    ], 7);
    expect(result.activeDays).toBe(3);
    expect(result.currentConsecutive).toBe(3);
    expect(result.status).toBe('early');
    expect(result.evidence).toContain('无效记录');
  });

  test('invalid today does not enable future-date filtering', () => {
    const result = detectHabitFormation([
      { date: '2026-09-01', value: 25 },
      { date: '2026-09-02', value: 25 },
      { date: '2026-09-03', value: 25 },
      { date: '2026-09-04', value: 25 }
    ], 7, { today: 'invalid' });
    expect(result.activeDays).toBe(4);
    expect(result.currentConsecutive).toBe(4);
    expect(result.evidence).not.toContain('未来记录');
  });

  test('duplicate observations merge by date and do not inflate metrics', () => {
    const result = detectHabitFormation([
      { date: '2026-09-01', value: 10 },
      { date: '2026-09-01', value: 25 },
      { date: '2026-09-02', value: 25 },
      { date: '2026-09-03', value: 25 }
    ], 7);
    expect(result.activeDays).toBe(3);
    expect(result.frequency).toBeCloseTo(3 / 7, 3);
    expect(result.currentConsecutive).toBe(3);
    expect(result.evidence).toContain('重复记录');
  });

  test('observation order does not change derived metrics', () => {
    const observations = [
      { date: '2026-09-01', value: 25 },
      { date: '2026-09-02', value: 25 },
      { date: '2026-09-03', value: 25 }
    ];
    const ordered = detectHabitFormation(observations, 7);
    const unordered = detectHabitFormation([...observations].reverse(), 7);
    expect(unordered).toEqual(ordered);
  });

  test('missing calendar dates interrupt consecutive behavior', () => {
    const result = detectHabitFormation([
      { date: '2026-09-01', value: 25 },
      { date: '2026-09-02', value: 25 },
      { date: '2026-09-04', value: 25 }
    ], 7);
    expect(result.activeDays).toBe(3);
    expect(result.maxConsecutive).toBe(2);
    expect(result.currentConsecutive).toBe(1);
  });

  test('future observations are excluded by today', () => {
    const result = detectHabitFormation([
      { date: '2026-09-01', value: 25 },
      { date: '2026-09-02', value: 25 },
      { date: '2026-09-03', value: 25 },
      { date: '2026-09-04', value: 25 }
    ], 7, { today: '2026-09-03' });
    expect(result.activeDays).toBe(3);
    expect(result.currentConsecutive).toBe(3);
    expect(result.evidence).toContain('未来记录');
  });

  test('non-finite values are treated as inactive observations', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = detectHabitFormation([
        { date: '2026-09-01', value: 25 },
        { date: '2026-09-02', value },
        { date: '2026-09-03', value: 25 },
        { date: '2026-09-04', value: 25 }
      ], 7);
      expect(result.activeDays).toBe(3);
      expect(result.maxConsecutive).toBe(2);
      expect(result.currentConsecutive).toBe(2);
    }
  });

  test('invalid window values fall back deterministically', () => {
    const observations = series(Array.from({ length: 5 }, () => 25));
    for (const invalidDays of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = detectHabitFormation(observations, invalidDays);
      expect(result.windowDays).toBe(5);
      expect(result.activeDays).toBe(5);
    }
    const empty = detectHabitFormation([], 0);
    expect(empty.windowDays).toBe(1);
    expect(empty.activeDays).toBe(0);
    const fractional = detectHabitFormation(observations, 2.7);
    expect(fractional.windowDays).toBe(2);
    expect(fractional.activeDays).toBe(2);
  });

  test('minFrequency uses inclusive lower-bound comparison', () => {
    const pattern = [0, 0, 0, 0, 0, 0, 0, 25, 25, 25];
    const zero = detectHabitFormation(series(pattern), 10, { minFrequency: 0 });
    const below = detectHabitFormation(series(pattern), 10, { minFrequency: 0.2 });
    const equal = detectHabitFormation(series(pattern), 10, { minFrequency: 0.3 });
    const above = detectHabitFormation(series(pattern), 10, { minFrequency: 0.4 });
    const one = detectHabitFormation(series(pattern), 10, { minFrequency: 1 });
    const beyond = detectHabitFormation(series(pattern), 10, { minFrequency: 1.5 });
    expect(zero.frequency).toBe(0.3);
    expect(zero.reason).not.toBe('low_frequency');
    expect(zero.isHabitForming).toBe(true);
    expect(below.isHabitForming).toBe(true);
    expect(equal.frequency).toBe(0.3);
    expect(equal.reason).not.toBe('low_frequency');
    expect(above.isHabitForming).toBe(false);
    expect(one.isHabitForming).toBe(false);
    expect(beyond.isHabitForming).toBe(false);
  });

  test('forming and stable statuses remain gated by the legacy boolean', () => {
    const forming = detectHabitFormation(series(Array.from({ length: 7 }, () => 25)), 7);
    const stable = detectHabitFormation(series(Array.from({ length: 14 }, () => 25)), 14);
    expect(forming.isHabitForming).toBe(true);
    expect(forming.status).toBe('forming');
    expect(stable.isHabitForming).toBe(true);
    expect(stable.status).toBe('stable');
  });

  test('habitScore just below threshold', () => {
    const result = detectHabitFormation(series([10, 25, 40, 0, 0, 0, 0]), WINDOW);
    expect(result.habitScore).toBeLessThan(0.5);
    expect(result.isHabitForming).toBe(false);
  });

  test('maxConsecutive exactly 3 is sufficient', () => {
    const result = detectHabitFormation(series([25, 25, 25, 0, 0, 0, 25]), WINDOW);
    expect(result.maxConsecutive).toBe(3);
  });

  test('maxConsecutive 2 is insufficient', () => {
    const result = detectHabitFormation(series([25, 25, 0, 25, 25, 0, 25]), WINDOW);
    expect(result.maxConsecutive).toBe(2);
    expect(result.isHabitForming).toBe(false);
  });

  test('evidence does not contain internal field names', () => {
    const result = detectHabitFormation(series([25, 25, 25, 25, 25, 25, 25]), WINDOW);
    expect(result.evidence).not.toContain('frequency');
    expect(result.evidence).not.toContain('consistency');
    expect(result.evidence).not.toContain('continuity');
    expect(result.evidence).not.toContain('volatility');
  });

  test('365-day projection remains below 5ms at p95', () => {
    const yearSeries = series(Array.from({ length: 365 }, (_, i) => (i % 3 === 0 ? 0 : 25)), 365);
    const durations = Array.from({ length: 200 }, () => {
      const startedAt = performance.now();
      detectHabitFormation(yearSeries, 365);
      return performance.now() - startedAt;
    }).sort((a, b) => a - b);

    expect(durations[Math.floor(durations.length * 0.95) - 1]).toBeLessThan(5);
  });
});
