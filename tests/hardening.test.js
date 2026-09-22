/**
 * Product Hardening · 修复回归测试
 * --------------------------------------------------------------
 * 覆盖上一轮 Product Experience Validation 发现问题的修复：
 *  P1-1 落地页不再包含虚构社交证明/虚构统计（HTML 与 JS 双重检查）
 *  P1-2 后端不可达时注册/登录不产生幽灵账号（demo_token_ / cg_demo_users）
 *  P2-1 注册密码提示与后端规则一致（8-32 位 + 大小写 + 数字）
 *  P2-2 AI 错误文案不含开发者语言（AI_API_KEY/环境变量/后端路径）
 *  P2-3 AI 不可用时页面降级：仪表盘仍在、无无限 loading、有降级提示
 *  P3-1 同名课程添加出现明确提示，课程数据模型/revision 语义不变
 *  P3-2 Workbench icon-only 按钮均有 aria-label
 * ------------------------------------------------------------
 */
import { test, expect, beforeEach, vi } from 'vitest';
import indexHtml from '../index.html?raw';
import workbenchHtml from '../workbench.html?raw';
import aiHtml from '../ai.html?raw';
import indexPageSrc from '../pages/index.js?raw';
import workbenchPageSrc from '../pages/workbench.js?raw';
import { dateStr, dateOffset } from '../js/utils/date.js';

const TODAY = dateStr(0);
const day = (n) => dateOffset(TODAY, n);
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* ---- jsdom 页面挂载辅助 ---- */
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

async function boot(html, pagePath, { data = null, token = 'test-token' } = {}) {
  localStorage.clear();
  sessionStorage.clear();
  if (token) localStorage.setItem('cg_token', token);
  if (data) localStorage.setItem('chenguangData', JSON.stringify(data));
  mount(html);
  stubHeadAppend();
  globalThis.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx2d(); };
  window.Chart = FakeChart;
  vi.resetModules();
  const page = await import(pagePath);
  await settle(80);
  return page;
}

function toastText() {
  return [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('\n');
}

/* ============================================================
   P1-1 落地页：虚构数据清零
   ============================================================ */
const FORBIDDEN_LANDING = [
  '12,800', '3,482', '52,140', '18.6', '487 天', '73%', '2,341', '672',
  '正在坚持', '最高连续打卡', '累计 3,482', '人均年读', '完课率提升',
  '最高在线', '完成打卡 ·', '张同学', '在职考研',
  '陪伴式社群', '自律挑战',
];

test('落地页 HTML：不含任何虚构社交证明 / 虚构统计', () => {
  for (const bad of FORBIDDEN_LANDING) {
    expect(indexHtml, `不应包含虚构内容: ${bad}`).not.toContain(bad);
  }
});

test('落地页 JS：不注入虚构统计，不再写入 cg_demo_users / demo_token_', () => {
  for (const bad of FORBIDDEN_LANDING) {
    expect(indexPageSrc, `页面脚本不应包含: ${bad}`).not.toContain(bad);
  }
  expect(indexPageSrc).not.toContain('cg_demo_users');
  expect(indexPageSrc).not.toContain('demo_token_');
  expect(indexPageSrc).not.toContain("localStorage.setItem('cg_demo_users'");
  expect(indexPageSrc).not.toContain('password: pwd');
});

test('落地页结构完整：CTA / 登录注册弹窗 / 密码提示对齐后端规则', () => {
  const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
  // CTA 与弹窗不受影响
  expect(parsed.querySelectorAll('[data-action="register"]').length).toBeGreaterThanOrEqual(3);
  expect(parsed.getElementById('modalLogin')).toBeTruthy();
  expect(parsed.getElementById('modalRegister')).toBeTruthy();
  // hero 首屏仍有真实能力语言，不留空白
  expect(parsed.body.textContent).toContain('功能模块一站记录');
  // 密码提示与后端规则一致（后端：至少 8 位 + 大小写 + 数字）
  expect(parsed.body.textContent).toContain('含大小写字母和数字');
  // 登录表单与后端能力一致（后端仅支持邮箱登录）
  expect(parsed.body.textContent).not.toContain('使用邮箱或用户名');
});

test('落地页 JS：密码前端校验规则与后端一致（8-32 位 + 大小写 + 数字）', () => {
  expect(indexPageSrc).toContain("pwd.length < 8");
  expect(indexPageSrc).toContain('/[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\\d/.test(pwd)');
  expect(indexPageSrc).toContain('密码需包含大写字母、小写字母和数字');
});

/* ============================================================
   P1-2 身份诚实化：后端不可达 → 明确失败，无幽灵账号
   ============================================================ */
function seedData() {
  return {
    _meta: { revision: 1, updatedAt: null, deviceId: 't', tombstones: {} },
    user: { name: '' },
    checkins: [], sports: [], readings: [], english: [], todos: [], courses: [], goals: [],
  };
}

test('后端不可达：注册明确失败，无 demo_token_ / cg_demo_users / 假成功 toast', async () => {
  await boot(indexHtml, '../pages/index.js', { token: '' });
  globalThis.CGAPI = {
    auth: { register: vi.fn().mockRejectedValue({ status: 0, message: '网络连接失败' }) },
  };
  document.getElementById('regUsername').value = '测试同学';
  document.getElementById('regEmail').value = 'test@example.com';
  document.getElementById('regPwd').value = 'Test1234';
  document.getElementById('regPwd2').value = 'Test1234';
  document.getElementById('regTerms').checked = true;
  document.getElementById('btnDoRegister').click();
  await settle(60);

  const t = toastText();
  expect(t).toContain('当前无法连接服务器');
  expect(t).not.toContain('注册成功');
  expect(localStorage.getItem('cg_token')).toBeNull();
  expect(localStorage.getItem('cg_demo_users')).toBeNull();
  // 不产生任何演示用户身份数据
  expect(localStorage.getItem('cg_user')).toBeNull();
});

test('后端不可达：登录同样明确失败，不产生本地身份', async () => {
  await boot(indexHtml, '../pages/index.js', { token: '' });
  globalThis.CGAPI = {
    auth: { login: vi.fn().mockRejectedValue({ status: 0, message: '网络连接失败' }) },
  };
  document.getElementById('loginAccount').value = 'test@example.com';
  document.getElementById('loginPwd').value = 'Test1234';
  document.getElementById('btnDoLogin') ? document.getElementById('btnDoLogin').click() : window.doLogin();
  await settle(60);

  expect(toastText()).toContain('当前无法连接服务器');
  expect(localStorage.getItem('cg_token')).toBeNull();
});

test('正常注册路径不受影响：后端成功 → 真实 token', async () => {
  await boot(indexHtml, '../pages/index.js', { token: '' });
  globalThis.CGAPI = {
    auth: { register: vi.fn().mockResolvedValue({ token: 'real-token', user: { email: 'a@b.com' } }) },
  };
  document.getElementById('regUsername').value = '测试同学';
  document.getElementById('regEmail').value = 'a@b.com';
  document.getElementById('regPwd').value = 'Test1234';
  document.getElementById('regPwd2').value = 'Test1234';
  document.getElementById('regTerms').checked = true;
  document.getElementById('btnDoRegister').click();
  await settle(60);

  expect(toastText()).toContain('注册成功');
  expect(globalThis.CGAPI.auth.register).toHaveBeenCalledWith('测试同学', 'a@b.com', 'Test1234');
  // token 落盘由真实 apiClient 负责（sync 测试已覆盖），stub 下不产生任何本地 demo 身份
  expect(localStorage.getItem('cg_demo_users')).toBeNull();
  expect(String(localStorage.getItem('cg_token'))).not.toContain('demo_token_');
});

test('弱密码：前端即拒绝（与后端规则一致），不发起请求', async () => {
  await boot(indexHtml, '../pages/index.js', { token: '' });
  const register = vi.fn();
  globalThis.CGAPI = { auth: { register } };
  document.getElementById('regUsername').value = '测试同学';
  document.getElementById('regEmail').value = 'a@b.com';
  document.getElementById('regPwd').value = 'test1234';   // 无大写字母
  document.getElementById('regPwd2').value = 'test1234';
  document.getElementById('regTerms').checked = true;
  document.getElementById('btnDoRegister').click();
  await settle(60);

  expect(register).not.toHaveBeenCalled();
  expect(document.getElementById('hintRegPwd').textContent).toContain('大写字母');
});

/* ============================================================
   P2-2 / P2-3 AI 错误文案安全 + 降级体验
   ============================================================ */
function seedAiData() {
  return {
    _meta: { revision: 5, updatedAt: null, deviceId: 't', tombstones: {} },
    user: { name: '测试' },
    checkins: [{ id: 'ck1', date: TODAY, status: 'done' }],
    focus: [{ id: 'f1', date: TODAY, minutes: 45 }],
    sports: [{ id: 's1', date: TODAY, minutes: 30, calories: 200 }],
    readings: [], english: [{ id: 'e1', date: TODAY, minutes: 25, words: 20 }],
    todos: [{ id: 't1', text: '复习英语', done: false }],
    courses: [{ id: 'c1', name: '高等数学', progress: 10, status: 'doing', credits: 4 }],
    goals: [{
      id: 'g1', title: '即将到期的目标', type: 'exercise', metric: 'minutes', targetValue: 600,
      period: 'custom', startDate: day(-10), endDate: TODAY, status: 'active',
      createdAt: 'x', updatedAt: 'x',
    }],
  };
}

const LEAK_PATTERNS = [/AI_API_KEY/i, /环境变量/, /\.env/i, /backend/i, /stack/i, /localhost:3000/, /127\.0\.0\.1/, /eyJ/];

async function bootAi() {
  await boot(aiHtml, '../pages/ai.js', { data: seedAiData() });
}
function chatBubbles() {
  return [...document.querySelectorAll('#agentMessages .msg-ai .msg-bubble')];
}
async function sendAndCatch(errLike) {
  globalThis.CGAPI.personalAgent = {
    context: vi.fn().mockResolvedValue({ data: {} }),
    chat: vi.fn().mockRejectedValue(errLike),
  };
  const input = document.getElementById('agentInput');
  input.value = '我今天应该做什么？';
  document.getElementById('agentSend').click();
  await settle(); await settle();
}

test('AI_NOT_CONFIGURED：用户文案不泄露内部配置，仪表盘仍然可见', async () => {
  await bootAi();
  await sendAndCatch({ status: 500, data: { error: { code: 'AI_NOT_CONFIGURED', message: 'AI 服务未配置，请在后端环境变量设置 AI_API_KEY' } } });

  const bubble = chatBubbles()[chatBubbles().length - 1].textContent;
  expect(bubble).toContain('仍可以查看');
  for (const p of LEAK_PATTERNS) expect(bubble, `泄露: ${p}`).not.toMatch(p);
  // 降级体验：仪表盘未被错误态替换，无无限 loading
  expect(document.getElementById('agentWorkspace').hidden).toBe(false);
  expect(document.querySelectorAll('#todayGrid .today-stat').length).toBe(6);
  expect(document.getElementById('agentInput').disabled).toBe(false);
  expect(document.querySelector('#chatMessages .typing-dots')).toBeNull();
});

test('timeout / 429 / 500 / 网络错误：文案安全且不透出后端细节', async () => {
  await bootAi();
  const cases = [
    { err: { name: 'AbortError' }, want: 'AI 响应超时' },
    { err: { status: 429, data: { error: { code: 'AI_RATE_LIMITED', message: '请求太频繁' } } }, want: 'AI 当前请求较多' },
    { err: { status: 503, message: 'upstream blew up with stack info' }, want: 'AI 服务暂时不可用' },
    { err: { status: 0, message: '网络连接失败，请检查后端服务是否启动' }, want: '暂时无法连接 AI 服务' },
  ];
  for (const c of cases) {
    // 每个用例重开会话（清掉上一轮的系统气泡）
    await bootAi();
    await sendAndCatch(c.err);
    const bubble = chatBubbles()[chatBubbles().length - 1].textContent;
    expect(bubble).toContain(c.want);
    for (const p of LEAK_PATTERNS) expect(bubble, `泄露: ${p}`).not.toMatch(p);
  expect(document.getElementById('agentInput').disabled).toBe(false);
    expect(document.querySelector('#chatMessages .typing-dots')).toBeNull();
  }
});

/* ============================================================
   P3-1 同名课程提示
   ============================================================ */
test('同名课程：允许添加并出现「新的班次」提示；revision 语义不变（每次 +1）', async () => {
  await boot(workbenchHtml, '../pages/workbench.js', { data: seedData() });
  const Store = window.CGStore;
  const rev0 = Store.getRevision();

  document.getElementById('courseName').value = '高等数学';
  document.getElementById('courseTotal').value = '10';
  document.getElementById('courseLearned').value = '2';
  document.getElementById('saveCourseBtn').click();
  await settle(60);
  expect(toastText()).not.toContain('新的班次');   // 首次添加正常文案
  const rev1 = Store.getRevision();

  // 第二次添加同名课程 → 允许 + 明确提示
  document.getElementById('courseName').value = '高等数学';
  document.getElementById('courseTotal').value = '8';
  document.getElementById('courseLearned').value = '0';
  document.getElementById('saveCourseBtn').click();
  await settle(60);
  expect(toastText()).toContain('已存在同名课程，本次已作为新的班次添加。');
  expect(Store.get().courses.filter((c) => c.name === '高等数学')).toHaveLength(2);
  expect(Store.getRevision()).toBe(rev1 + 1);
  expect(Store.getRevision()).toBe(rev0 + 2);
});

/* ============================================================
   P3-2 Workbench icon-only 按钮 aria-label
   ============================================================ */
test('Workbench：所有 icon-only 按钮均有 aria-label（静态 HTML + JS 渲染模板）', () => {
  const parsed = new DOMParser().parseFromString(workbenchHtml, 'text/html');
  parsed.querySelectorAll('button').forEach((btn) => {
    const text = btn.textContent.trim();
    if (!text && !btn.getAttribute('aria-label')) {
      expect.fail(`icon-only 按钮缺少 aria-label: <button class="${btn.className}">`);
    }
    // 已有可见文字的按钮不应有无意义重复 label
    if (text && btn.getAttribute('aria-label') === text) {
      expect.fail(`冗余 aria-label: ${text}`);
    }
  });
  // JS 渲染的列表操作按钮（✏️ / 🗑）同样带 aria-label
  expect(workbenchPageSrc).toContain('aria-label="编辑课程"');
  expect(workbenchPageSrc).toContain('aria-label="删除待办"');
  expect(workbenchPageSrc).toContain('aria-label="删除专注记录"');
});
