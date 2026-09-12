/**
 * 晨光自律台 · 登录页入口 (ES Module)
 *
 * 独立登录页（login.html），桌面端左右分栏：左品牌 + 右表单。
 * 与首页弹窗登录共用同一套后端流程（CGAPI.auth.login / register）：
 *   - 登录：校验 → 后端登录 → CGSync.afterLogin() → 跳转工作台
 *   - 注册：校验（与后端规则一致）→ 后端注册 → 初始化本地数据 → 跳转工作台
 *   - 已持有 cg_token 时自动进入工作台
 * 后端不可达时明确报错，绝不伪造本地登录态。
 */
import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';

'use strict';

// 登录/注册成功后跳转的目标页面
window.REDIRECT_AFTER_LOGIN = 'workbench.html';

function setFieldHint(id, msg, isErr) {
  var h = document.getElementById(id); if (!h) return;
  h.textContent = msg || '';
  h.classList.toggle('err', !!isErr);
}
function markErr(inputId, on, hintId, hintMsg) {
  var i = document.getElementById(inputId);
  if (i) i.classList.toggle('err', !!on);
  if (hintId) setFieldHint(hintId, on ? (hintMsg || '') : '', on);
}

// ==================== 视图切换（登录 / 注册） ====================
function showView(mode) {
  var login = document.getElementById('loginView');
  var register = document.getElementById('registerView');
  if (!login || !register) return;
  var isReg = mode === 'register';
  login.style.display = isReg ? 'none' : '';
  register.style.display = isReg ? '' : 'none';
  document.title = (isReg ? '注册' : '登录') + ' · 晨光自律台';
  try { history.replaceState(null, '', isReg ? '?mode=register' : location.pathname); } catch (_) {}
}

// ==================== 登录 ====================
async function doLogin() {
  var accountEl = $('#loginAccount');
  var pwdEl = $('#loginPwd');
  var account = (accountEl.value || '').trim();
  var pwd = (pwdEl.value || '');
  var ok = true;

  markErr('loginAccount', false, 'hintLoginAccount');
  markErr('loginPwd', false, 'hintLoginPwd');

  if (!account) { markErr('loginAccount', true, 'hintLoginAccount', '请输入邮箱'); ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) { markErr('loginAccount', true, 'hintLoginAccount', '请输入注册时使用的邮箱'); ok = false; }
  else if (account.length > 64) { markErr('loginAccount', true, 'hintLoginAccount', '账号太长了，最多 64 个字符'); ok = false; }

  if (!pwd) { markErr('loginPwd', true, 'hintLoginPwd', '请输入密码'); ok = false; }
  else if (pwd.length < 4) { markErr('loginPwd', true, 'hintLoginPwd', '密码至少 4 位'); ok = false; }

  if (!ok) return;

  var btn = $('#btnDoLogin');
  var oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '登录中…'; }

  try {
    var res = await CGAPI.auth.login(account, pwd);
    if ($('#rememberMe').checked) localStorage.setItem('cg_remember', '1'); else localStorage.removeItem('cg_remember');
    try { if (window.CGSync) await window.CGSync.afterLogin(); } catch (_) {}
    var displayName = (res.user && (res.user.nickname || res.user.email)) || account;
    try {
      if (window.CGStore && !CGStore.getUser().name) {
        CGStore.setUser({
          name: displayName,
          startDate: CGStore.getUser().startDate || new Date().toISOString().slice(0, 10)
        });
      }
    } catch (_) {}
    toast('欢迎回来，' + displayName + ' 👋', 'success');
    setTimeout(function () { window.location.href = window.REDIRECT_AFTER_LOGIN; }, 500);
  } catch (err) {
    if (err.status === 401 || err.status === 400) {
      toast('登录失败：' + err.message, 'error');
      return;
    }
    // 后端不可达/网络异常：如实告知，不产生任何本地身份
    toast('当前无法连接服务器，请检查网络或稍后再试。', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

// ==================== 注册 ====================
function syncUserToStore(account) {
  if (!window.CGStore) return;
  CGStore.setUser({
    name: account,
    startDate: new Date().toISOString().slice(0, 10),
    totalDays: 1,
    continuousDays: 0
  });
}

async function doRegister() {
  var username = ($('#regUsername').value || '').trim();
  var email = ($('#regEmail').value || '').trim();
  var pwd = $('#regPwd').value || '';
  var pwd2 = $('#regPwd2').value || '';
  var terms = !!$('#regTerms').checked;
  var ok = true;

  markErr('regUsername', false, 'hintRegUsername', '登录与展示昵称，例如：自律王同学');
  markErr('regEmail', false, 'hintRegEmail', '用于找回密码');
  markErr('regPwd', false, 'hintRegPwd');
  markErr('regPwd2', false, 'hintRegPwd2');
  setFieldHint('hintRegTerms', '', false);

  var unOk = /^[一-龥A-Za-z0-9_]{2,16}$/.test(username);
  if (!username) { markErr('regUsername', true, 'hintRegUsername', '请输入用户名'); ok = false; }
  else if (!unOk) { markErr('regUsername', true, 'hintRegUsername', '用户名 2-16 位，只能包含中文 / 英文 / 数字 / 下划线'); ok = false; }

  var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!email) { markErr('regEmail', true, 'hintRegEmail', '请输入邮箱'); ok = false; }
  else if (!emailOk) { markErr('regEmail', true, 'hintRegEmail', '邮箱格式不正确'); ok = false; }

  if (!pwd) { markErr('regPwd', true, 'hintRegPwd', '请输入密码'); ok = false; }
  else if (pwd.length < 8) { markErr('regPwd', true, 'hintRegPwd', '密码至少 8 位'); ok = false; }
  else if (pwd.length > 32) { markErr('regPwd', true, 'hintRegPwd', '密码最多 32 位'); ok = false; }
  else if (!(/[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd))) {
    markErr('regPwd', true, 'hintRegPwd', '密码需包含大写字母、小写字母和数字'); ok = false;
  }

  if (!pwd2) { markErr('regPwd2', true, 'hintRegPwd2', '请再次输入密码'); ok = false; }
  else if (pwd !== pwd2) { markErr('regPwd2', true, 'hintRegPwd2', '两次输入的密码不一致，请检查'); ok = false; }

  if (!terms) { setFieldHint('hintRegTerms', '请先勾选同意《服务条款》与《隐私政策》', true); ok = false; }

  if (!ok) return;

  var btn = $('#btnDoRegister');
  var oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '注册中…'; }

  try {
    await CGAPI.auth.register(username, email, pwd);
    if (window.CGStore) {
      CGStore.clearNewUserData();
      syncUserToStore(username);
    }
    try { if (window.CGSync) await window.CGSync.afterRegister(); } catch (_) {}
    toast('🎉 注册成功，欢迎加入晨光自律台！正在进入工作台…', 'success');
    setTimeout(function () { window.location.href = window.REDIRECT_AFTER_LOGIN; }, 650);
  } catch (err) {
    if (err.status === 409 || err.status === 400) {
      toast('注册失败：' + err.message, 'error');
      return;
    }
    // 后端不可达/网络异常：如实告知，不产生任何本地身份
    toast('当前无法连接服务器，请检查网络或稍后再试。', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

// ==================== 事件绑定 ====================
function init() {
  // 视图切换 + 提交动作
  $$('[data-action]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var a = el.getAttribute('data-action');
      if (a === 'doLogin') doLogin();
      else if (a === 'doRegister') doRegister();
      else if (a === 'goRegister') showView('register');
      else if (a === 'goLogin') showView('login');
    });
  });

  // 回车提交
  ['loginAccount', 'loginPwd'].forEach(function (id) {
    var el = document.getElementById(id);
    el && el.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  });
  ['regUsername', 'regEmail', 'regPwd', 'regPwd2'].forEach(function (id) {
    var el = document.getElementById(id);
    el && el.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
  });

  // 条款 / 隐私提示（说明性文案，textContent 渲染）
  var openTerms = document.getElementById('openTerms');
  var openPrivacy = document.getElementById('openPrivacy');
  if (openTerms) openTerms.addEventListener('click', function (e) {
    e.preventDefault();
    toast('《服务条款》：本工具仅用于个人自律记录，请勿用于任何违法违规用途。', 'info');
  });
  if (openPrivacy) openPrivacy.addEventListener('click', function (e) {
    e.preventDefault();
    toast('《隐私政策》：数据默认本地存储，你可以随时在「管理」中清除或导出。', 'info');
  });

  // 初始视图：?mode=register 直达注册
  try {
    var mode = new URLSearchParams(location.search).get('mode');
    showView(mode === 'register' ? 'register' : 'login');
  } catch (_) { showView('login'); }

  // 自动登录检测：已有令牌直接进入工作台
  try {
    var t = localStorage.getItem('cg_token');
    if (t) {
      toast('检测到登录态，正在进入工作台…', 'info');
      setTimeout(function () { window.location.href = window.REDIRECT_AFTER_LOGIN; }, 700);
    }
  } catch (_) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

// Service Worker：离线缓存（与首页一致）
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').catch(function (e) {
      console.warn('[SW] 注册失败:', e);
    });
  });
}
