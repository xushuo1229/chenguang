// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { todayStr, dateStr, fmtDate } from '../js/utils/date.js';
import '../js/store.js';

const todayHtml = readFileSync('today.html', 'utf8');
const todayJs = readFileSync('pages/today.js', 'utf8');
const navPages = ['stats.html', 'goals.html', 'ai.html', 'workbench.html'].map(f => readFileSync(f, 'utf8'));

describe('today plan page', () => {
  beforeEach(() => {
    localStorage.clear();
    if (globalThis.CGStore && globalThis.CGStore.resetData) {
      globalThis.CGStore.resetData();
    }
    localStorage.setItem('cg_token', 'test-token');
    localStorage.setItem('cg_user', JSON.stringify({ name: '测试', nickname: '测试' }));
  });

  it('creates today.html as a standalone page with correct structure', () => {
    expect(todayHtml).toContain('<title>今日计划 · Zeno</title>');
    expect(todayHtml).toContain('class="dashboard-shell"');
    expect(todayHtml).toContain('id="taskList"');
    expect(todayHtml).toContain('id="statTotal"');
    expect(todayHtml).toContain('id="statDone"');
    expect(todayHtml).toContain('id="statPending"');
    expect(todayHtml).toContain('id="statRate"');
    expect(todayHtml).toContain('id="addTaskBtn"');
    expect(todayHtml).toContain('pages/today.js');
  });

  it('today page uses CGStore API, not direct localStorage', () => {
    expect(todayJs).toContain('getStore()');
    expect(todayJs).toContain('getTodosByDate');
    expect(todayJs).toContain('addTodo');
    expect(todayJs).toContain('toggleTodo');
    expect(todayJs).toContain('removeTodo');
    expect(todayJs).toContain('updateTodo');
    expect(todayJs).not.toContain('localStorage.setItem(\'chenguangData\'');
  });

  it('today page filters by current date only', () => {
    const store = globalThis.CGStore;
    const today = todayStr();
    const yesterday = dateStr(-1);
    const tomorrow = dateStr(1);

    store.addTodo({ text: '今天的任务', date: today });
    store.addTodo({ text: '昨天的任务', date: yesterday });
    store.addTodo({ text: '明天的任务', date: tomorrow });

    const todayTodos = store.getTodosByDate(today);
    expect(todayTodos.length).toBe(1);
    expect(todayTodos[0].text).toBe('今天的任务');

    const yesterdayTodos = store.getTodosByDate(yesterday);
    expect(yesterdayTodos.length).toBe(1);
    expect(yesterdayTodos[0].text).toBe('昨天的任务');
  });

  it('toggle todo updates done status in CGStore', () => {
    const store = globalThis.CGStore;
    store._data = { todos: [], _meta: {} };
    const t = store.addTodo({ text: 'toggle me', date: todayStr() });
    expect(t.done).toBe(false);

    store.toggleTodo(t.id);
    const updated = store.getTodos().find(x => x.id === t.id);
    expect(updated.done).toBe(true);

    store.toggleTodo(t.id);
    const reverted = store.getTodos().find(x => x.id === t.id);
    expect(reverted.done).toBe(false);
  });

  it('add todo with today date appears in getTodosByDate', () => {
    const store = globalThis.CGStore;
    store._data = { todos: [], _meta: {} };
    store.addTodo({ text: 'new plan', date: todayStr() });
    const todos = store.getTodosByDate(todayStr());
    expect(todos.length).toBe(1);
    expect(todos[0].text).toBe('new plan');
    expect(todos[0].done).toBe(false);
  });

  it('remove todo deletes from CGStore', () => {
    const store = globalThis.CGStore;
    store._data = { todos: [], _meta: {} };
    const t = store.addTodo({ text: 'delete me', date: todayStr() });
    expect(store.getTodosByDate(todayStr()).length).toBe(1);
    store.removeTodo(t.id);
    expect(store.getTodosByDate(todayStr()).length).toBe(0);
  });

  it('update todo modifies text', () => {
    const store = globalThis.CGStore;
    store._data = { todos: [], _meta: {} };
    const t = store.addTodo({ text: 'original', date: todayStr() });
    store.updateTodo(t.id, { text: 'updated' });
    const updated = store.getTodos().find(x => x.id === t.id);
    expect(updated.text).toBe('updated');
  });

  it('empty day returns empty array and zero stats', () => {
    const store = globalThis.CGStore;
    store._data = { todos: [], _meta: {} };
    const todos = store.getTodosByDate(todayStr());
    expect(todos.length).toBe(0);
    expect(todos.filter(t => t.done).length).toBe(0);
  });

  it('all nav links point to today.html for 今日计划', () => {
    for (const html of navPages) {
      expect(html).toContain('href="today.html"');
      expect(html).toContain('今日计划');
    }
  });

  it('today.html sidebar has active class on today plan link', () => {
    expect(todayHtml).toContain('href="today.html" class="nav-item active"');
  });

  it('workbench todo card is a dashboard summary, not a duplicate data system', () => {
    const workbenchJs = readFileSync('pages/workbench.js', 'utf8');
    const workbenchHtml = navPages[3];
    expect(workbenchHtml).toContain('id="taskList"');
    expect(workbenchJs).toContain('Store.getTodosByDate');
  });

  it('today.js does not create a second store or sync mechanism', () => {
    expect(todayJs).not.toContain('newTodayPlanStore');
    expect(todayJs).not.toContain('todayPlans[]');
    expect(todayJs).not.toContain('revision');
    expect(todayJs).not.toContain('fetch(');
  });
});
