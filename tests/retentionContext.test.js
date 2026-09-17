import { describe, expect, test, vi, beforeEach } from 'vitest';
import RetentionContext from '../js/retentionContext.js';

const TODAY = '2026-09-15';
const YESTERDAY = '2026-09-14';

function makeSnapshot(overrides = {}) {
  return {
    checkins: [{ id: 'c1', date: YESTERDAY, status: 'done' }],
    focus: [{ id: 'f1', date: YESTERDAY, minutes: 45 }],
    readings: [{ id: 'r1', date: YESTERDAY, pages: 20 }],
    sports: [{ id: 's1', date: YESTERDAY, duration: 30, calories: 200 }],
    english: [{ id: 'e1', date: YESTERDAY, words: 30, minutes: 15 }],
    todos: [{ id: 't1', date: YESTERDAY, done: true, text: 'test' }],
    courses: [],
    goals: [],
    user: { name: 'test', onboarded: true },
    ...overrides
  };
}

describe('RetentionContext.buildWelcomeBack', () => {
  test('returns null when no yesterday data', () => {
    const result = RetentionContext.buildWelcomeBack({}, { today: TODAY });
    expect(result).toBeNull();
  });

  test('returns null when today is yesterday boundary edge', () => {
    const result = RetentionContext.buildWelcomeBack(makeSnapshot(), { today: YESTERDAY });
    expect(result).toBeNull();
  });

  test('builds welcome context with yesterday records', () => {
    const result = RetentionContext.buildWelcomeBack(makeSnapshot(), { today: TODAY });
    expect(result).toBeTruthy();
    expect(result.date).toBe(YESTERDAY);
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records.some((r) => r.includes('专注'))).toBe(true);
    expect(result.records.some((r) => r.includes('阅读'))).toBe(true);
  });

  test('returns null when yesterday has no activity', () => {
    const result = RetentionContext.buildWelcomeBack(makeSnapshot({
      checkins: [],
      focus: [],
      readings: [],
      sports: [],
      english: [],
      todos: []
    }), { today: TODAY });
    expect(result).toBeNull();
  });

  test('limits records to 4', () => {
    const result = RetentionContext.buildWelcomeBack(makeSnapshot(), { today: TODAY });
    expect(result.records.length).toBeLessThanOrEqual(4);
  });
});

describe('RetentionContext.buildStreakReminder', () => {
  test('returns null when no streak', () => {
    const result = RetentionContext.buildStreakReminder(makeSnapshot({ checkins: [] }), { today: TODAY });
    expect(result).toBeNull();
  });

  test('returns null when today is already done', () => {
    const result = RetentionContext.buildStreakReminder(makeSnapshot({
      checkins: [{ id: 'c1', date: TODAY, status: 'done' }]
    }), { today: TODAY });
    expect(result).toBeNull();
  });

  test('builds reminder when streak exists and today not done', () => {
    const checkins = Array.from({ length: 5 }, (_, i) => ({
      id: 'c' + i,
      date: [
        '2026-09-14', '2026-09-13', '2026-09-12', '2026-09-11', '2026-09-10'
      ][i],
      status: 'done'
    }));
    const result = RetentionContext.buildStreakReminder(makeSnapshot({ checkins }), { today: TODAY });
    expect(result).toBeTruthy();
    expect(result.streak).toBe(5);
    expect(result.message).toContain('5 天');
  });

  test('does not use threatening language', () => {
    const checkins = Array.from({ length: 3 }, (_, i) => ({
      id: 'c' + i, date: ['2026-09-14', '2026-09-13', '2026-09-12'][i], status: 'done'
    }));
    const result = RetentionContext.buildStreakReminder(makeSnapshot({ checkins }), { today: TODAY });
    expect(result.message).not.toContain('消失');
    expect(result.message).not.toContain('失败');
    expect(result.message).not.toContain('必须');
  });
});

describe('RetentionContext.getRetentionCandidate', () => {
  const candidate = {
    id: 'mem-1',
    type: 'Habit',
    content: '用户近期保持稳定专注习惯',
    confidence: 0.72,
    status: 'pending',
    evidence: [{ source: 'Analytics', metric: 'focus', value: '+32%' }]
  };

  test('returns null when no memory', () => {
    expect(RetentionContext.getRetentionCandidate(null)).toBeNull();
    expect(RetentionContext.getRetentionCandidate({})).toBeNull();
  });

  test('returns null when no pending candidates', () => {
    expect(RetentionContext.getRetentionCandidate({ candidates: [{ ...candidate, status: 'confirmed' }] })).toBeNull();
    expect(RetentionContext.getRetentionCandidate({ candidates: [{ ...candidate, status: 'rejected' }] })).toBeNull();
  });

  test('returns first pending candidate with evidence', () => {
    const result = RetentionContext.getRetentionCandidate({ candidates: [candidate] });
    expect(result).toBeTruthy();
    expect(result.id).toBe('mem-1');
    expect(result.content).toBe('用户近期保持稳定专注习惯');
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0]).toContain('focus');
  });

  test('returns null for candidate without content', () => {
    const empty = { candidates: [{ ...candidate, content: '' }] };
    expect(RetentionContext.getRetentionCandidate(empty)).toBeNull();
  });
});