/**
 * 晨光自律台 · 公共工具函数
 * ------------------------------------------------------------
 * 统一 toast、esc、$、todayStr 等重复实现
 */

/** HTML 转义 */
export function esc(s) {
  if (typeof s !== 'string') return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return s.replace(/[&<>"']/g, c => map[c]);
}

/** 今日日期 YYYY-MM-DD */
export function todayStr(d) {
  d = d || new Date();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

/** DOM 选择器 */
export function $(sel, root) {
  return (root || document).querySelector(sel);
}

export function $$(sel, root) {
  return Array.from((root || document).querySelectorAll(sel));
}

/** Toast 提示 */
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toasts';
    toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function getToastIcon(type) {
  const icons = { success: '✓', error: '✗', warn: '⚠', info: 'ℹ' };
  return icons[type] || icons.info;
}

function getToastColor(type) {
  const colors = { success: '#10b981', error: '#ef4444', warn: '#f59e0b', info: '#06b6d4' };
  return colors[type] || colors.info;
}

export function toast(msg, type = 'info') {
  const container = getToastContainer();
  const el = document.createElement('div');
  el.style.cssText = `
    display:flex;align-items:center;gap:8px;padding:12px 20px;
    background:rgba(255,255,255,0.95);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);
    border-left:4px solid ${getToastColor(type)};opacity:0;transform:translateX(100px);
    transition:all 0.3s ease;min-width:200px;max-width:400px;
  `;
  el.innerHTML = `
    <span style="color:${getToastColor(type)};font-weight:bold;font-size:16px;">${getToastIcon(type)}</span>
    <span style="color:#1e1e2a;font-size:14px;">${esc(msg)}</span>
  `;
  container.appendChild(el);
  
  // 动画显示
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(0)';
  });
  
  // 3秒后消失
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(100px)';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

/** 防抖函数 */
export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** 节流函数 */
export function throttle(fn, delay = 300) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/** 格式化数字（千位分隔） */
export function formatNumber(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}

/** 格式化日期为中文 */
export function formatDateCN(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
