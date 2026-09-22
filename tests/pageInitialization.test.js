import { test, expect, vi } from 'vitest';
import indexPageSrc from '../pages/index.js?raw';
import loginPageSrc from '../pages/login.js?raw';
import aiHtml from '../ai.html?raw';
import aiPageSrc from '../pages/ai.js?raw';
import goalsPageSrc from '../pages/goals.js?raw';
import goalsHtml from '../goals.html?raw';
import statsHtml from '../stats.html?raw';
import statsPageSrc from '../pages/stats.js?raw';
import workbenchHtml from '../workbench.html?raw';
import workbenchPageSrc from '../pages/workbench.js?raw';
import '../js/store.js';
import { dateStr, dateOffset } from '../js/utils/date.js';

const TODAY = dateStr(0);

function aiSeed() {
  return {
    _meta: { revision: 5, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '测试' },
    checkins: [
      { id: 'ck1', date: dateOffset(TODAY, -1), status: 'done' },
      { id: 'ck2', date: TODAY, status: 'done' },
    ],
    focus: [{ id: 'f1', date: TODAY, minutes: 30 }],
    sports: [{ id: 's1', date: TODAY, minutes: 20, calories: 100 }],
    readings: [],
    english: [{ id: 'e1', date: TODAY, minutes: 20, words: 10 }],
    todos: [
      { id: 't1', text: '完成作业', done: true },
      { id: 't2', text: '复习', done: false },
    ],
    courses: [{ id: 'c1', name: '高等数学', progress: 20, status: 'doing', credits: 4 }],
    goals: [{
      id: 'g1', title: '即将到期的目标', type: 'exercise', metric: 'minutes', targetValue: 600,
      period: 'custom', startDate: dateOffset(TODAY, -10), endDate: TODAY, status: 'active',
      createdAt: 'x', updatedAt: 'x',
    }],
  };
}

async function bootAi() {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('cg_token', 'test-token');
  localStorage.setItem('chenguangData', JSON.stringify(aiSeed()));
  const parsed = new DOMParser().parseFromString(aiHtml, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
  const revisionBefore = globalThis.CGStore.getRevision();
  vi.resetModules();
  await import('../js/store.js');
  const analytics = (await import('../js/analytics.js')).default;
  const getSpy = vi.spyOn(globalThis.CGStore, 'get');
  const consoleErrorSpy = vi.spyOn(console, 'error');
  await import('../pages/ai.js');
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { getSpy, revisionBefore, consoleErrorSpy };
}

test('AI 首屏一次快照并复用今日统计', async () => {
  const { getSpy, revisionBefore, consoleErrorSpy } = await bootAi();

  expect(document.getElementById('agentWorkspace').hidden).toBe(false);
  expect(document.querySelectorAll('#todayGrid .today-stat')).toHaveLength(6);
  expect(getSpy).toHaveBeenCalledTimes(1);
  expect(globalThis.CGStore.getRevision()).toBe(revisionBefore);
  expect(consoleErrorSpy).not.toHaveBeenCalled();
});

test('AI 页面刷新后保持数据一致并恢复仪表盘', async () => {
  await bootAi();
  const persisted = JSON.parse(localStorage.getItem('chenguangData'));
  expect(persisted._meta.revision).toBe(5);

  vi.resetModules();
  await import('../js/store.js');
  await import('../pages/ai.js');
  await new Promise((resolve) => setTimeout(resolve, 30));

  expect(document.getElementById('agentWorkspace').hidden).toBe(false);
  expect(document.getElementById('aiError').hidden).toBe(true);
  expect(document.querySelectorAll('#todayGrid .today-stat')).toHaveLength(6);
  expect(JSON.parse(localStorage.getItem('chenguangData'))._meta.revision).toBe(5);
});

test('goals/stats/ai 页面进入时不重复触发同步', () => {
  [goalsPageSrc, statsPageSrc, aiPageSrc].forEach((source) => {
    expect(source).not.toContain('afterLogin');
  });
});

test('页面初始化不引入路由级动画', () => {
  [aiHtml, goalsHtml, statsHtml, workbenchHtml].forEach((html) => {
    expect(html).not.toContain('@view-transition');
    expect(html).not.toMatch(/route-animation/i);
  });
});

test('登录页跳转链路不重复触发云端同步', () => {
  expect(loginPageSrc).not.toContain('CGSync.afterLogin');
  expect(indexPageSrc).not.toContain('CGSync.afterLogin');
});

test('工作台只在云端数据 revision 变化时二次渲染', () => {
  expect(workbenchPageSrc).toMatch(/var\s+revisionBefore\s*=\s*CGStore\.getRevision\(\)/);
  expect(workbenchPageSrc).toMatch(/revisionBefore\s*!==\s*CGStore\.getRevision\(\)[^;]*updateUI\(\)/s);
});

test('Stats 在真实首帧后再计算统计', () => {
  const nextPaintBlock = statsPageSrc.match(/function nextPaint\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  expect(nextPaintBlock).toContain('requestAnimationFrame');
  expect(nextPaintBlock).toContain('setTimeout');
});

test('侧边栏用户信息在页面主逻辑前初始化', () => {
  [aiHtml, goalsHtml, statsHtml, workbenchHtml].forEach((html) => {
    const bootstrapIndex = html.indexOf('<script src="js/shellBootstrap.js"></script>');
    const chromeIndex = html.indexOf('<script type="module" src="js/userChrome.js"></script>');
    const pageIndex = html.search(/<script type="module" src="pages\/(workbench|goals|stats|ai)\.js"><\/script>/);
    expect(bootstrapIndex).toBeGreaterThan(-1);
    expect(chromeIndex).toBeGreaterThan(-1);
    expect(pageIndex).toBeGreaterThan(-1);
    expect(bootstrapIndex).toBeLessThan(chromeIndex);
    expect(chromeIndex).toBeLessThan(pageIndex);
  });
});
