import { test, expect, beforeEach, vi } from 'vitest';
import { dateStr } from '../js/utils/date.js';

const TODAY = dateStr(0);

function proposal(id, title = '做 15 分钟专注') {
  return { id, type: 'add_todo', title, date: TODAY, priority: 'high', why: '真实数据提示执行节奏需要恢复', evidence: { metric: 'focus' }, requiresConfirmation: true };
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function boot(userId) {
  localStorage.setItem('cg_user', JSON.stringify({ id: userId, email: userId + '@example.com' }));
  const store = (await import('../js/store.js')).default;
  const memory = (await import('../js/coachMemory.js')).default;
  return { store, memory };
}

test('建议生命周期：proposed → accepted → completed，结果来自业务数据', async () => {
  const { store, memory } = await boot('user-a');
  const item = proposal('focus-loop');
  memory.addRecommendation(item);
  expect(memory.getCoachContext(store.get()).feedbackSummary[0]).toBeUndefined();
  memory.acceptProposal(item);
  store.addTodo({ text: item.title, date: TODAY, __aiProposalId: 'focus-loop' });
  store.toggleTodo(store.getTodos().find((todo) => todo.__aiProposalId === 'focus-loop').id);
  const outcomes = memory.observeOutcomes(store.get());
  expect(outcomes.outcomes[0].status).toBe('completed');
  const persisted = JSON.parse(localStorage.getItem('cg_ai_coach_memory_v1')).users['user-a'];
  const recommendation = persisted.recommendations.find((row) => row.recommendationId === 'focus-loop');
  expect(recommendation.status).toBe('completed');
  expect(recommendation.outcome).toBe('business_data_confirmed');
  expect(recommendation.effectiveness).toBe(1);
});

test('显式拒绝和过期都能表达，且不虚构完成结果', async () => {
  const { store, memory } = await boot('user-a');
  memory.rejectProposal(proposal('rejected-one'));
  memory.acceptProposal(proposal('accepted-old'));
  const memoryData = JSON.parse(localStorage.getItem('cg_ai_coach_memory_v1'));
  memoryData.users['user-a'].recommendations.find((row) => row.recommendationId === 'accepted-old').acceptedAt = new Date(Date.now() - 20 * 86400000).toISOString();
  localStorage.setItem('cg_ai_coach_memory_v1', JSON.stringify(memoryData));
  memory.observeOutcomes(store.get());
  const records = JSON.parse(localStorage.getItem('cg_ai_coach_memory_v1')).users['user-a'].recommendations;
  expect(records.find((row) => row.recommendationId === 'rejected-one').status).toBe('rejected');
  expect(records.find((row) => row.recommendationId === 'accepted-old').status).toBe('expired');
});

test('样本不足时没有 Coach Memory 结论', async () => {
  const { store, memory } = await boot('user-a');
  memory.acceptProposal(proposal('single'));
  store.addTodo({ text: 'single', date: TODAY, __aiProposalId: 'single' });
  store.toggleTodo(store.getTodos().find((todo) => todo.__aiProposalId === 'single').id);
  memory.observeOutcomes(store.get());
  const context = memory.getCoachContext(store.get());
  expect(context.facts).toHaveLength(0);
  expect(context.feedbackSummary[0].insufficientEvidence).toBe(true);
});

test('足够样本后形成策略 Memory，但不做因果断言', async () => {
  const { store, memory } = await boot('user-a');
  for (let index = 0; index < 3; index++) {
    const item = proposal('strategy-' + index);
    memory.acceptProposal(item);
    store.addTodo({ text: item.title, date: TODAY, __aiProposalId: item.id });
    store.toggleTodo(store.getTodos().find((todo) => todo.__aiProposalId === item.id).id);
  }
  memory.observeOutcomes(store.get());
  const context = memory.getCoachContext(store.get());
  expect(context.facts[0].kind).toBe('strategy_effectiveness');
  expect(context.facts[0].evidence.sampleCount).toBe(3);
  expect(context.facts[0].statement).toContain('完成率');
  expect(context.facts[0].statement).not.toContain('导致');
});

test('Coach Memory 按用户隔离且可删除', async () => {
  const first = await boot('user-a');
  first.memory.acceptProposal(proposal('first'));
  expect(first.memory.getCoachContext(first.store.get()).available).toBe(true);
  const second = await boot('user-b');
  expect(second.memory.getCoachContext(second.store.get()).available).toBe(false);
  second.memory.clear();
  expect(localStorage.getItem('cg_ai_coach_memory_v1')).toBeNull();
});

test('只读 Growth/Retrieval 不会创建 Coach Memory', async () => {
  const snapshot = {
    user: { name: 'A' }, checkins: [], focus: [], english: [], sports: [], readings: [], todos: [], courses: [], goals: []
  };
  const Growth = (await import('../js/growthIntelligence.js')).default;
  const Retrieval = (await import('../js/aiDataRetrieval.js')).default;
  Growth.computeGrowthState(snapshot, { today: TODAY });
  Retrieval.query('效率怎么样？', snapshot, { today: TODAY });
  expect(localStorage.getItem('cg_ai_coach_memory_v1')).toBeNull();
});
