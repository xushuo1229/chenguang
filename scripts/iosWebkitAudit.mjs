// iOS WebKit 引擎走查（engine-level，非真机）：
//   - 设备描述：iPhone 14 Pro (393x852, DPR3, touch) / iPhone SE (375x667, DPR2, touch)
//   - iOS Safari UA
//   - 检查：加载/JS异常/console错误/失败请求/横向溢出/输入字号>=16px/tabbar触控目标>=40px/
//           today 添加计划交互/auth 未登录跳转/ai 页 visualViewport 兜底
import { webkit, devices } from 'playwright-core';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000/api';

const CSRF = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const email = `ios-${Date.now()}@example.com`;
const password = 'Sweep-Pass-123';
const reg = await fetch(`${API}/auth/register`, {
  method: 'POST', headers: CSRF,
  body: JSON.stringify({ email, nickname: 'IOS', password }),
});
const authUser = await reg.json();

const IPHONES = [devices['iPhone 14 Pro'], devices['iPhone SE (3rd gen)']];

// 注意：index.html / login.html 在已登录状态会自动跳转 workbench（pages/index.js 设计行为），
// 因此这两页仅在「未登录走查」分组中检查，跳过已登录扫描，避免把跳转后的 workbench 结果误记到它们名下。
const PAGES = [
  'workbench.html', 'workbench.html?view=course', 'workbench.html?view=manage', 'workbench.html?view=profile',
  'today.html', 'goals.html', 'stats.html', 'ai.html', 'agent-home.html',
];
const LOGGED_OUT_PAGES = ['index.html', 'login.html'];

const findings = [];
function record(kind, where, detail) {
  findings.push({ kind, where, detail });
  console.log(`  [${kind}] ${where} :: ${String(detail).slice(0, 240)}`);
}

const browser = await webkit.launch({ headless: true });

for (const device of IPHONES) {
  console.log(`\n===== ${device.viewport.width}x${device.viewport.height} (${device.userAgent.slice(0, 60)}...) =====`);

  // ---- 未登录页面走查（index/login：无 token 打开才是真实语义）----
  for (const path of LOGGED_OUT_PAGES) {
    const where = `${device.viewport.width}x${device.viewport.height} ${path} (logged-out)`;
    const context = await browser.newContext({ ...device, locale: 'zh-CN' });
    await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    const page = await context.newPage();
    page.on('pageerror', (err) => record('pageerror', where, err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') record('console', where, msg.text()); });
    page.on('response', (res) => { if (res.status() >= 400 && !res.url().includes('favicon')) record('http', where, `${res.status()} ${res.url()}`); });
    try {
      await page.goto(`${BASE}/${path}`, { waitUntil: 'load', timeout: 25000 });
      await page.waitForTimeout(1800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) record('overflow', where, `${overflow}px`);
      const smallInputs = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="time"], input[type="number"], textarea, select').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const size = parseFloat(cs.fontSize);
          if (size < 16) bad.push(`${el.tagName.toLowerCase()}#${el.id || el.name || '?'}=${size}px`);
        });
        return bad;
      });
      if (smallInputs.length) record('input-font<16', where, smallInputs.join(', '));
    } catch (err) {
      record('fatal', where, err.message);
    }
    await context.close();
  }

  // ---- 已登录页面走查 ----
  for (const path of PAGES) {
    const where = `${device.viewport.width}x${device.viewport.height} ${path}`;
    const context = await browser.newContext({ ...device, locale: 'zh-CN' });
    await context.addInitScript(([t, u]) => {
      localStorage.setItem('cg_token', t);
      localStorage.setItem('cg_user', JSON.stringify(u));
    }, [authUser.token, authUser.user]);
    await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    const page = await context.newPage();
    page.on('pageerror', (err) => record('pageerror', where, err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') record('console', where, msg.text()); });
    page.on('response', (res) => { if (res.status() >= 400 && !res.url().includes('favicon')) record('http', where, `${res.status()} ${res.url()}`); });
    try {
      await page.goto(`${BASE}/${path}`, { waitUntil: 'load', timeout: 25000 });
      await page.waitForTimeout(1800);

      // 横向溢出
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) record('overflow', where, `${overflow}px`);

      // iOS 契约 1：可见文本输入框字号 >= 16px（防聚焦缩放）
      const smallInputs = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="time"], input[type="number"], textarea, select').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const size = parseFloat(cs.fontSize);
          if (size < 16) bad.push(`${el.tagName.toLowerCase()}#${el.id || el.name || '?'}=${size}px`);
        });
        return bad;
      });
      if (smallInputs.length) record('input-font<16', where, smallInputs.join(', '));

      // iOS 契约 2：tabbar 触控目标 >= 40px（Phase 16）
      const smallTargets = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('.mobile-tabbar a').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height < 40 || r.width < 40) bad.push(`${el.getAttribute('data-nav')}:${Math.round(r.width)}x${Math.round(r.height)}`);
        });
        return bad;
      });
      if (smallTargets.length) record('touch-target<40', where, smallTargets.join(', '));

      const tag = path.split('?')[0].replace('.html', '');
      await page.screenshot({ path: `tmp-ios/${device.viewport.width}-${tag}.png` });
    } catch (err) {
      record('fatal', where, err.message);
    }
    await context.close();
  }

  // ---- iOS 契约 3：ai 页 visualViewport --vvh 兜底 ----
  {
    const context = await browser.newContext({ ...device, locale: 'zh-CN' });
    await context.addInitScript(([t, u]) => {
      localStorage.setItem('cg_token', t);
      localStorage.setItem('cg_user', JSON.stringify(u));
    }, [authUser.token, authUser.user]);
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/ai.html`, { waitUntil: 'load', timeout: 25000 });
      await page.waitForTimeout(1200);
      const hasVvh = await page.evaluate(() => {
        const inSheets = [...document.styleSheets].some((sheet) => {
          try { return [...sheet.cssRules].some((r) => r.cssText && r.cssText.includes('--vvh')); } catch (_) { return false; }
        });
        return inSheets || getComputedStyle(document.documentElement).getPropertyValue('--vvh').length > 0;
      });
      if (!hasVvh) record('ios-vh', `${device.viewport.width} ai.html`, '--vvh visualViewport fallback not found');
      else console.log(`  [ok] ai.html --vvh fallback present (${device.viewport.width})`);
    } catch (err) { record('fatal', `${device.viewport.width} ai.html`, err.message); }
    await context.close();
  }

  // ---- iOS 交互：today 页 touch 添加计划 ----
  {
    const context = await browser.newContext({ ...device, locale: 'zh-CN' });
    await context.addInitScript(([t, u]) => {
      localStorage.setItem('cg_token', t);
      localStorage.setItem('cg_user', JSON.stringify(u));
    }, [authUser.token, authUser.user]);
    await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    const page = await context.newPage();
    page.on('pageerror', (err) => record('pageerror', `${device.viewport.width} today-interaction`, err.message));
    try {
      await page.goto(`${BASE}/today.html`, { waitUntil: 'load', timeout: 25000 });
      await page.waitForSelector('#newTaskText', { timeout: 8000 });
      await page.tap('#newTaskText');
      await page.fill('#newTaskText', 'iOS 走查测试任务');
      await page.tap('#addTaskBtn');
      await page.waitForFunction(() => (document.querySelector('#statTotal') || {}).textContent === '1', null, { timeout: 6000 });
      console.log(`  [ok] today add-task works via touch (${device.viewport.width})`);
      // 完成勾选
      await page.tap('.tp-task-check');
      await page.waitForFunction(() => (document.querySelector('#statDone') || {}).textContent === '1', null, { timeout: 6000 });
      console.log(`  [ok] today task-check works via touch (${device.viewport.width})`);
    } catch (err) {
      record('interaction', `${device.viewport.width} today-interaction`, err.message);
    }
    await context.close();
  }

  // ---- iOS auth 跳转：未登录 → 登录 → 回跳 ----
  {
    const context = await browser.newContext({ ...device, locale: 'zh-CN' });
    await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/today.html`, { waitUntil: 'load', timeout: 25000 });
      await page.waitForURL(/index\.html\?auth=login&next=/, { timeout: 6000 });
      await page.waitForSelector('#modalLogin:not(.hidden)', { timeout: 6000 });
      await page.tap('#loginAccount');
      await page.fill('#loginAccount', email);
      await page.fill('#loginPwd', password);
      await page.tap('[data-action="doLogin"]');
      await page.waitForFunction(() => window.location.pathname.endsWith('/today.html'), null, { timeout: 10000 });
      console.log(`  [ok] auth redirect loop works via touch (${device.viewport.width})`);
    } catch (err) {
      record('auth', `${device.viewport.width} auth-redirect`, err.message);
    }
    await context.close();
  }
}

await browser.close();

console.log('\n===== summary =====');
const counts = {};
for (const f of findings) counts[f.kind] = (counts[f.kind] || 0) + 1;
console.log(`findings: ${JSON.stringify(counts)}`);
console.log('IOS WEBKIT AUDIT DONE');
