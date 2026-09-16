// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest';
import '../js/shellBootstrap.js';

beforeEach(() => {
  localStorage.setItem('cg_user', JSON.stringify({ nickname: '自律王' }));
});

test('Shell Bootstrap renders account user and Stats week shell before business JS', () => {
  document.body.innerHTML = [
    '<strong id="sidebarUserName"></strong>',
    '<div id="sidebarUserAvatar"></div>',
    '<div id="welcomeName"></div>',
    '<div id="rangeLabel">…</div>',
  ].join('');

  globalThis.cgShellBootstrap.render();

  expect(document.getElementById('sidebarUserName').textContent).toBe('自律王');
  expect(document.getElementById('sidebarUserAvatar').textContent).toBe('自');
  expect(document.getElementById('welcomeName').textContent).toBe('· 自律王');
  expect(document.getElementById('rangeLabel').textContent).toMatch(/^本周 · \d{4}年\d{1,2}月\d{1,2}日 – \d{4}年\d{1,2}月\d{1,2}日$/);
});

test('Workbench welcome uses its existing greeting format', () => {
  document.body.innerHTML = [
    '<div id="greetWord">你好</div>',
    '<strong id="sidebarUserName"></strong>',
    '<div id="sidebarUserAvatar"></div>',
    '<div id="welcomeName"></div>',
  ].join('');

  globalThis.cgShellBootstrap.render();

  expect(document.getElementById('welcomeName').textContent).toBe('自律王');
});
