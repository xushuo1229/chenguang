/**
 * Phase 13 · AI Context Builder —— 单元测试
 * --------------------------------------------------------------
 * 覆盖：
 *  1. Context Schema 完整性（version/generatedAt/today/overview/trends/...）
 *  2. 只读铁律：buildContext 后 CGStore revision +0、数据快照不变
 *  3. 确定性洞察：目标风险（临近截止进度低）、强习惯、机会
 *  4. 课程裁剪（≤20）与目标字段白名单、默认不携带 Todo 原文
 *  5. Context 预算：estimateTokens / trimContextToBudget
 *  6. 空数据：hasEvidence=false
 * ------------------------------------------------------------
 */
import { test, expect, beforeEach, vi } from 'vitest';
import { dateStr, dateOffset } from '../js/utils/date.js';

const TODAY = dateStr(0);
const day = (n) => dateOffset(TODAY, n);

function weekMon() {
  const d = new Date(TODAY + 'T00:00:00');
  return dateOffset(TODAY, -((d.getDay() + 6) % 7));
}
const weekSun = () => dateOffset(weekMon(), 6);

function goal(id, title, type, metric, target, start, end) {
  return {
    id, title, type, metric, targetValue: target,
    period: 'custom', startDate: start, endDate: end,
    status: 'active', createdAt: 'x', updatedAt: 'x'
  };
}

function seedData() {
  return {
    _meta: { revision: 3, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '测试' },
    checkins: [
      { id: 'ck1', date: day(-1), status: 'done' },
      { id: 'ck2', date: TODAY, status: 'done' },
    ],
    focus: [
      { id: 'f1', date: day(-1), minutes: 45 },
      { id: 'f2', date: TODAY, minutes: 45 },
    ],
    sports: [{ id: 's1', date: TODAY, minutes: 30, calories: 200 }],
    readings: [{ id: 'r1', date: TODAY, pages: 20 }],
    english: [{ id: 'e1', date: TODAY, minutes: 25, words: 20 }],
    todos: [
      { id: 't1', text: '完成高数作业', done: true },
      { id: 't2', text: '<img src=x onerror="window.__cgXss=1">', done: false },
    ],
    courses: [
      { id: 'c1', name: '高等数学', progress: 10, status: 'doing', credits: 4 },
      { id: 'c2', name: '大学英语', progress: 80, status: 'doing', credits: 3 },
    ],
    goals: [
      // 本周专注：90/600 → 进度低但周期长（不触发 high）
      goal('g1', '本周专注 600 分钟', 'focus', 'minutes', 600, weekMon(), weekSun()),
      // 即将到期（今天截止）：30/600 → high 风险
      goal('g2', '即将到期的运动目标', 'exercise', 'minutes', 600, day(-10), TODAY),
      // 已达成：60/60 → completed
      goal('g3', '已完成的小目标', 'focus', 'minutes', 45, weekMon(), weekSun()),
    ],
  };
}

function seedEmpty() {
  return {
    _meta: { revision: 0, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '' },
    checkins: [], focus: [], sports: [], readings: [], english: [],
    todos: [], courses: [], goals: [],
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetModules();
});

async function boot(data) {
  localStorage.setItem('chenguangData', JSON.stringify(data));
  const store = (await import('../js/store.js')).default;
  const AIContext = (await import('../js/aiContext.js')).default;
  return { store, AIContext };
}

/* ==================== Schema ==================== */

test('Context Schema：字段齐全、版本正确、today 有效', async () => {
  const { store, AIContext } = await boot(seedData());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });

  expect(ctx.version).toBe('1.0');
  expect(ctx.today).toBe(TODAY);
  expect(ctx.generatedAt).toBeTruthy();
  for (const k of ['overview', 'trends', 'study', 'exercise', 'english', 'focus', 'todos', 'courses', 'goals', 'insights']) {
    expect(ctx).toHaveProperty(k);
  }
  expect(ctx.overview.currentStreak).toBeGreaterThan(0);
  expect(ctx.overview.activeDays).toBeGreaterThan(0);
  expect(ctx.goals.active.length).toBeGreaterThan(0);
  expect(ctx.courses.length).toBe(2);
});

/* ==================== 只读铁律 ==================== */

test('只读：buildContext 不改 Store（revision +0、数据快照不变）', async () => {
  const { store, AIContext } = await boot(seedData());
  const before = JSON.stringify(store.get());
  const rev = store.getRevision();

  AIContext.buildContext(store.get(), { today: TODAY });
  AIContext.buildContext(store.get(), { today: TODAY });

  expect(store.getRevision()).toBe(rev);
  expect(JSON.stringify(store.get())).toBe(before);
});

/* ==================== 确定性洞察 ==================== */

test('洞察：临近截止低进度目标 → goal_risk (high)', async () => {
  const { store, AIContext } = await boot(seedData());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  const risks = ctx.insights.filter((i) => i.type === 'goal_risk');
  const high = risks.find((r) => r.goalId === 'g2');
  expect(high).toBeTruthy();
  expect(high.severity).toBe('high');
});

test('洞察：已达成目标不出现在 active，也不触发风险', async () => {
  const { store, AIContext } = await boot(seedData());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  expect(ctx.goals.active.find((p) => p.id === 'g3')).toBeUndefined();
  expect(ctx.goals.completed.find((p) => p.id === 'g3')).toBeTruthy();
  expect(ctx.insights.find((i) => i.type === 'goal_risk' && i.goalId === 'g3')).toBeUndefined();
});

test('V2 修复回归：每日目标（今天刚开始、进度 0）不触发「剩余时间不足」误报', async () => {
  const { store, AIContext } = await boot(seedData());
  const snap = store.get();
  // 昨天创建的每日目标，今天 0 进度：daysRemaining=0，修复前会被误判 high 风险
  snap.goals.push({
    id: 'gd', title: '每天背 50 词', type: 'english', metric: 'words', targetValue: 50,
    period: 'daily', startDate: day(-1), endDate: day(300), status: 'active',
    createdAt: 'x', updatedAt: 'x',
  });
  const ctx = AIContext.buildContext(snap, { today: TODAY });
  expect(ctx.goals.active.find((p) => p.id === 'gd')).toBeTruthy();   // 在进行中
  expect(ctx.insights.find((i) => i.type === 'goal_risk' && i.goalId === 'gd')).toBeUndefined();
});

test('洞察：连续打卡 ≥3 天 → strong_habit', async () => {
  const { store, AIContext } = await boot(seedData());
  // 补足 3 天连续打卡
  const snap = store.get();
  snap.checkins.push(
    { id: 'ck3', date: day(-2), status: 'done' },
    { id: 'ck4', date: day(-3), status: 'done' }
  );
  const ctx = AIContext.buildContext(snap, { today: TODAY });
  expect(ctx.insights.some((i) => i.type === 'strong_habit')).toBe(true);
});

test('洞察：低进度进行中课程 → opportunity 提示', async () => {
  const { store, AIContext } = await boot(seedData());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  expect(ctx.insights.some((i) => i.type === 'opportunity' && i.reason.includes('高等数学'))).toBe(true);
});

/* ==================== 字段白名单 / 裁剪 ==================== */

test('目标字段白名单：只透传允许字段', async () => {
  const { store, AIContext } = await boot(seedData());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  const g = ctx.goals.active[0];
  expect(Object.keys(g).sort()).toEqual(
    ['currentValue', 'endDate', 'id', 'metric', 'percentage', 'period', 'remaining', 'startDate', 'status', 'targetValue', 'title', 'type']
      .sort()
  );
});

test('默认不携带 Todo 原文；显式开启才带 ≤10 条', async () => {
  const { store, AIContext } = await boot(seedData());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  expect(ctx.todos.items).toBeUndefined();

  const ctx2 = AIContext.buildContext(store.get(), { today: TODAY, includeTodoText: true });
  expect(Array.isArray(ctx2.todos.items)).toBe(true);
  expect(ctx2.todos.items.length).toBeLessThanOrEqual(10);
});

test('课程裁剪：最多保留 20 门', async () => {
  const data = seedData();
  data.courses = Array.from({ length: 30 }, (_, i) => ({
    id: 'c' + i, name: '课程' + i, progress: i, status: 'doing', credits: 1
  }));
  const { store, AIContext } = await boot(data);
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  expect(ctx.courses.length).toBe(20);
});

/* ==================== Context 预算 ==================== */

test('estimateTokens：中文与英文消耗不同，空串为 0', async () => {
  const { AIContext } = await boot(seedData());
  expect(AIContext.estimateTokens('')).toBe(0);
  const cjk = AIContext.estimateTokens('Zeno'.repeat(250));   // 500 个汉字
  const ascii = AIContext.estimateTokens('a'.repeat(2000));
  expect(cjk).toBeGreaterThan(200);      // ~333
  expect(ascii).toBe(500);               // 2000/4
});

test('trimContextToBudget：超预算时裁掉 days30 等次要项，仍保留核心字段', async () => {
  const { store, AIContext } = await boot(seedData());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY, includeTodoText: true });

  const trimmed = AIContext.trimContextToBudget(ctx, 100);   // 极小预算
  expect(trimmed.version).toBe('1.0');
  expect(trimmed.today).toBe(TODAY);
  expect(trimmed.trends.days30).toBeNull();
  // 极小预算下 insights 只剩 high 严重度
  expect(trimmed.insights.every((i) => i.severity === 'high')).toBe(true);

  const full = AIContext.trimContextToBudget(ctx);           // 默认预算不受影响
  expect(AIContext.estimateContextTokens(full)).toBeLessThanOrEqual(AIContext.MAX_CONTEXT_TOKENS);
});

test('buildContext 产物默认满足 Context 预算（≤6000 token）', async () => {
  const { store, AIContext } = await boot(seedData());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  expect(AIContext.estimateContextTokens(ctx)).toBeLessThanOrEqual(AIContext.MAX_CONTEXT_TOKENS);
});

/* ==================== 空数据 ==================== */

test('空数据：hasEvidence=false，overview 归零不崩', async () => {
  const { store, AIContext } = await boot(seedEmpty());
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  expect(AIContext.hasEvidence(ctx)).toBe(false);
  expect(ctx.overview.currentStreak).toBe(0);
  expect(ctx.courses).toHaveLength(0);
  expect(ctx.goals.active).toHaveLength(0);
});

test('坏数据隔离：单条目标字段缺失不崩，Context 仍生成', async () => {
  const data = seedData();
  data.goals.push({ id: 'bad', title: '坏数据' });   // 缺 type/metric/dates
  const { store, AIContext } = await boot(data);
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });
  expect(ctx.version).toBe('1.0');
});

test('Context.growth 提供 Growth Score 与 7/30/90 趋势，同时保留旧 growthState', async () => {
  const { store, AIContext } = await boot(seedData());
  const before = JSON.stringify(store.get());
  const revision = store.getRevision();
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });

  expect(ctx.growth).toBeTruthy();
  expect(ctx.growth.score.value).toBeGreaterThanOrEqual(0);
  expect(ctx.growth.score.value).toBeLessThanOrEqual(100);
  expect(Object.keys(ctx.growth.trends).sort()).toEqual(['30d', '7d', '90d'].sort());
  expect(ctx.growth.risks).toEqual(ctx.growthState.risks);
  expect(ctx.growth.strengths).toEqual(ctx.growthState.strengths);
  expect(ctx.growthState).toBeTruthy();
  expect(store.getRevision()).toBe(revision);
  expect(JSON.stringify(store.get())).toBe(before);
});

test('Context.coach 提供 AI Coach 洞察，同时保留只读与旧字段', async () => {
  const { store, AIContext } = await boot(seedData());
  const before = JSON.stringify(store.get());
  const revision = store.getRevision();
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });

  expect(ctx.coach).toBeTruthy();
  expect(ctx.coach.role).toBe('growth_coach');
  expect(ctx.coach.readOnly).toBe(true);
  expect(Array.isArray(ctx.coach.insights)).toBe(true);
  expect(Array.isArray(ctx.coach.recommendations)).toBe(true);
  expect(Array.isArray(ctx.coach.warnings)).toBe(true);
  expect(ctx.growthState).toBeTruthy();
  expect(ctx.growth).toBeTruthy();
  expect(store.getRevision()).toBe(revision);
  expect(JSON.stringify(store.get())).toBe(before);
});

test('Context.report 提供周报与月报，同时兼容旧字段', async () => {
  const { store, AIContext } = await boot(seedData());
  const before = JSON.stringify(store.get());
  const revision = store.getRevision();
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });

  expect(ctx.report).toBeTruthy();
  expect(ctx.report.weekly.period).toBe('weekly');
  expect(ctx.report.monthly.period).toBe('monthly');
  expect(ctx.report.weekly.readOnly).toBe(true);
  expect(ctx.report.monthly.readOnly).toBe(true);
  expect(ctx.report.weekly.summary).toContain('本周');
  expect(ctx.report.monthly.summary).toContain('月度');
  expect(ctx.growth).toBeTruthy();
  expect(ctx.growthState).toBeTruthy();
  expect(ctx.coach).toBeTruthy();
  expect(store.getRevision()).toBe(revision);
  expect(JSON.stringify(store.get())).toBe(before);
});

test('Context.memory 注入长期记忆，同时保留旧字段且只读', async () => {
  const { store, AIContext } = await boot(seedData());
  const revision = store.getRevision();
  const data = store.get();
  data.user.memory = {
    version: '1.0',
    updatedAt: TODAY,
    patterns: [{ id: 'pattern:test', kind: 'habit_pattern', statement: '测试长期习惯。', confidence: 'medium', weight: 80, status: 'active', createdAt: TODAY, lastSeenAt: TODAY, occurrences: 2, evidence: {} }],
    milestones: [],
    preferences: [],
    insights: []
  };
  const before = JSON.stringify(store.get());
  const ctx = AIContext.buildContext(data, { today: TODAY });

  expect(ctx.memory).toBeTruthy();
  expect(ctx.memory.confirmed.some((item) => item.id === 'pattern:test')).toBe(true);
  expect(Array.isArray(ctx.memory.insights)).toBe(true);
  expect(Array.isArray(ctx.memory.relations)).toBe(true);
  expect(ctx.memory.insights.some((item) => item.sourceIds && item.sourceIds.includes('pattern:test'))).toBe(true);
  expect(ctx.growth).toBeTruthy();
  expect(ctx.growthState).toBeTruthy();
  expect(ctx.coach).toBeTruthy();
  expect(ctx.report).toBeTruthy();
  expect(ctx.memory.confirmed[0]).not.toHaveProperty('weight');
  expect(store.getRevision()).toBe(revision);
  expect(JSON.stringify(store.get())).toBe(before);
});

test('Context.dailyFeedback 是 runtime-only 短期反馈且超预算时优先裁剪', async () => {
  const { store, AIContext } = await boot(seedData());
  const before = JSON.stringify(store.get());
  const revision = store.getRevision();
  const ctx = AIContext.buildContext(store.get(), { today: TODAY });

  expect(ctx.dailyFeedback).toBeTruthy();
  expect(typeof ctx.dailyFeedback.summary).toBe('string');
  expect(Array.isArray(ctx.dailyFeedback.highlights)).toBe(true);
  expect(Array.isArray(ctx.dailyFeedback.changes)).toBe(true);
  expect(Array.isArray(ctx.dailyFeedback.nextActions)).toBe(true);
  expect(JSON.stringify(store.get())).toBe(before);
  expect(store.getRevision()).toBe(revision);

  const trimmed = AIContext.trimContextToBudget(ctx, 100);
  expect(trimmed.dailyFeedback).toBeNull();
  expect(trimmed.today).toBe(TODAY);
});

test('Context.memory 区分 confirmed 与 pending candidate，并过滤 rejected', async () => {
  const { store, AIContext } = await boot(seedData());
  const data = store.get();
  data.user.memory = {
    version: '2.1',
    updatedAt: TODAY,
    patterns: [],
    milestones: [],
    preferences: [],
    insights: [],
    candidates: [
      {
        id: 'candidate:pending',
        type: 'Habit',
        content: '近期专注节奏可能正在形成。',
        confidence: 0.5,
        status: 'pending',
        evidence: [{ source: 'GrowthIntelligence', metric: 'focus', value: 32, timestamp: TODAY }],
        createdAt: TODAY,
        updatedAt: TODAY,
        expiresAt: dateStr(30)
      },
      {
        id: 'candidate:expired',
        type: 'Habit',
        content: '过期趋势不应进入 Context。',
        confidence: 0.5,
        status: 'pending',
        evidence: [{ source: 'Analytics', metric: 'focus', value: 1, timestamp: dateStr(-90) }],
        createdAt: dateStr(-90),
        updatedAt: dateStr(-90),
        expiresAt: dateStr(30)
      },
      {
        id: 'candidate:rejected',
        type: 'Risk',
        content: '近期学习节奏可能下降。',
        confidence: 0.5,
        status: 'rejected',
        evidence: [{ source: 'GrowthIntelligence', metric: 'study', value: -20, timestamp: TODAY }],
        createdAt: TODAY,
        updatedAt: TODAY,
        expiresAt: dateStr(30)
      }
    ]
  };
  const before = JSON.stringify(store.get());
  const ctx = AIContext.buildContext(data, { today: TODAY });

  expect(Array.isArray(ctx.memory.confirmed)).toBe(true);
  expect(ctx.memory.candidates.some((item) => item.id === 'candidate:pending' && item.status === 'pending')).toBe(true);
  expect(ctx.memory.candidates.some((item) => item.id === 'candidate:expired')).toBe(false);
  expect(JSON.stringify(ctx.memory)).not.toContain('candidate:rejected');
  expect(JSON.stringify(store.get())).toBe(before);
});
