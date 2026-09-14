import { test, expect, beforeEach, vi } from 'vitest';
import { dateStr } from '../js/utils/date.js';

const TODAY = dateStr(0);

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function boot() {
  const store = (await import('../js/store.js')).default;
  const actions = (await import('../js/aiActions.js')).default;
  actions.clearFeedback();
  return { store, actions };
}

test('行动必须经过确认和白名单，直接写入走业务 Store', async () => {
  const { store, actions } = await boot();
  const revision = store.getRevision();
  const rejected = actions.applyProposal(store, { id: 'bad', type: 'delete_all', requiresConfirmation: true });
  expect(rejected.accepted).toBe(false);
  expect(store.getRevision()).toBe(revision);
  const accepted = actions.applyProposal(store, { id: 'focus-15', type: 'add_todo', title: '做 15 分钟专注', date: TODAY, priority: 'high', requiresConfirmation: true });
  expect(accepted.accepted).toBe(true);
  expect(store.getTodos().some((todo) => todo.__aiProposalId === 'focus-15')).toBe(true);
  expect(store.getRevision()).toBe(revision + 1);
});

test('未确认建议不可执行', async () => {
  const { store, actions } = await boot();
  const revision = store.getRevision();
  const result = actions.applyProposal(store, { id: 'no-confirm', type: 'add_todo', title: '未确认', requiresConfirmation: false });
  expect(result.accepted).toBe(false);
  expect(store.getRevision()).toBe(revision);
});

test('采纳后的行动可被后续结果观察', async () => {
  const { store, actions } = await boot();
  const proposal = { id: 'focus-loop', type: 'add_todo', title: '专注反馈任务', date: TODAY, requiresConfirmation: true };
  actions.applyProposal(store, proposal);
  expect(actions.observeOutcome(store)[0].status).toBe('in_progress');
  const todo = store.getTodos().find((item) => item.__aiProposalId === 'focus-loop');
  store.toggleTodo(todo.id);
  expect(actions.observeOutcome(store)[0].status).toBe('completed');
});
