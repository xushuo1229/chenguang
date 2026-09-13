import { test, expect } from 'vitest';
import statsHtml from '../stats.html?raw';
import workbenchHtml from '../workbench.html?raw';
import goalsPageSrc from '../pages/goals.js?raw';

test('空统计页直接引导用户完成第一个记录', () => {
  expect(statsHtml).toContain('去完成第一个记录');
  expect(statsHtml).toContain('<a href="workbench.html" class="btn btn-primary">去完成第一个记录</a>');
});

test('创建目标后提示用户回到工作台完成第一次记录', () => {
  expect(goalsPageSrc).toContain('目标已创建，回工作台完成第一次记录');
});

test('新手引导保留可明确跳过的方式', () => {
  const parsed = new DOMParser().parseFromString(workbenchHtml, 'text/html');
  const skip = parsed.getElementById('onboardClose');
  expect(skip).toBeTruthy();
  expect(skip.getAttribute('aria-label')).toBe('跳过引导');
  expect(skip.textContent.trim()).toBe('跳过');
});
