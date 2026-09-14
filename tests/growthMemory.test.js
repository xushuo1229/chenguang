import { test, expect, beforeEach } from 'vitest';
import growthMemorySrc from '../js/growthMemory.js?raw';
import GrowthMemory from '../js/growthMemory.js';
import { dateStr } from '../js/utils/date.js';

const TODAY = dateStr(0);

function memoryContext(overrides = {}) {
  return {
    version: '1.0',
    today: TODAY,
    overview: { activeDays: 12, currentStreak: 7, studyMinutes: 600 },
    growth: {
      score: { value: 78, dataSufficient: true },
      strengths: [{ type: 'focus_habit_forming', reason: '最近 30 天专注时长上升 20%。' }],
      risks: [],
      trends: {
        '30d': { learningTrend: { status: 'rising', delta: 25, description: '最近 30 天学习趋势上升。' } },
        '90d': { learningTrend: { status: 'rising', delta: 40, description: '最近 90 天学习趋势上升。' } }
      }
    },
    growthState: {
      overall: 'improving',
      dataSufficiency: { overall: true },
      learningState: { summary: { minutes30: 600, activeDays30: 12 } },
      focusState: { summary: { minutes30: 240, activeDays30: 12 } },
      consistencyState: { summary: { activeDays30: 12, currentStreak: 7, longestStreak: 9 } },
      goalState: { summary: { active: 1, completed: 1 } },
      importantChanges: [{ status: 'rising', label: '学习', span: '30d', delta: 25 }],
      actionProposals: [{ id: 'focus-25', title: '安排 25 分钟深度学习' }]
    },
    coach: { recommendations: [{ title: '安排 25 分钟深度学习', message: '先恢复专注节奏。' }] },
    coachContext: {
      facts: [{ id: 'strategy:short_focus', kind: 'strategy_effectiveness', strategyKey: 'short_focus', statement: '短期专注策略已连续产生正向反馈。' }]
    },
    ...overrides
  };
}

function emptyContext() {
  return memoryContext({
    overview: {},
    growth: { score: {}, trends: {}, strengths: [], risks: [] },
    growthState: {
      overall: 'insufficient_data',
      dataSufficiency: { overall: false },
      learningState: { summary: {} },
      focusState: { summary: {} },
      consistencyState: { summary: {} },
      goalState: { summary: {} },
      importantChanges: []
    },
    coach: null,
    coachContext: null
  });
}

test('正常数据生成习惯、里程碑、偏好和长期洞察', () => {
  const memory = GrowthMemory.buildMemory(memoryContext(), { today: TODAY });
  expect(memory.version).toBe('1.0');
  expect(memory.updatedAt).toBe(TODAY);
  expect(memory.patterns.map((item) => item.statement).join(' ')).toMatch(/30 天|习惯/);
  expect(memory.milestones.map((item) => item.statement).join(' ')).toMatch(/连续成长 7 天|里程碑/);
  expect(memory.preferences.map((item) => item.statement).join(' ')).toContain('短期专注策略');
  expect(memory.insights.map((item) => item.statement).join(' ')).toMatch(/长期|稳定|上升/);
});

test('空数据用户不会生成虚构长期记忆', () => {
  const memory = GrowthMemory.buildMemory(emptyContext(), { today: TODAY });
  expect(memory.patterns).toHaveLength(0);
  expect(memory.milestones).toHaveLength(0);
  expect(memory.preferences).toHaveLength(0);
  expect(memory.insights).toHaveLength(0);
});

test('30 天趋势生成长期模式，短期波动不会生成长期结论', () => {
  const rising = GrowthMemory.buildMemory(memoryContext(), { today: TODAY });
  expect(rising.patterns.map((item) => item.statement).join(' ')).toContain('学习');
  expect(rising.insights.map((item) => item.statement).join(' ')).toContain('30 天');

  const context = memoryContext();
  context.growth.trends['30d'].learningTrend = { status: 'insufficient_data', delta: 0 };
  context.growth.trends['90d'].learningTrend = { status: 'insufficient_data', delta: 0 };
  context.growthState.consistencyState.summary = { activeDays30: 2, currentStreak: 0, longestStreak: 0 };
  context.growthState.importantChanges = [{ status: 'falling', label: '学习', span: '7d', delta: -20 }];
  const shortTerm = GrowthMemory.buildMemory(context, { today: TODAY });
  expect(shortTerm.patterns).toHaveLength(0);
});

test('连续记录和目标完成生成里程碑', () => {
  const memory = GrowthMemory.buildMemory(memoryContext(), { today: TODAY });
  expect(memory.milestones.some((item) => item.statement.includes('连续成长 7 天'))).toBe(true);
  expect(memory.milestones.some((item) => item.statement.includes('目标'))).toBe(true);
});

test('相同记忆重复出现时只更新次数与权重，不重复插入', () => {
  const next = GrowthMemory.buildMemory(memoryContext(), { today: TODAY });
  const merged = GrowthMemory.mergeMemory(next, next, { today: TODAY });
  const pattern = merged.patterns.find((item) => item.id === next.patterns[0].id);
  expect(merged.patterns).toHaveLength(next.patterns.length);
  expect(pattern.occurrences).toBe(2);
  expect(pattern.weight).toBeGreaterThan(next.patterns[0].weight);
});

test('长期未出现的记忆会降权并标记 inactive', () => {
  const existing = {
    version: '1.0',
    updatedAt: '2026-08-01',
    patterns: [{ id: 'pattern:old', kind: 'habit_pattern', statement: '旧习惯。', confidence: 'low', weight: 25, status: 'active', createdAt: '2026-08-01', lastSeenAt: '2026-08-01', occurrences: 1, evidence: {} }],
    milestones: [],
    preferences: [],
    insights: []
  };
  const merged = GrowthMemory.mergeMemory(existing, GrowthMemory.buildMemory(emptyContext(), { today: TODAY }), { today: TODAY });
  expect(merged.patterns[0].weight).toBe(15);
  expect(merged.patterns[0].status).toBe('inactive');
  expect(GrowthMemory.buildContextMemory(merged).patterns).toHaveLength(0);
});

test('Context Memory 只保留 active、高权重且有限数量的记忆', () => {
  const next = GrowthMemory.buildMemory(memoryContext(), { today: TODAY });
  const merged = GrowthMemory.mergeMemory(next, next, { today: TODAY });
  const contextMemory = GrowthMemory.buildContextMemory(merged);
  expect(contextMemory.patterns.length).toBeLessThanOrEqual(4);
  expect(contextMemory.milestones.length).toBeLessThanOrEqual(3);
  expect(contextMemory.preferences.length).toBeLessThanOrEqual(3);
  expect(contextMemory.insights.length).toBeLessThanOrEqual(4);
  contextMemory.patterns.forEach((item) => expect(item).not.toHaveProperty('weight'));
});

test('生成过程不修改输入 Context 或已有 Memory', () => {
  const context = memoryContext();
  const existing = { version: '1.0', patterns: [], milestones: [], preferences: [], insights: [] };
  const before = JSON.stringify({ context, existing });
  GrowthMemory.mergeMemory(existing, GrowthMemory.buildMemory(context, { today: TODAY }), { today: TODAY });
  expect(JSON.stringify({ context, existing })).toBe(before);
});

test('Memory 内容剥离敏感字段，只保留白名单证据', () => {
  const context = memoryContext();
  context.growth.risks.push({
    type: 'goal_risk',
    reason: '目标存在风险。',
    evidence: { goalId: 'g1', percentage: 20, email: 'secret@example.com', token: 'secret-token', password: 'secret-password', chat: '私密聊天原文' }
  });
  const memory = GrowthMemory.buildMemory(context, { today: TODAY });
  const serialized = JSON.stringify(memory);
  expect(serialized).not.toContain('secret@example.com');
  expect(serialized).not.toContain('secret-token');
  expect(serialized).not.toContain('secret-password');
  expect(serialized).not.toContain('私密聊天原文');
});

test('Growth Memory 模块不直接访问浏览器存储或业务模块', () => {
  expect(growthMemorySrc).not.toMatch(/localStorage|sessionStorage|CGStore|Store\.get|Analytics\.|GoalEngine|GrowthIntelligence|AICoach|GrowthReport/);
});

test('updateMemory 通过 Store.setUser 持久化，未变化时不重复写入', async () => {
  localStorage.clear();
  const seed = {
    _meta: { revision: 4, updatedAt: null, deviceId: 'test', tombstones: {} },
    user: { name: '测试' },
    checkins: [], focus: [], sports: [], readings: [], english: [], todos: [], courses: [], goals: []
  };
  localStorage.setItem('chenguangData', JSON.stringify(seed));
  const store = (await import('../js/store.js')).default;
  const revision = store.getRevision();
  const memory = GrowthMemory.updateMemory(store, memoryContext(), { today: TODAY });
  expect(memory.patterns.length).toBeGreaterThan(0);
  expect(store.getRevision()).toBe(revision + 1);
  expect(store.getUser().memory.patterns.length).toBeGreaterThan(0);

  const unchangedRevision = store.getRevision();
  const unchanged = GrowthMemory.updateMemory(store, memoryContext(), { today: TODAY });
  expect(unchanged.updatedAt).toBe(TODAY);
  expect(store.getRevision()).toBe(unchangedRevision);
});

beforeEach(() => {
  localStorage.clear();
});
