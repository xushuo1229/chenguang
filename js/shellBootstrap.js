/**
 * 知行 · Shell Bootstrap
 * 只在首帧前读取既有登录用户镜像并稳定页面壳，不读取业务数据、不触发网络。
 */
(function () {
  'use strict';

  function readAccountUser() {
    try {
      return JSON.parse(localStorage.getItem('cg_user') || 'null') || {};
    } catch (_) {
      return {};
    }
  }

  function displayName() {
    var user = readAccountUser();
    return user.nickname || user.name || '同学';
  }

  function setShellText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function pad2(value) {
    return ('0' + value).slice(-2);
  }

  function toDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formatDateCN(date) {
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
  }

  function offsetDate(date, days) {
    var next = toDate(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function weekLabel() {
    var today = toDate(new Date());
    var weekday = (today.getDay() + 6) % 7;
    var monday = offsetDate(today, -weekday);
    var sunday = offsetDate(monday, 6);
    return '本周 · ' + formatDateCN(monday) + ' – ' + formatDateCN(sunday);
  }

  function renderShell() {
    var name = displayName();
    setShellText(document.getElementById('sidebarUserName'), name);
    setShellText(document.getElementById('sidebarUserAvatar'), name.charAt(0) || '同');

    var welcomeName = document.getElementById('welcomeName');
    if (welcomeName) {
      var isWorkbench = !!document.getElementById('greetWord');
      setShellText(welcomeName, isWorkbench ? name : (name ? '· ' + name : ''));
    }

    var rangeLabel = document.getElementById('rangeLabel');
    if (rangeLabel) setShellText(rangeLabel, weekLabel());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderShell);
  } else {
    renderShell();
  }

  globalThis.cgShellBootstrap = { render: renderShell };
})();
