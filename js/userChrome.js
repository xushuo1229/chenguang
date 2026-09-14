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
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name.charAt(0) || '同';
  }

  document.addEventListener('DOMContentLoaded', render);
  globalThis.addEventListener('chenguang:update', render);
  globalThis.cgRenderUserChrome = render;
})();
