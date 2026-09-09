/**
 * 晨光自律台 · 统一 Toast 提示 (ES Module)
 *
 * 什么是 Toast？
 * Toast 是一种轻量级的消息提示，通常出现在屏幕右上角。
 * 它不会打断用户的操作，几秒后自动消失。
 * 常见用途：操作成功提示、错误提示、警告提示等。
 *
 * 本模块实现了四种类型的 Toast：
 *   - success（成功）：绿色 ✓
 *   - error（错误）：红色 ✗
 *   - warn（警告）：黄色 ⚠
 *   - info（信息）：蓝色 ℹ
 *
 * 动画效果说明：
 *   - 出场动画：从右侧滑入（opacity 从 0→1，translateX 从 100px→0）
 *   - 退场动画：向右侧滑出（opacity 从 1→0，translateX 从 0→100px）
 *   - 使用 CSS transition 实现平滑过渡
 */
'use strict';

// ============================================================
// container 变量 - Toast 容器（单例模式）
// ============================================================
// 所有 Toast 消息都显示在这个容器里。
// 容器只需要创建一次，后续的 Toast 都往里面添加。
var container = null;

// ============================================================
// getContainer 函数 - 获取或创建 Toast 容器
// ============================================================
// 如果容器还没创建，就创建一个并添加到 body 中。
// 容器的样式说明：
//   - position: fixed  → 固定定位，不随页面滚动
//   - top: 20px; right: 20px  → 固定在右上角
//   - z-index: 10000  → 层级很高，确保显示在其他元素上面
//   - display: flex; flex-direction: column  → 纵向排列多个 Toast
//   - gap: 10px  → Toast 之间的间距
//   - pointer-events: none  → 容器本身不阻挡鼠标点击
function getContainer() {
  if (!container) {
    container = document.createElement('div');  // 创建一个空 div
    container.className = 'cg-toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(container);  // 添加到页面 body 中
  }
  return container;
}

// ============================================================
// getIcon 函数 - 根据类型返回对应图标
// ============================================================
// 每种 Toast 类型都有一个简洁的图标字符：
//   success → ✓（对勾）
//   error   → ✗（叉号）
//   warn    → ⚠（感叹号三角）
//   info    → ℹ（信息符号 i）
// 如果类型不认识，就用 info 作为默认
function getIcon(type) {
  var icons = { success: '✓', error: '✗', warn: '⚠', info: 'ℹ' };
  return icons[type] || icons.info;
}

// ============================================================
// getColor 函数 - 根据类型返回对应颜色
// ============================================================
// 每种类型使用不同的颜色，让用户一眼就能识别消息类型：
//   success → 绿色 (#10b981) — 操作成功
//   error   → 红色 (#ef4444) — 出错了
//   warn    → 黄色 (#f59e0b) — 需要注意
//   info    → 青色 (#06b6d4) — 普通信息
function getColor(type) {
  var colors = { success: '#10b981', error: '#ef4444', warn: '#f59e0b', info: '#06b6d4' };
  return colors[type] || colors.info;
}

// ============================================================
// esc 函数 - 转义 HTML 特殊字符（防 XSS 攻击）
// ============================================================
// 如果用户消息中包含 <script> 等标签，会被转义成安全字符，
// 防止恶意代码执行。
function esc(s) {
  if (typeof s !== 'string') return '';
  var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return s.replace(/[&<>"']/g, function (c) { return map[c]; });
}

// ============================================================
// toast 函数 - 显示一条 Toast 消息
// ============================================================
// 用法:
//   toast('保存成功')                    → 默认 info 类型，3秒后消失
//   toast('删除失败', 'error')           → 红色错误提示
//   toast('操作成功', 'success', 2000)   → 绿色成功提示，2秒后消失
//
// 动画流程（分 3 步）：
//   1. 先创建一个 opacity:0 + translateX(100px) 的元素（不可见，在右边外面）
//   2. 用 requestAnimationFrame 在下一帧把 opacity 设为 1、translateX 设为 0
//      （requestAnimationFrame 保证浏览器已完成渲染后再改样式，动画更流畅）
//   3. 等待 duration 毫秒后，把 opacity 设回 0、translateX 设回 100px
//   4. 再等 300ms（动画完成）后，把元素从 DOM 中移除，释放内存
//
// 参数：
//   msg      - 要显示的消息文本
//   type     - 类型：'success' | 'error' | 'warn' | 'info'（默认 'info'）
//   duration - 显示时长，单位毫秒（默认 3000ms = 3秒）
function toast(msg, type, duration) {
  if (type === undefined) type = 'info';
  if (duration === undefined) duration = 3000;
  var wrap = getContainer();
  // 创建 Toast 元素
  var el = document.createElement('div');
  // 初始状态：透明 + 位于右侧外面（translateX(100px)）
  // transition: all 0.3s ease 让样式变化有 0.3 秒的过渡动画
  el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 20px;background:rgba(255,255,255,0.95);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);border-left:4px solid ' + getColor(type) + ';opacity:0;transform:translateX(100px);transition:all 0.3s ease;min-width:200px;max-width:400px;pointer-events:auto;';
  // 内容：图标 + 消息文本（文本经过 esc 转义，防止 XSS）
  el.innerHTML = '<span style="color:' + getColor(type) + ';font-weight:bold;font-size:16px;">' + getIcon(type) + '</span><span style="color:#1e1e2a;font-size:14px;">' + esc(msg) + '</span>';
  wrap.appendChild(el);  // 添加到容器中

  // requestAnimationFrame：等浏览器渲染完这一帧后，再修改样式
  // 这样浏览器会从 "opacity:0, translateX:100px" 平滑过渡到 "opacity:1, translateX:0"
  requestAnimationFrame(function () {
    el.style.opacity = '1';
    el.style.transform = 'translateX(0)';
  });

  // 定时器：duration 毫秒后开始退场动画
  setTimeout(function () {
    el.style.opacity = '0';              // 淡出
    el.style.transform = 'translateX(100px)';  // 向右滑出
    // 等退场动画完成（300ms）后，从 DOM 中移除元素
    setTimeout(function () { el.remove(); }, 300);
  }, duration);
}

// ============================================================
// 全局注册
// ============================================================
globalThis.toast = toast;
globalThis.CGToast = { toast: toast };

// ES Module 导出
export { toast };
export default toast;
