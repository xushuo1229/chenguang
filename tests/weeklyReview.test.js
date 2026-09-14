import { test, expect, beforeEach, vi } from 'vitest';
import { dateStr, dateOffset } from '../js/utils/date.js';

const TODAY = dateStr(0);
const day = (offset) => dateOffset(TODAY, offset);

function seed() {
  return {
    user: {}, checkins: [{ date: day(0), status: 'done' }],
    focus: [{ date: day(0), minutes: 60 }, { date: day(-1), minutes: 30 }],
    english: [{ date: day(0), minutes: 20, words: 10 }],
    sports: [{ date: day(0), duration: 30, calories: 100 }],
    readings: [{ date: day(0), pages: 20 }], todos: [{ date: day(0), text: 'task', done: true }],
    courses: [{ id: 'c1', name: 'Course', progress: 70, status: 'doing' }], goals: []
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

test('Weekly Review 使用 Analytics、Growth State 和 Coach Memory', async () => {
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const review = Growth.buildWeeklyReview(seed(), { today: TODAY }, {
    facts: [{ id: 'strategy:short_focus', statement: 'short_focus 策略近 14 天完成率 100%（样本 3）。' }],
    feedbackSummary: [{ strategyKey: 'short_focus', sampleCount: 3, completionRate: 100, effectiveness: 'high', insufficientEvidence: false }]
  });
  expect(review.dataSufficient).toBe(true);
  expect(review.performance.activeDays).toBeGreaterThan(0);
  expect(review.performance.studyMinutes).toBeGreaterThan(0);
  expect(review.evidenceSources).toContain('CoachMemory');
  expect(review.memoryFacts[0].statement).toContain('完成率');
});

test('活跃数据不足时 Weekly Review 明确说数据不足', async () => {
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const empty = seed();
  Object.keys(empty).forEach((key) => { if (key !== 'user') empty[key] = []; });
  const review = Growth.buildWeeklyReview(empty, { today: TODAY }, { facts: [], feedbackSummary: [] });
  expect(review.dataSufficient).toBe(false);
  expect(review.possibleCauses[0]).toContain('数据不足');
});
