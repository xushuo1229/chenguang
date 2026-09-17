(function () {
  function readAccountUser() {
    try {
      return JSON.parse(localStorage.getItem('cg_user') || 'null') || {};
    } catch (_) {
      return {};
    }
  }

  function displayName() {
    var storeUser = globalThis.CGStore && CGStore.getUser ? CGStore.getUser() : {};
    var accountUser = readAccountUser();
    return storeUser.name || accountUser.nickname || accountUser.name || '同学';
  }

  function render() {
    var name = displayName();
    var nameEl = document.getElementById('sidebarUserName');
    var avatarEl = document.getElementById('sidebarUserAvatar');
    if (nameEl && nameEl.textContent !== name) nameEl.textContent = name;
    var avatarText = name.charAt(0) || '同';
    if (avatarEl && avatarEl.textContent !== avatarText) avatarEl.textContent = avatarText;
  }

  function isTodayPage() {
    var page = String(location.pathname || '').split('/').pop() || '';
    return page.toLowerCase() === 'today.html';
  }

  document.addEventListener('DOMContentLoaded', function () {
    render();
    if (isTodayPage()) {
      import('./aiReflectionUI.js')
        .then(function (module) { module.mountTodayReflection(); })
        .catch(function (error) {
          console.warn('[TodayReflection] mount failed:', error && error.message ? error.message : error);
        });
    }
  });
  globalThis.addEventListener('chenguang:update', render);
  globalThis.cgRenderUserChrome = render;
})();
