import { describe, expect, test, vi } from 'vitest';
import { dateOffset } from '../js/utils/date.js';

const TODAY = '2026-09-15';
const day = (offset) => dateOffset(TODAY, offset);

function seedSnapshot() {
  const focus = [];
  for (let index = 30; index > 0; index -= 1) {
    focus.push({ id: 'focus-old-' + index, date: day(-index - 2), minutes: 10 });
  }
  focus.push({ id: 'focus-recent-1', date: day(-1), minutes: 40 });
  focus.push({ id: 'focus-today', date: TODAY, minutes: 25 });
  return {
    user: { name: '测试' },
    checkins: [{ id: 'checkin-today', date: TODAY, status: 'done' }],
    todos: [{ id: 'todo-1', date: TODAY, text: '复习', done: true }],
    english: [{ id: 'english-1', date: TODAY, minutes: 10, words: 8 }],
    sports: [{ id: 'sport-1', date: TODAY, minutes: 20, calories: 100 }],
    readings: [{ id: 'reading-1', date: TODAY, pages: 12, totalPages: 100 }],
    focus,
    courses: [],
    goals: [],
    _meta: { revision: 1, updatedAt: null, deviceId: 'test-device', tombstones: {} }
  };
}

describe('Daily Feedback', () => {
  test('empty snapshot is safe and does not invent progress', async () => {
    const { default: DailyFeedback } = await import('../js/dailyFeedback.js');
    const feedback = DailyFeedback.buildDailyFeedback({
      user: {}, checkins: [], todos: [], english: [], sports: [], readings: [], focus: [], courses: [], goals: []
    }, { today: TODAY });

    expect(feedback.summary).toContain('还没有成长记录');
    expect(feedback.highlights).toHaveLength(0);
    expect(feedback.changes).toHaveLength(0);
    expect(feedback.nextActions.length).toBeGreaterThan(0);
    expect(feedback.nextActions.length).toBeLessThanOrEqual(2);
    expect(feedback.generatedAt).toBeTruthy();
  });

  test('builds summary, highlights, changes and bounded next actions from one snapshot', async () => {
    const { default: DailyFeedback } = await import('../js/dailyFeedback.js');
    const feedback = DailyFeedback.buildDailyFeedback(seedSnapshot(), { today: TODAY });

    expect(feedback.summary).toContain('成长记录');
    expect(feedback.highlights.join(' ')).toContain('专注');
    expect(feedback.highlights.length).toBeLessThanOrEqual(3);
    expect(feedback.changes.some((change) => change.metric === 'focus' && change.direction === 'up')).toBe(true);
    expect(feedback.changes.length).toBeLessThanOrEqual(3);
    expect(feedback.nextActions.length).toBeLessThanOrEqual(2);
    expect(feedback.nextActions.some((action) => action.includes('可以尝试') || action.includes('继续保持'))).toBe(true);
  });

  test('does not write Store, mutate snapshot, or scan all-history APIs', async () => {
    localStorage.setItem('cg_token', 'test-token');
    localStorage.setItem('chenguangData', JSON.stringify(seedSnapshot()));
    const { default: CGStore } = await import('../js/store.js');
    const Analytics = (await import('../js/analytics.js')).default;
    const { default: DailyFeedback } = await import('../js/dailyFeedback.js');
    const snapshot = CGStore.get();
    const before = JSON.stringify(snapshot);
    const revision = CGStore.getRevision();
    const activityMapSpy = vi.spyOn(Analytics, 'getActivityMap');
    const personalBestSpy = vi.spyOn(Analytics, 'getPersonalBest');

    const feedback = DailyFeedback.buildDailyFeedback(snapshot, { today: TODAY });

    expect(activityMapSpy).not.toHaveBeenCalled();
    expect(personalBestSpy).not.toHaveBeenCalled();
    expect(CGStore.getRevision()).toBe(revision);
    expect(JSON.stringify(CGStore.get())).toBe(before);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(feedback).toBeTruthy();
  });

  test('uses bounded, non-absolute language', async () => {
    const { default: DailyFeedback } = await import('../js/dailyFeedback.js');
    const feedback = DailyFeedback.buildDailyFeedback(seedSnapshot(), { today: TODAY });
    const text = JSON.stringify(feedback);

    expect(text).not.toContain('一定会');
    expect(text).not.toContain('已经养成');
    expect(text).not.toContain('必须');
    expect(feedback.highlights.every((item) => typeof item === 'string')).toBe(true);
  });
});
