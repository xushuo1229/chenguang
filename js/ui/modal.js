/**
 * Zeno · 统一 Modal 模态框 (ES Module)
 *
 * 什么是模态框（Modal）？
 * 模态框是一种覆盖在页面上方的弹出窗口，会阻止用户操作底层页面。
 * 常见用途：确认删除、登录表单、详细信息展示等。
 *
 * 本模块提供三个功能：
 *   - openModal(id)   → 打开指定 ID 的模态框
 *   - closeModal(id)  → 关闭指定 ID 的模态框
 *   - showConfirm()   → 显示一个确认对话框（带确定/取消按钮）
 *
 * showConfirm 的特殊之处：
 * 它返回一个 Promise，可以用 async/await 等待用户选择：
 *   const ok = await showConfirm('确定删除吗？');
 *   if (ok) { // 用户点了确定 }
 */
'use strict';

// ============================================================
// 弹窗打开时的背景滚动锁
// ============================================================
// 移动端弹窗背后页面仍可滚动（触摸拖动会穿透），打开时锁定 body 滚动，
// 关闭/全部关闭后恢复。以「当前打开中的弹窗数量」为准，支持嵌套打开。
function syncScrollLock() {
  var openCount = document.querySelectorAll('.modal-overlay.open:not(.hidden)').length;
  if (openCount > 0) {
    if (document.body.style.overflow !== 'hidden') {
      document.body.style.overflow = 'hidden';
      // 桌面端补偿滚动条宽度，防止锁定瞬间页面横向抖动（移动端无滚动条，不受影响）
      var sw = window.innerWidth - document.documentElement.clientWidth;
      if (sw > 0) document.body.style.paddingRight = sw + 'px';
    }
  } else {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}

// ============================================================
// openModal 函数 - 打开模态框
// ============================================================
// 用法: openModal('delete-confirm')
//
// 原理：
//   1. 根据 ID 找到模态框的 DOM 元素
//   2. 移除 'hidden' 类（hidden 类通常设置 display:none，隐藏元素）
//   3. 添加 'show' 类（show 类通常有淡入动画）
//   4. 焦点移入弹窗（无障碍），但避免聚焦输入框——移动端会立即弹出软键盘
//   5. 锁定背景滚动
//
// 参数：
//   id - 模态框元素的 HTML id 属性值
function openModal(id) {
  var modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('open');
    // 焦点移入弹窗：优先按钮等非输入元素（Phase 15：输入框自动聚焦会在移动端立即弹出键盘）
    var focusable = modal.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!focusable) {
      if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
      focusable = modal;
    }
    try { focusable.focus({ preventScroll: true }); } catch (_) { focusable.focus(); }
    syncScrollLock();
  }
}

// ============================================================
// closeModal 函数 - 关闭模态框
// ============================================================
// 用法: closeModal('delete-confirm')
//
// 与 openModal 相反：添加 'hidden' 类隐藏，移除 'open' 类结束动画。
//
// 参数：
//   id - 模态框元素的 HTML id 属性值
function closeModal(id) {
  var modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('open');
    // 焦点若还留在已关闭的弹窗里则归还给 body（隐藏元素无法持有焦点）
    if (modal.contains(document.activeElement)) {
      try { document.activeElement.blur(); } catch (_) {}
    }
    syncScrollLock();
  }
}

// ============================================================
// showConfirm 函数 - 显示确认对话框（基于 Promise）
// ============================================================
// 用法:
//   // 传统回调写法
//   showConfirm('确定要删除这个任务吗？').then(function(ok) {
//     if (ok) { deleteTask(); }
//   });
//
//   // async/await 写法（推荐）
//   async function handleDelete() {
//     const ok = await showConfirm('确定要删除这个任务吗？');
//     if (ok) { deleteTask(); }
//   }
//
// 返回值：一个 Promise
//   - 用户点"确定" → resolve(true)
//   - 用户点"取消" → resolve(false)
//   - 点击遮罩层   → resolve(false)
//   - 按 ESC 键    → resolve(false)
//
// 参数：
//   msg     - 要显示的提示消息
//   options - 可选的配置对象：
//     {
//       title: '确认操作',        // 标题文字
//       confirmText: '确定',      // 确定按钮文字
//       cancelText: '取消',       // 取消按钮文字
//       confirmColor: '#ef4444'   // 确定按钮颜色
//     }
function showConfirm(msg, options) {
  if (!options) options = {};
  // 返回一个 Promise，让用户可以等待用户的选择结果
  return new Promise(function (resolve) {
    // === 创建遮罩层（半透明黑色背景）===
    // position: fixed; inset: 0  → 覆盖整个屏幕
    // z-index: 10001  → 确保显示在最上层
    // background: rgba(0,0,0,0.4)  → 半透明黑色遮罩
    var overlay = document.createElement('div');
    overlay.className = 'cg-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);opacity:0;transition:opacity 0.2s ease;';

    // === 创建对话框卡片 ===
    // 白色背景、圆角、阴影，居中显示
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 40px rgba(0,0,0,0.2);transform:scale(0.9);transition:transform 0.2s ease;';

    // 从 options 中读取配置，如果没有就使用默认值
    var title = options.title || '确认操作';
    var confirmText = options.confirmText || '确定';
    var cancelText = options.cancelText || '取消';
    var confirmColor = options.confirmColor || '#ef4444';

    // === 组装对话框的 HTML 内容 ===
    // 结构：标题 + 提示消息 + 两个按钮（取消、确定）
    box.innerHTML = '<h3 style="margin:0 0 12px;font-size:18px;color:#1e1e2a;">' + title + '</h3>' +
      '<p style="margin:0 0 24px;font-size:14px;color:#5a5a6e;line-height:1.5;">' + msg + '</p>' +
      '<div style="display:flex;justify-content:flex-end;gap:12px;">' +
      '<button class="cg-confirm-cancel" style="padding:8px 20px;border:none;border-radius:8px;background:#f3f4f6;color:#374151;font-size:14px;cursor:pointer;transition:background 0.15s;">' + cancelText + '</button>' +
      '<button class="cg-confirm-ok" style="padding:8px 20px;border:none;border-radius:8px;background:' + confirmColor + ';color:#fff;font-size:14px;cursor:pointer;transition:background 0.15s;">' + confirmText + '</button>' +
      '</div>';

    overlay.appendChild(box);          // 把对话框放到遮罩层里
    document.body.appendChild(overlay);  // 把遮罩层添加到页面中

    // === 入场动画 ===
    // requestAnimationFrame 等浏览器渲染完这一帧后再改样式
    // 遮罩层从 opacity:0 渐变到 1（淡入）
    // 对话框从 scale(0.9) 放大到 scale(1)（缩放进入）
    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
      box.style.transform = 'scale(1)';
    });

    // === cleanup 函数 - 统一的退出逻辑 ===
    // 所有关闭对话框的操作（点按钮、点遮罩、按 ESC）都会调用这个函数
    // 参数 result：true（用户确认）或 false（用户取消）
    var cleanup = function (result) {
      // 退场动画：遮罩淡出 + 对话框缩小
      overlay.style.opacity = '0';
      box.style.transform = 'scale(0.9)';
      // 等动画完成（200ms）后，移除 DOM 元素并 resolve Promise
      setTimeout(function () {
        overlay.remove();       // 从 DOM 中移除，释放内存
        resolve(result);        // 把结果传给调用者
      }, 200);
    };

    // === 按钮点击事件 ===
    // 点"取消"按钮 → 传 false
    box.querySelector('.cg-confirm-cancel').onclick = function () { cleanup(false); };
    // 点"确定"按钮 → 传 true
    box.querySelector('.cg-confirm-ok').onclick = function () { cleanup(true); };

    // === 点击遮罩层关闭 ===
    // 只有点击遮罩层本身（不是对话框）才关闭
    overlay.onclick = function (e) {
      if (e.target === overlay) cleanup(false);
    };

    // === ESC 键关闭 ===
    // 监听键盘事件，按 ESC 键关闭对话框
    var onEsc = function (e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onEsc);  // 移除监听，防止内存泄漏
        cleanup(false);
      }
    };
    document.addEventListener('keydown', onEsc);
  });
}

// ============================================================
// 全局注册
// ============================================================
globalThis.openModal = openModal;
globalThis.closeModal = closeModal;
globalThis.showConfirm = showConfirm;
globalThis.CGModal = { openModal: openModal, closeModal: closeModal, showConfirm: showConfirm };

// ES Module 导出
export { openModal, closeModal, showConfirm };
export default { openModal: openModal, closeModal: closeModal, showConfirm: showConfirm };
