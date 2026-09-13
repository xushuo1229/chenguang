import { test, expect, beforeEach, vi } from 'vitest';
import workbenchHtml from '../workbench.html?raw';
import { dateStr } from '../js/utils/date.js';

const TODAY = dateStr(0);
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

function seedData() {
  return {
    _meta: { revision: 1, updatedAt: null, deviceId: 'test', tombstones: {} },
    user: { name: '小陈', onboarded: true },
    checkins: [],
    sports: [],
    readings: [],
    english: [],
    todos: [{ id: 'todo-1', date: TODAY, text: '完成高数第三章习题', done: false, priority: 'mid' }],
    courses: [],
    goals: [],
    focus: [],
  };
}

function mount(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
}

async function boot() {
  localStorage.clear();
  localStorage.setItem('cg_token', 'test-token');
  localStorage.setItem('chenguangData', JSON.stringify(seedData()));
  mount(workbenchHtml);
  window.scrollTo = vi.fn();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
  vi.resetModules();
  await import('../pages/workbench.js');
  await settle(80);
}

beforeEach(() => {
  localStorage.clear();
});

test('新用户引导包含目标创建，并保持 4 步行动路径', () => {
  const parsed = new DOMParser().parseFromString(workbenchHtml, 'text/html');
  const actions = [...parsed.querySelectorAll('#onboardActions [data-ob]')];
  expect(actions.map((node) => node.getAttribute('data-ob'))).toEqual(['checkin', 'goal', 'course', 'todo']);
  expect(parsed.querySelector('#onboardProgress')?.textContent).toContain('0 / 4');
  expect(actions.find((node) => node.getAttribute('data-ob') === 'goal')?.textContent).toContain('目标');
});

test('工作台展示基于真实待办的下一步，而不是静态空文案', async () => {
  await boot();
  expect(document.getElementById('todayNext').hidden).toBe(false);
  expect(document.getElementById('todayNextText').textContent).toContain('完成高数第三章习题');
});

test('空态文案给出可执行下一步', () => {
  const parsed = new DOMParser().parseFromString(workbenchHtml, 'text/html');
  expect(parsed.getElementById('planEmpty').textContent).toContain('添加一件');
  expect(parsed.getElementById('courseEmpty').textContent).toContain('添加一门课程');
  expect(parsed.body.textContent).toContain('4 步上手晨光自律台');
});
