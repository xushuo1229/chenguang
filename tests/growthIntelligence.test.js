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
