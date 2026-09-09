/**
 * 晨光自律台 · 按钮涟漪效果
 * ============================================================
 * 点击按钮时在点击位置生成扩散涟漪。
 */
'use strict';

(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn, button, [role="button"]');
    if (!btn) return;
    if (btn.classList.contains('nav-item') || btn.classList.contains('mobile-tabbar a')) return;

    var ripple = document.createElement('span');
    ripple.className = 'ripple';
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 2;
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    setTimeout(function () { ripple.remove(); }, 600);
  });
})();
