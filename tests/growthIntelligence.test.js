import { test, expect, beforeEach, vi } from 'vitest';
import { dateStr, dateOffset } from '../js/utils/date.js';

const TODAY = dateStr(0);
const day = (offset) => dateOffset(TODAY, offset);

function seedData() {
  return {
    user: { name: '测试' },
    checkins: [{ id: 'c1', date: day(0), status: 'done' }],
    focus: [
      { id: 'f0', date: day(-20), minutes: 200 },
      { id: 'f5', date: day(-19), minutes: 200 },
      { id: 'f1', date: day(-10), minutes: 50 },
      { id: 'f2', date: day(-9), minutes: 50 },
      { id: 'f3', date: day(-1), minutes: 80 },
      { id: 'f4', date: day(0), minutes: 100 }
    ],
    english: [{ id: 'e1', date: day(0), minutes: 20, words: 10 }],
    sports: [],
    readings: [],
    todos: [
      { id: 't1', date: day(0), text: '任务一', done: true },
      { id: 't2', date: day(0), text: '任务二', done: false },
      { id: 't3', date: day(0), text: '任务三', done: false },
      { id: 't4', date: day(0), text: '任务四', done: false }
    ],
    courses: [{ id: 'c1', name: '数学', progress: 20, status: 'doing' }],
    goals: []
  };
}

function seedEmpty() {
  return { user: {}, checkins: [], focus: [], english: [], sports: [], readings: [], todos: [], courses: [], goals: [] };
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

test('Growth State 包含全部核心领域和趋势窗口', async () => {
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const state = Growth.computeGrowthState(seedData(), { today: TODAY });
  expect(state.version).toBe('1.0');
  expect(state.today).toBe(TODAY);
  for (const key of ['learningState', 'executionState', 'focusState', 'englishState', 'readingState', 'exerciseState', 'courseState', 'goalState', 'workloadState', 'consistencyState', 'trendState', 'riskSignals', 'positiveSignals', 'recommendedFocus']) {
    expect(state).toHaveProperty(key);
  }
  expect(state.trendState.windows['7d'].focus.current).toBe(180);
  expect(state.trendState.windows['7d'].focus.previous).toBe(100);
  expect(state.trendState.windows['7d'].focus.status).toBe('rising');
  expect(state.trendState.windows['14d'].focus.status).toBe('falling');
});

test('空数据明确标记数据不足，不生成虚构结论', async () => {
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const state = Growth.computeGrowthState(seedEmpty(), { today: TODAY });
  expect(state.overall).toBe('insufficient_data');
  expect(state.dataSufficiency.overall).toBe(false);
  expect(state.riskSignals).toHaveLength(0);
  expect(state.actionProposals).toHaveLength(0);
  const insight = Growth.buildDailyInsight(seedEmpty(), { today: TODAY });
  expect(insight.dataSufficient).toBe(false);
  expect(insight.recommendedActions).toHaveLength(0);
});

test('低完成率待办、低进度课程与落后目标触发风险和建议', async () => {
  const data = seedData();
  data.goals = [{
    id: 'g1', title: '完成任务', type: 'custom', metric: 'minutes', targetValue: 100,
    period: 'custom', startDate: day(-9), endDate: day(0), status: 'active'
  }];
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const state = Growth.computeGrowthState(data, { today: TODAY });
  expect(state.riskSignals.some((risk) => risk.type === 'todo_backlog')).toBe(true);
  expect(state.riskSignals.some((risk) => risk.type === 'course_progress_low')).toBe(true);
  expect(state.riskSignals.some((risk) => risk.type === 'goal_risk')).toBe(true);
  expect(state.actionProposals.length).toBeGreaterThan(0);
  expect(state.actionProposals.every((action) => action.requiresConfirmation)).toBe(true);
});

test('Growth Intelligence 是纯只读层', async () => {
  localStorage.setItem('chenguangData', JSON.stringify(seedData()));
  const store = (await import('../js/store.js')).default;
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const before = JSON.stringify(store.get());
  const revision = store.getRevision();
  Growth.computeGrowthState(store.get(), { today: TODAY });
  Growth.buildGrowthProfile(store.get(), { today: TODAY });
  expect(store.getRevision()).toBe(revision);
  expect(JSON.stringify(store.get())).toBe(before);
});

test('异常数据不崩溃，Growth Profile 不虚构最佳时段', async () => {
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const state = Growth.computeGrowthState({
    checkins: [{ date: 'bad-date' }], focus: [{ date: day(0), minutes: -5 }],
    english: [null], todos: [{}], courses: [{}], goals: [{}]
  }, { today: TODAY });
  expect(state.overall).toBeTypeOf('string');
  const profile = Growth.buildGrowthProfile(seedData(), { today: TODAY });
  expect(profile.source).toBe('derived_profile');
  expect(profile.bestTimeSlots).toHaveLength(0);
  expect(profile.bestTimeSlotsAvailable).toBe(false);
});

test('Growth Overview 覆盖 7/30/90 天窗口并输出可解释范围结论', async () => {
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const overview = Growth.buildGrowthOverview(seedData(), { today: TODAY });
  expect(Object.keys(overview.ranges).sort()).toEqual(['30d', '7d', '90d'].sort());
  for (const range of Object.values(overview.ranges)) {
    expect(range).toHaveProperty('learningTrend');
    expect(range).toHaveProperty('consistency');
    expect(range).toHaveProperty('tasks');
    expect(Array.isArray(range.strengths)).toBe(true);
    expect(Array.isArray(range.risks)).toBe(true);
  }
  expect(overview.ranges['7d'].learningTrend.metrics.map((item) => item.metric)).toEqual(expect.arrayContaining(['study', 'focus', 'english', 'reading']));
  expect(overview.ranges['7d'].tasks.completionRate).toBe(25);
});

test('Growth Score 使用完成度、连续性与动量加权，并在动量更好时更高', async () => {
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const base = {
    user: { name: '测试' },
    checkins: Array.from({ length: 14 }, (_, index) => ({ id: 'c' + index, date: day(-index), status: 'done' })),
    todos: Array.from({ length: 20 }, (_, index) => ({ id: 't' + index, date: day(-index % 10), text: '任务', done: index % 2 === 0 })),
    focus: [
      { id: 'old-1', date: day(-40), minutes: 300 },
      { id: 'old-2', date: day(-35), minutes: 300 },
    ],
    sports: [{ id: 's1', date: day(-1), minutes: 30 }],
    readings: [{ id: 'r1', date: day(-1), pages: 20 }],
    english: [{ id: 'e1', date: day(-1), minutes: 20, words: 20 }],
    courses: [{ id: 'course-1', name: '课程', progress: 80, status: 'doing' }],
    goals: [],
  };
  const rising = Growth.buildGrowthOverview({
    ...base,
    focus: [
      { id: 'old-1', date: day(-40), minutes: 20 },
      { id: 'old-2', date: day(-35), minutes: 20 },
      { id: 'new-1', date: day(-1), minutes: 80 },
      { id: 'new-2', date: day(0), minutes: 90 },
    ],
  }, { today: TODAY });
  const falling = Growth.buildGrowthOverview({
    ...base,
    focus: [
      { id: 'old-1', date: day(-40), minutes: 100 },
      { id: 'old-2', date: day(-35), minutes: 100 },
      { id: 'new-1', date: day(-1), minutes: 20 },
      { id: 'new-2', date: day(0), minutes: 15 },
    ],
  }, { today: TODAY });

  expect(rising.score.value).toBeGreaterThan(falling.score.value);
  expect(rising.score.factors).toMatchObject({
    completion: { weight: 0.45 },
    consistency: { weight: 0.30 },
    momentum: { weight: 0.25 },
  });
  expect(rising.score.explanation.length).toBeGreaterThan(0);
});

test('空数据和大量数据的 Growth Score 保持安全且不崩溃', async () => {
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const empty = Growth.buildGrowthOverview(seedEmpty(), { today: TODAY });
  expect(empty.score.value).toBe(0);
  expect(empty.score.dataSufficient).toBe(false);

  const large = seedData();
  for (let index = 0; index < 1200; index++) {
    large.todos.push({ id: 'bulk-' + index, date: day(-index % 90), text: '任务', done: index % 3 === 0 });
    large.focus.push({ id: 'bulk-focus-' + index, date: day(-index % 90), minutes: 10 });
  }
  const overview = Growth.buildGrowthOverview(large, { today: TODAY });
  expect(overview.score.value).toBeGreaterThanOrEqual(0);
  expect(overview.score.value).toBeLessThanOrEqual(100);
});
