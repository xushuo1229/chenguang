/**
 * 晨光自律台 · 全屏加载动画（极速版）
 * ============================================================
 * 最小显示时间 0ms，淡入淡出仅 150ms，进度条 300ms 内完成。
 * 页面就绪后立即消失，不浪费任何时间。
 */
'use strict';

var CGLoader = (function () {
  var overlay = null;
  var progressFill = null;
  var isShowing = false;

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'cg-loader';
    overlay.innerHTML =
      '<div class="cg-loader-inner">' +
        '<div class="cg-loader-spinner">' +
          '<div class="cg-loader-ring"></div>' +
          '<div class="cg-loader-ring cg-loader-ring2"></div>' +
        '</div>' +
        '<div class="cg-loader-brand">☀ 晨光自律台</div>' +
        '<div class="cg-loader-progress"><div class="cg-loader-progress-fill"></div></div>' +
      '</div>';
    document.body.appendChild(overlay);
    progressFill = overlay.querySelector('.cg-loader-progress-fill');
  }

  function show() {
    createOverlay();
    if (isShowing) return;
    isShowing = true;
    if (progressFill) {
      progressFill.style.transition = 'none';
      progressFill.style.width = '0%';
    }
    overlay.style.transition = 'opacity 150ms ease';
    overlay.style.display = 'flex';
    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
    });
    // 快速进度
    if (progressFill) {
      setTimeout(function () {
        progressFill.style.transition = 'width 300ms cubic-bezier(0.22,1,0.36,1)';
        progressFill.style.width = '80%';
      }, 20);
    }
  }

  function hide() {
    if (!overlay || !isShowing) return;
    isShowing = false;
    // 直接拉满并淡出
    if (progressFill) {
      progressFill.style.transition = 'width 150ms ease';
      progressFill.style.width = '100%';
    }
    setTimeout(function () {
      overlay.style.opacity = '0';
      setTimeout(function () {
        overlay.style.display = 'none';
      }, 150);
    }, 100);
  }

  function init() {
    show();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.addEventListener('load', hide);
        setTimeout(hide, 800);
      });
    } else {
      window.addEventListener('load', hide);
      setTimeout(hide, 800);
    }
  }

  return { show: show, hide: hide, init: init };
})();

globalThis.CGLoader = CGLoader;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { CGLoader.init(); });
} else {
  CGLoader.init();
}
