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
      goal('g3', '已完成的小目标', 'focus', 'minutes', 60, weekMon(), weekSun()),
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
  const cjk = AIContext.estimateTokens('晨光自律台'.repeat(100));   // 500 个汉字
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
