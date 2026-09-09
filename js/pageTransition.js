/**
 * 晨光自律台 · 页面过渡动画（极速版）
 * ============================================================
 * 点击链接后立即跳转，不等待退出动画。
 * 页面加载用 CSS transition，进入动画 200ms 内完成。
 */
'use strict';

(function () {
  // 拦截链接点击，立即跳转（无延迟）
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
    if (href === '#' || href.startsWith('#')) return;

    var currentPath = window.location.pathname;
    var targetPath = new URL(href, window.location.origin).pathname;
    if (currentPath === targetPath) return;

    // 记录过渡方向
    var isNav = !!link.closest('.sidebar, .mobile-tabbar');
    try { sessionStorage.setItem('cg_transition', isNav ? 'slide' : 'fade'); } catch (_) {}

    // 显示加载动画并立即跳转
    if (globalThis.CGLoader) globalThis.CGLoader.show();
    window.location.href = href;
  });

  // 页面加载后播放进入动画
  function onReady() {
    var t = 'fade';
    try { t = sessionStorage.getItem('cg_transition') || 'fade'; } catch (_) {}
    document.body.setAttribute('data-transition', t);
    document.body.classList.add('page-enter');
    setTimeout(function () {
      document.body.classList.remove('page-enter');
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  // bfcache 恢复时也播放动画
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) onReady();
  });
})();
