/**
 * 晨光自律台 · 落地页入口 (ES Module)
 *
 * 这是网站的首页（落地页），用户在这里：
 *   - 浏览网站介绍（滚动动画效果）
 *   - 登录或注册账号
 *   - 如果已登录，自动跳转到工作台
 *
 * 页面结构：
 *   - 顶部导航栏（固定定位，点击平滑滚动到对应区域）
 *   - Hero 区域（大标题 + 登录/注册按钮）
 *   - Solution 区域（功能介绍）
 *   - Results 区域（使用效果展示）
 *   - Why 区域（为什么选择我们）
 *   - 登录弹窗 / 注册弹窗
 */
import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/ui/modal.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';
import Analytics from '../js/analytics.js';

'use strict';

// init() 是页面的主初始化函数，包含所有交互逻辑
function init() {
  // ==================== 模态弹窗全局事件 ====================
  // 点击弹窗外部遮罩层或按 Esc 键，关闭所有弹窗
  // 使用事件委托：在 document 上统一监听
  document.addEventListener('click', function (e) {
    // 如果点击的是 data-close-modal 属性的元素（如关闭按钮），关闭对应弹窗
    if (e.target.matches('[data-close-modal]')) closeModal(e.target.getAttribute('data-close-modal'));
    // 如果点击的是弹窗遮罩层（modal-overlay），关闭该弹窗（走统一 closeModal：移除 open 类 + 解除滚动锁）
    else if (e.target.classList && e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
    // 点击「服务条款」或「隐私政策」链接时，显示提示信息
    else if (e.target.id === 'openTerms' || e.target.id === 'openPrivacy') {
      e.preventDefault();
      toast(e.target.id === 'openTerms'
        ? '《服务条款》：本工具仅用于个人自律记录，请勿用于任何违法违规用途。'
        : '《隐私政策》：数据默认本地存储，你可以随时在「管理」中清除或导出。', 'info');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $$('.modal-overlay').forEach(function (m) { closeModal(m.id); });
  });

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

  // ==================== 顶部导航栏平滑滚动 ====================
  // 点击导航栏链接时，平滑滚动到页面对应区域
  // 比如点击「功能介绍」，页面平滑滚动到 Solution 区域
  var navs = $$('[data-nav]');
  var sections = ['home', 'solution', 'results', 'why'].map(function (id) { return document.getElementById(id); }).filter(Boolean);

  function setActive(id) {
    navs.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      a.classList.toggle('active', href === '#' + id);
    });
  }
  navs.forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#' && href.length > 1) {
        e.preventDefault();
        var target = document.getElementById(href.slice(1));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          try { history.replaceState(null, '', href); } catch (_) {}
          setActive(href.slice(1));
        }
      }
    });
  });

  // ==================== 滚动动画（IntersectionObserver） ====================
  // IntersectionObserver 是浏览器 API，用于监听元素是否进入/离开可视区域
  // 当某个区域（如 Solution）滚动到屏幕 30% 以上时，自动高亮导航栏对应链接
  // 这样用户滚动页面时，导航栏会自动跟随高亮
  if ('IntersectionObserver' in window && sections.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio >= 0.3) setActive(en.target.id); });
    }, { threshold: [0.3, 0.6] });
    sections.forEach(function (sec) { io.observe(sec); });
  }

  // ==================== 登录功能 ====================
  // doLogin() 处理用户登录：
  //   1. 先验证输入（邮箱格式、密码长度等）
  //   2. 调用后端 API 登录（后端只支持邮箱登录）
  //   3. 后端不可达时明确报错，绝不伪造本地登录态
  //   4. 登录成功后跳转到工作台页面
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
      closeModal('modalLogin');
      toast('欢迎回来，' + displayName + ' 👋', 'success');
      setTimeout(function () { window.location.href = window.REDIRECT_AFTER_LOGIN; }, 500);
    } catch (err) {
      if (err.status === 401 || err.status === 400) {
        toast('登录失败：' + err.message, 'error');
        return;
      }
      // 后端不可达/网络异常：如实告知，不产生任何本地身份
      toast('当前无法连接服务器，请检查网络或稍后再试。', 'error');
    }
  }
  window.doLogin = doLogin;
  ['loginAccount', 'loginPwd'].forEach(function (id) {
    var el = document.getElementById(id);
    el && el.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  });

  function syncUserToStore(account, email, isEmail) {
    if (!window.CGStore) return;
    var startDate = new Date().toISOString().slice(0, 10);
    CGStore.setUser({
      name: account,
      startDate: startDate,
      totalDays: 1,
      continuousDays: 0
    });
  }

  // ==================== 注册功能 ====================
  // doRegister() 处理新用户注册：
  //   1. 验证用户名（2-16 位，中文/英文/数字/下划线）
  //   2. 验证邮箱格式
  //   3. 验证密码（与后端规则一致：8-32 位，含大小写字母和数字）
  //   4. 勾选服务条款
  //   5. 调用后端 API 注册；后端不可达时明确报错，绝不伪造本地账号
  async function doRegister() {
    var username = ($('#regUsername').value || '').trim();
    var email = ($('#regEmail').value || '').trim();
    var pwd = $('#regPwd').value || '';
    var pwd2 = $('#regPwd2').value || '';
    var terms = !!$('#regTerms').checked;
    var ok = true;

    markErr('regUsername', false, 'hintRegUsername', '例如：自律王同学');
    markErr('regEmail', false, 'hintRegEmail');
    markErr('regPwd', false, 'hintRegPwd');
    markErr('regPwd2', false, 'hintRegPwd2');
    setFieldHint('hintRegTerms', '', false);

    var unOk = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,16}$/.test(username);
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
      var res = await CGAPI.auth.register(username, email, pwd);
      closeModal('modalRegister');
      if (window.CGStore) {
        CGStore.clearNewUserData();
        syncUserToStore(username, email, false);
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
  window.doRegister = doRegister;
  ['regUsername', 'regEmail', 'regPwd', 'regPwd2'].forEach(function (id) {
    var el = document.getElementById(id);
    el && el.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
  });

  // ==================== 通用按钮事件处理 ====================
  // handleAction() 根据按钮的 data-action 属性执行对应操作
  // 这是一种常见的「声明式」事件处理：HTML 写 data-action="login"，JS 就执行登录
  function handleAction(e) {
    var a = e.currentTarget.getAttribute('data-action');
    if (a === 'login') { openModal('modalLogin'); }
    else if (a === 'register') { openModal('modalRegister'); }
    else if (a === 'goRegister') { closeModal('modalLogin'); openModal('modalRegister'); }
    else if (a === 'goLogin') { closeModal('modalRegister'); openModal('modalLogin'); }
    else if (a === 'doLogin') { doLogin(); }
    else if (a === 'doRegister') { doRegister(); }
  }
  $$('[data-action]').forEach(function (btn) { btn.addEventListener('click', handleAction); });

  // ==================== 自动登录检测 ====================
  // 页面加载时检查是否已有登录令牌（cg_token）
  // 如果有，说明用户之前登录过，自动跳转到工作台
  // 如果没有，显示欢迎提示
  try {
    var t = localStorage.getItem('cg_token');
    if (t) {
      toast('检测到登录态，正在进入工作台…', 'info');
      setTimeout(function () { window.location.href = window.REDIRECT_AFTER_LOGIN; }, 700);
    } else {
      setTimeout(function () { toast('👋 欢迎来到晨光自律台！', 'info'); }, 500);
    }
  } catch (_) {}
}

// safeInit() 安全初始化：用 try-catch 包裹 init()，防止初始化错误导致页面崩溃
function safeInit() { try { init(); } catch (err) { console.error('[index] init error', err); } }
// DOM 加载时机判断：如果 HTML 还没解析完，等 DOMContentLoaded 事件；否则直接执行
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit); else safeInit();

// ==================== Service Worker 注册 ====================
// 注册 Service Worker 用于离线缓存，让用户在网络不好时也能访问页面
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').catch(function (e) {
      console.warn('[SW] 注册失败:', e);
    });
  });
}

// 登录/注册成功后跳转的目标页面
window.REDIRECT_AFTER_LOGIN = 'workbench.html';

// ==================== 数字计数动画 ====================
$$('.hero-stats-item .num').forEach(function(el) {
  var text = el.textContent;
  var match = text.match(/^([\d,]+)/);
  if (!match) return;
  var target = parseInt(match[1].replace(/,/g, ''), 10);
  var suffix = text.replace(match[1], '');
  var duration = 1500;
  var start = performance.now();
  function update(now) {
    var progress = Math.min((now - start) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
});

// ==================== 功能卡片数据初始化 ====================
// Phase 10 Unified Analytics：各卡片数据口径统一走 js/analytics.js，
// 单次快照 → 多个结果，纯读不改写；避免首页与 Stats/工作台结果互不相同。
function initFeatureCards() {
  var store = window.CGStore;
  if (!store) return;
  try {
    var snap = Analytics.snapshot();
    var data = snap;
    var today = todayStr();
    var daily = Analytics.getDailySummary(today, snap);
    var week7 = Analytics.lastNDays(7);

    var sports = data.sports || [];
    var sportsEl = document.querySelector('[data-feature="sports"]');
    if (sportsEl) {
      sportsEl.querySelector('.feature-count').textContent = sports.length + ' 条';
      var weeklySports = Analytics.getExerciseSummary(week7[0], week7[1], snap).count;
      var todayMinutes = daily ? daily.sports.durationMinutes : 0;
      sportsEl.querySelector('.weekly-count').textContent = weeklySports;
      sportsEl.querySelector('.today-count').textContent = todayMinutes;
    }
    var courses = data.courses || [];
    var coursesEl = document.querySelector('[data-feature="courses"]');
    if (coursesEl) {
      coursesEl.querySelector('.feature-count').textContent = courses.length + ' 门';
      var lib = Analytics.getCompletionRate('course', null, null, snap);
      coursesEl.querySelector('.avg-progress').textContent = lib.avgProgress;
      coursesEl.querySelector('.done-count').textContent = lib.done;
    }
    var readings = data.readings || [];
    var readingsEl = document.querySelector('[data-feature="readings"]');
    if (readingsEl) {
      readingsEl.querySelector('.feature-count').textContent = readings.length + ' 本';
      var totalPages = readings.reduce(function(s, r) { return s + (r.pages || 0); }, 0);
      var finished = readings.filter(function(r) { return r.totalPages > 0 && r.pages >= r.totalPages; }).length;
      readingsEl.querySelector('.total-pages').textContent = totalPages;
      readingsEl.querySelector('.finished-count').textContent = finished;
    }
    var english = data.english || [];
    var englishEl = document.querySelector('[data-feature="english"]');
    if (englishEl) {
      englishEl.querySelector('.feature-count').textContent = english.length + ' 天';
      var todayWords = daily ? daily.study.words : 0;
      var todayMin = daily ? daily.study.englishMinutes : 0;
      englishEl.querySelector('.today-words').textContent = todayWords;
      englishEl.querySelector('.today-minutes').textContent = todayMin;
    }
    var focus = data.focus || [];
    var focusEl = document.querySelector('[data-feature="focus"]');
    if (focusEl) {
      focusEl.querySelector('.feature-count').textContent = focus.length + ' 次';
      var totalFocus = focus.reduce(function(s, f) { return s + (f.minutes || 0); }, 0);
      var todayFocus = daily ? daily.focus.minutes : 0;
      focusEl.querySelector('.total-focus').textContent = totalFocus;
      focusEl.querySelector('.today-focus').textContent = todayFocus;
    }
    var checkins = data.checkins || [];
    var checkinsEl = document.querySelector('[data-feature="checkins"]');
    if (checkinsEl) {
      checkinsEl.querySelector('.feature-count').textContent = checkins.length + ' 天';
      // 连续打卡统一用 Analytics（与 Stats 页口径一致：最长连续）
      var streaks = Analytics.getStreaks(snap);
      checkinsEl.querySelector('.max-streak').textContent = streaks.longestStreak;
      checkinsEl.querySelector('.total-checkins').textContent = checkins.filter(function(c) { return c.status === 'done'; }).length;
    }
  } catch (e) { console.warn('[feature] 数据加载失败', e); }

  $$('.feature-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var feature = card.getAttribute('data-feature');
      var names = { sports: '每日运动', courses: '课程学习', readings: '每日阅读', english: '英语学习', focus: '深度专注', checkins: '打卡统计' };
      toast('正在进入' + (names[feature] || feature) + '模块...', 'info');
      setTimeout(function() { window.location.href = 'workbench.html'; }, 600);
    });
    var actionBtn = card.querySelector('.feature-action');
    if (actionBtn) {
      actionBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var feature = card.getAttribute('data-feature');
        var names = { sports: '每日运动', courses: '课程学习', readings: '每日阅读', english: '英语学习', focus: '深度专注', checkins: '打卡统计' };
        toast('正在打开' + (names[feature] || feature) + '功能...', 'success');
        setTimeout(function() { window.location.href = 'workbench.html'; }, 600);
      });
    }
  });
}

// ==================== 滚动入场动画 ====================
if ('IntersectionObserver' in window) {
  var revealObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) { if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.15 });
  $$('.reveal').forEach(function(el) { revealObserver.observe(el); });
} else {
  $$('.reveal').forEach(function(el) { el.classList.add('visible'); });
}

// ==================== 导航栏滚动效果 ====================
var topbar = document.querySelector('.topbar');
if (topbar) window.addEventListener('scroll', function() { topbar.classList.toggle('scrolled', window.scrollY > 20); });

// ==================== DOMContentLoaded ====================
document.addEventListener('DOMContentLoaded', function() {
  initFeatureCards();
});
