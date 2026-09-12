/**
 * Phase 15 · 移动端体验修复（V2 验收 + 移动端走查 P1）回归测试
 * --------------------------------------------------------------
 *  P1-1 全站输入框字号 ≥16px：iOS Safari 聚焦 <16px 输入框会强制放大页面且失焦不复位
 *  P1-2 index 375px 顶栏不再溢出（登录 + 免费注册 CTA 可见）；viewport 不再 maximum-scale=1.0
 *  P1-3 AI 页 iOS 键盘弹出不再遮挡输入框（100dvh + visualViewport 实时高度）
 *  P2  工作台「成长」面板连续打卡复用 Analytics 唯一口径（旧 continuousDays 字段从未被写入，恒 0）
 */
import { test, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import indexHtml from '../index.html?raw';
import workbenchHtml from '../workbench.html?raw';
import statsHtml from '../stats.html?raw';
import goalsHtml from '../goals.html?raw';
import aiHtml from '../ai.html?raw';
import workbenchPageSrc from '../pages/workbench.js?raw';
import aiPageSrc from '../pages/ai.js?raw';
import { dateStr, dateOffset } from '../js/utils/date.js';

// vitest 会把 .css 导入桩成空字符串，改用 fs 读取 CSS 源码
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharedCss = readFileSync(join(ROOT, 'css/shared.css'), 'utf-8');
const appCss = readFileSync(join(ROOT, 'css/app.css'), 'utf-8');

const TODAY = dateStr(0);
const YESTERDAY = dateOffset(TODAY, -1);
const TWO_AGO = dateOffset(TODAY, -2);
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* ---- 提取 CSS 文本中「元素选择器含 input/select/textarea」的规则块里的 font-size ---- */
function inputFontSizes(cssText) {
  const out = [];
  cssText.split('}').forEach((block) => {
    const brace = block.indexOf('{');
    if (brace === -1) return;
    const selector = block.slice(0, brace);
    // 元素选择器锚定：input[ / , input / .form-row input 等，排除 .chat-input 这类类名
    if (!/(^|[\s,>~+(])(input|select|textarea)([\[\].:#,\s)]|$)/.test(selector)) return;
    const m = block.match(/font-size:\s*([\d.]+)(px|rem)/);
    if (m) out.push({ selector: selector.trim().slice(-60), px: parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1) });
  });
  return out;
}
const allCss = [sharedCss, appCss,
  (indexHtml.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '',
  (workbenchHtml.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '',
  (statsHtml.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '',
  (goalsHtml.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '',
  (aiHtml.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '',
].join('\n');

test('P1-1 输入框字号：全站元素级 input/select/textarea 规则一律 ≥16px', () => {
  const small = inputFontSizes(allCss).filter((r) => r.px < 16);
  expect(small, '存在 <16px 的输入框字号: ' + JSON.stringify(small)).toHaveLength(0);
});

test('P1-1 类名输入框（.chat-input / .wb-select / .input）同样 ≥16px', () => {
  expect(aiHtml).toMatch(/\.chat-input\s*{[^}]*font-size:\s*16px/);
  expect(workbenchHtml).toMatch(/\.wb-select\s*{[^}]*font-size:\s*16px/);
  expect(sharedCss).toMatch(/\.input,[\s\S]{0,600}?font-size:\s*16px/);
});

test('P1-2 index viewport：不再 maximum-scale=1.0（iOS 捏合缩放可用）', () => {
  expect(indexHtml).not.toContain('maximum-scale');
  expect(indexHtml).toMatch(/name="viewport" content="width=device-width, initial-scale=1\.0"/);
});

test('P1-2 index 顶栏：≤480px 有缩排 + 缩小按钮，375px 内可容纳 logo + 登录 + 免费注册', () => {
  const mq = indexHtml.match(/@media \(max-width: 480px\)\s*{[\s\S]*?\n    }/);
  expect(mq).toBeTruthy();
  expect(mq[0]).toContain('.topbar-inner');
  expect(mq[0]).toContain('.topbar-actions .btn-outline, .topbar-actions .btn-primary');
});

test('P1-3 AI 页：dvh + visualViewport 实时高度，键盘弹出输入框不被遮挡', () => {
  expect(aiHtml).toContain('100dvh');
  expect(aiHtml).toContain("var(--vvh, 100dvh)");
  expect(aiPageSrc).toContain('visualViewport');
  expect(aiPageSrc).toContain('--vvh');
});

test('P2 成长面板连续打卡：不再读从未写入的 continuousDays 字段', () => {
  expect(workbenchPageSrc).not.toContain('u.continuousDays || 0');
  expect(workbenchPageSrc).toContain('Analytics.getStreaks().currentStreak');
});

/* ---- 行为回归：D2（第二天回访）工作台 streak 应显示真实连续天数 ---- */
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

test('P0 修复回归：setText 兼容裸 id（workbench 36 处调用此前全部静默失效）', async () => {
  // dom.js 层验证：裸 id / #选择器 / 类选择器 三种调用都生效（纯静态测试桩，无不可信内容）
  const mk = (id) => {
    const d = document.createElement('div');
    if (id) d.id = id; else d.className = 'clsEl';
    document.body.appendChild(d);
  };
  mk('bareEl'); mk('hashEl'); mk(null);
  const { setText } = await import('../js/utils/dom.js');
  setText('bareEl', 'A');          // 裸 id：修复前 querySelector('bareEl') 匹配不到任何元素
  setText('#hashEl', 'B');         // # 选择器：原行为
  setText('.clsEl', 'C');          // 类选择器：原行为
  expect(document.getElementById('bareEl').textContent).toBe('A');
  expect(document.getElementById('hashEl').textContent).toBe('B');
  expect(document.querySelector('.clsEl').textContent).toBe('C');
});

test('D2 行为回归：昨天+前天已打卡、今天未打卡 → 成长面板连续打卡显示 2（此前恒为 0）', async () => {
  const data = {
    _meta: { revision: 9, updatedAt: null, deviceId: 't', tombstones: {} },
    user: { name: '小陈', onboarded: true, startDate: dateOffset(TODAY, -7) },
    checkins: [
      { id: 'c1', date: TWO_AGO, status: 'done' },
      { id: 'c2', date: YESTERDAY, status: 'done' },
    ],
    focus: [{ id: 'f1', date: YESTERDAY, minutes: 45 }],
    sports: [], readings: [], english: [],
    todos: [{ id: 't2', date: TODAY, text: '复习英语单词', done: false }],
    courses: [], goals: [],
  };
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('cg_token', 'test-token');
  localStorage.setItem('chenguangData', JSON.stringify(data));
  mount(workbenchHtml);
  stubHeadAppend();
  globalThis.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx2d(); };
  window.Chart = FakeChart;
  vi.resetModules();
  await import('../pages/workbench.js');
  await settle(80);

  expect(document.getElementById('growthStreak').textContent).toBe('2');
});
