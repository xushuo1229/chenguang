/**
 * Phase 15/16 · 交互层修复回归（modal 滚动锁与焦点 / 热力图触屏 / AI 抽屉）
 * --------------------------------------------------------------
 *  M1 openModal 锁定背景滚动，closeModal 解除；嵌套计数正确
 *  M2 openModal 不再自动聚焦输入框（移动端避免立即弹出软键盘），焦点仍移入弹窗
 *  M3 落地页遮罩点击 / ESC 关闭走统一 closeModal（此前绕过，会漏解锁滚动）
 *  H1 stats 热力图：点击格子显示详情 tooltip，点击空白收起（触屏无 hover 兜底）
 *  D1 AI 页移动端抽屉：点击侧边栏以外区域 / ESC 关闭
 */
import { test, expect, vi, beforeEach } from 'vitest';
import statsHtml from '../stats.html?raw';
import aiHtml from '../ai.html?raw';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dateStr, dateOffset } from '../js/utils/date.js';

const TODAY = dateStr(0);
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function mount(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
}
function stubHeadAppend() {
  const head = document.head;
  const orig = head.appendChild.bind(head);
  head.appendChild = function (node) {
    const r = orig(node);
    if (node && node.tagName === 'SCRIPT' && node.onload) { try { node.onload(); } catch (e) {} }
    return r;
  };
}
function fakeCtx2d() {
  return {
    createLinearGradient: () => ({ addColorStop: () => {} }), addColorStop: () => {},
    save: () => {}, restore: () => {}, fillText: () => {}, clip: () => {}, beginPath: () => {},
    moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    set fillStyle(v) {}, set strokeStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
    canvas: null, measureText: () => ({ width: 0 }),
  };
}
class FakeChart { constructor() {} destroy() {} }
FakeChart.defaults = { color: '', font: {}, borderColor: '', plugins: { legend: { labels: { color: '', padding: 12 } }, tooltip: {} } };

beforeEach(() => {
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

/* ==================== M1/M2 Modal ==================== */
test('M1 openModal 锁滚动 / closeModal 解锁 / 嵌套计数', async () => {
  mount('<!DOCTYPE html><html><body>'
    + '<div id="mA" class="modal-overlay hidden"><div class="modal-box"><button id="aBtn">关闭</button></div></div>'
    + '<div id="mB" class="modal-overlay hidden"><div class="modal-box"><input id="bInput"/></div></div>'
    + '</body></html>');
    vi.resetModules();
  const { openModal, closeModal } = await import('../js/ui/modal.js');

  expect(document.body.style.overflow).toBe('');
  openModal('mA');
  expect(document.body.style.overflow).toBe('hidden');
  openModal('mB');                    // 嵌套：第二个弹窗打开
  closeModal('mA');                   // 还剩 mB → 仍锁定
  expect(document.body.style.overflow).toBe('hidden');
  closeModal('mB');                   // 全关 → 解锁
  expect(document.body.style.overflow).toBe('');
  expect(document.body.style.paddingRight).toBe('');
});

test('M2 openModal 焦点进弹窗但不落在输入框（移动端不弹软键盘）', async () => {
  mount('<!DOCTYPE html><html><body>'
    + '<div id="mC" class="modal-overlay hidden"><div class="modal-box">'
    + '<input id="cInput"/><button id="cBtn">保存</button>'
    + '</div></div>'
    + '<div id="mD" class="modal-overlay hidden"><div class="modal-box"><input id="dInput"/></div></div>'
    + '</body></html>');
  vi.resetModules();
  const { openModal } = await import('../js/ui/modal.js');

  openModal('mC');
  expect(document.activeElement.id).toBe('cBtn');   // 第一个可聚焦是按钮，不是输入框
  closeModal('mC');

  openModal('mD');                                   // 弹窗只有输入框 → 聚焦弹窗本身，不弹键盘
  expect(document.activeElement).toBe(document.getElementById('mD'));
  expect(document.activeElement.tagName).not.toBe('INPUT');
});

/* ==================== M3 落地页关闭路径 ==================== */
test('M3 遮罩点击与 ESC 走 closeModal：滚动锁正确解除', async () => {
  const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');
  mount(indexHtml);
  vi.resetModules();
  await import('../pages/index.js');
  await settle(50);

  const modal = document.getElementById('modalLogin');
  const { openModal } = await import('../js/ui/modal.js');
  openModal('modalLogin');
  expect(document.body.style.overflow).toBe('hidden');

  // 模拟点击遮罩层本身
  modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(modal.classList.contains('hidden')).toBe(true);
  expect(document.body.style.overflow).toBe('');

  openModal('modalLogin');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(modal.classList.contains('hidden')).toBe(true);
  expect(document.body.style.overflow).toBe('');
});

/* ==================== H1 热力图触屏 ==================== */
test('H1 热力图：点击格子出 tooltip、点空白收起', async () => {
  const seed = {
    _meta: { revision: 7, updatedAt: null, deviceId: 't', tombstones: {} },
    user: { name: '测试', semesterStart: dateStr(-20) },
    checkins: [
      { id: 'ck1', date: dateStr(-2), status: 'done' },
      { id: 'ck2', date: dateStr(-1), status: 'done' },
      { id: 'ck3', date: TODAY, status: 'done' },
    ],
    english: [{ id: 'e1', date: TODAY, minutes: 30, words: 40 }],
    focus: [{ id: 'f1', date: TODAY, minutes: 25 }, { id: 'f2', date: dateStr(-1), minutes: 50 }],
    sports: [{ id: 's1', date: TODAY, name: '跑步', duration: 30, calories: 200, type: 'run' }],
    readings: [{ id: 'r1', date: dateStr(-1), pages: 20 }],
    todos: [{ id: 't1', date: TODAY, text: 'a', done: true }],
    courses: [],
  };
  localStorage.clear();
  localStorage.setItem('cg_token', 'test-token');
  localStorage.setItem('chenguangData', JSON.stringify(seed));
  mount(statsHtml);
  stubHeadAppend();
  globalThis.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx2d(); };
  window.Chart = FakeChart;
  vi.resetModules();
  await import('../pages/stats.js');
  await settle(60);

  const container = document.getElementById('heatmapContainer');
  const tooltip = document.getElementById('heatmapTooltip');
  expect(container).toBeTruthy();
  const cell = container.querySelector('.hoverable');
  expect(cell, '热力图应渲染出可交互格子').toBeTruthy();

  cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(tooltip.classList.contains('show')).toBe(true);

  container.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // 点空白（container 本身）
  expect(tooltip.classList.contains('show')).toBe(false);
});

/* ==================== D1 AI 抽屉 ==================== */
test('D1 AI 抽屉：点击侧边栏以外区域 / ESC 关闭', async () => {
  mount(aiHtml);
  stubHeadAppend();
  globalThis.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx2d(); };
  window.Chart = FakeChart;
  localStorage.clear();
  localStorage.setItem('cg_token', 'test-token');
  localStorage.setItem('chenguangData', JSON.stringify({
    _meta: { revision: 1, updatedAt: null, deviceId: 't', tombstones: {} },
    user: { name: '测试' },
    checkins: [], focus: [], sports: [], readings: [], english: [], todos: [], courses: [], goals: [],
  }));
  vi.resetModules();
  await import('../pages/ai.js');
  await settle(60);

  document.body.classList.add('sidebar-open');
  // 点击侧边栏内部 → 不关闭
  const sidebar = document.querySelector('.sidebar');
  expect(sidebar).toBeTruthy();
  sidebar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(document.body.classList.contains('sidebar-open')).toBe(true);

  // 点击主内容区 → 关闭
  const main = document.querySelector('.main') || document.body;
  main.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(document.body.classList.contains('sidebar-open')).toBe(false);

  // ESC 也能关
  document.body.classList.add('sidebar-open');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.body.classList.contains('sidebar-open')).toBe(false);
});
