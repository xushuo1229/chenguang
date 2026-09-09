/**
 * ============================================================
 * 晨光自律台 · 全局认证守卫 + UI 工具
 * ------------------------------------------------------------
 * 功能:
 *   1. 路由守卫 — requireAuth() / redirectIfAuthed()
 *   2. 状态管理 — 监听 401 事件, token 过期自动跳转登录
 *   3. Toast 通知 — showToast(msg, type)
 *   4. 全局 Loading 遮罩 — bindLoadingOverlay()
 *
 * 依赖: js/api/ 下的 httpClient / authService
 * 用法 (在页面 <script type="module"> 中):
 *   import { requireAuth, showToast, bindLoadingOverlay } from './js/app/authGuard.js';
 *   requireAuth(); // 未登录自动跳转 login.html
 * ============================================================
 */
import http from '../api/httpClient.js';
import authService from '../api/authService.js';

/* ============================================================
   Toast 通知系统
   ============================================================ */
let _toastWrap = null;

function _ensureToastWrap() {
  if (_toastWrap) return _toastWrap;
  _toastWrap = document.querySelector('.toast-wrap');
  if (!_toastWrap) {
    _toastWrap = document.createElement('div');
    _toastWrap.className = 'toast-wrap';
    document.body.appendChild(_toastWrap);
  }
  return _toastWrap;
}

/**
 * 弹出 Toast 通知
 * @param {string} msg  - 消息内容
 * @param {'ok'|'err'|'info'} [type='ok'] - 类型
 * @param {number} [duration=2500] - 显示时长 ms
 */
function showToast(msg, type = 'ok', duration = 2500) {
  const wrap = _ensureToastWrap();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, duration);
}

/* ============================================================
   全局 Loading 遮罩 — 绑定 httpClient 的 loading 事件
   ============================================================ */
function bindLoadingOverlay() {
  // 创建遮罩 DOM (如果不存在)
  let overlay = document.querySelector('.global-loader');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'global-loader';
    overlay.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(overlay);
  }

  // 监听 httpClient 的 loading 事件
  window.addEventListener('loading:start', () => overlay.classList.add('show'));
  window.addEventListener('loading:end', () => overlay.classList.remove('show'));
}

/* ============================================================
   路由守卫
   ============================================================ */

/**
 * 要求已登录 — 未登录则跳转 login.html
 * 在受保护页面顶部调用
 * @param {string} [loginUrl='login.html'] - 登录页地址
 * @returns {boolean} 是否已登录
 */
function requireAuth(loginUrl = 'login.html') {
  if (authService.isAuthenticated()) return true;

  // 记录来源页面, 登录成功后可跳回
  const returnUrl = encodeURIComponent(window.location.pathname);
  window.location.href = `${loginUrl}?redirect=${returnUrl}`;
  return false;
}

/**
 * 已登录则跳转 — 用于 login/register 页面
 * 避免已登录用户重复访问登录页
 * @param {string} [targetUrl='dashboard.html'] - 目标页面
 */
function redirectIfAuthed(targetUrl = 'dashboard.html') {
  if (authService.isAuthenticated()) {
    // 检查 redirect 参数, 优先跳回来源页
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    window.location.href = redirect ? decodeURIComponent(redirect) : targetUrl;
  }
}

/**
 * 退出登录 — 清除认证信息并跳转登录页
 * @param {string} [loginUrl='login.html']
 */
function logoutAndRedirect(loginUrl = 'login.html') {
  authService.logout();
  showToast('已退出登录', 'info');
  setTimeout(() => {
    window.location.href = loginUrl;
  }, 500);
}

/* ============================================================
   401 全局监听 — token 过期自动跳转登录
   httpClient 在 401 时会调用 onUnauthorized 清空认证信息
   这里监听后续的 API 调用失败, 如果是 401 则跳转
   ============================================================ */
function setupAuthErrorHandler(loginUrl = 'login.html') {
  // 监听全局 unhandledrejection, 捕获 ApiError 401
  window.addEventListener('unhandledrejection', (e) => {
    const err = e.reason;
    if (err && err.isAuthError) {
      e.preventDefault(); // 阻止控制台报错
      showToast('登录已过期，请重新登录', 'err');
      setTimeout(() => {
        const returnUrl = encodeURIComponent(window.location.pathname);
        window.location.href = `${loginUrl}?redirect=${returnUrl}`;
      }, 800);
    }
  });
}

/* ============================================================
   工具函数
   ============================================================ */

/** 获取本地时区的 YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** 获取本月第一天的 YYYY-MM-DD */
function monthStartStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(first.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** 转义 HTML, 防止 XSS */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export {
  // 路由守卫
  requireAuth,
  redirectIfAuthed,
  logoutAndRedirect,
  setupAuthErrorHandler,
  // UI 工具
  showToast,
  bindLoadingOverlay,
  // 工具函数
  todayStr,
  monthStartStr,
  esc,
  // 重新导出 authService 供页面直接使用
  authService,
  http,
};
