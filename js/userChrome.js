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

  function revealChrome() {
    document.documentElement.classList.remove('app-booting');
  }

  function revealAfterChromeIsReady() {
    var timeoutId = setTimeout(revealChrome, 200);
    document.fonts.load('900 1em "Font Awesome 6 Free"').finally(function () {
      clearTimeout(timeoutId);
      revealChrome();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    render();
    revealAfterChromeIsReady();
  });
  globalThis.addEventListener('chenguang:update', render);
  globalThis.cgRenderUserChrome = render;
})();
