/**
 * ============================================================
 * 智能 · 为进化而生 — 落地页主脚本 (main.js)
 * ------------------------------------------------------------
 * 1. 认证状态管理 (登录/登出/用户信息)
 * 2. 登录弹窗 (调用 authService.login)
 * 3. 用户下拉菜单 (进入工作台/数据统计/退出)
 * 4. CTA 按钮 (根据登录态跳转注册或工作台)
 * 5. 移动端菜单切换
 * 6. 统计数字 count-up 动画
 * 7. Logo 加载失败兜底
 * ============================================================ */
import authService from './js/api/authService.js';
import {
  showToast,
  bindLoadingOverlay,
  setupAuthErrorHandler,
} from './js/app/authGuard.js';

(function () {
  'use strict';

  // ============================================================
  // 元素引用
  // ============================================================
  const $ = (sel) => document.querySelector(sel);

  const signInBtn = $('#signInBtn');
  const userChip = $('#userChip');
  const userAvatar = $('#userAvatar');
  const userName = $('#userName');
  const userMenu = $('#userMenu');
  const ctaBtn = $('#ctaBtn');

  const authModal = $('#authModal');
  const loginForm = $('#loginForm');
  const loginEmail = $('#loginEmail');
  const loginPassword = $('#loginPassword');
  const loginError = $('#loginError');
  const loginSubmit = $('#loginSubmit');

  const mobileSignInBtn = $('#mobileSignInBtn');
  const mobileDashboardBtn = $('#mobileDashboardBtn');
  const burger = $('.burger');
  const overlay = $('#overlay');
  const menu = $('#mobileMenu');

  const goDashboard = $('#goDashboard');
  const goStats = $('#goStats');
  const logoutBtn = $('#logoutBtn');

  // ============================================================
  // 初始化
  // ============================================================
  setupAuthErrorHandler();
  bindLoadingOverlay();
  updateAuthUI();
  handleLogoFallback();

  // ============================================================
  // 1) 认证状态 → UI 更新
  // ============================================================
  function updateAuthUI() {
    const user = authService.getLocalUser();
    const isAuthed = authService.isAuthenticated();

    // 桌面端
    if (signInBtn) signInBtn.hidden = isAuthed;
    if (userChip) userChip.hidden = !isAuthed;

    if (isAuthed && user) {
      const name = user.nickname || user.email?.split('@')[0] || '用户';
      if (userName) userName.textContent = name;
      if (userAvatar) {
        const initial = name.charAt(0).toUpperCase();
        userAvatar.textContent = initial;
      }
    }

    // 移动端
    if (mobileSignInBtn) mobileSignInBtn.hidden = isAuthed;
    if (mobileDashboardBtn) mobileDashboardBtn.hidden = !isAuthed;

    // CTA 文案
    if (ctaBtn) ctaBtn.textContent = isAuthed ? '进入工作台' : '立即开始';
  }

  // ============================================================
  // 2) 登录弹窗
  // ============================================================
  function openLoginModal() {
    if (!authModal) return;
    authModal.hidden = false;
    closeMobileMenu();
    // 自动聚焦邮箱
    setTimeout(() => loginEmail?.focus(), 100);
  }

  function closeLoginModal() {
    if (!authModal) return;
    authModal.hidden = true;
    loginForm?.reset();
    if (loginError) loginError.hidden = true;
    setLoginLoading(false);
  }

  function setLoginLoading(loading) {
    if (!loginSubmit) return;
    loginSubmit.disabled = loading;
    loginSubmit.querySelector('.btn-text').hidden = loading;
    loginSubmit.querySelector('.btn-spinner').hidden = !loading;
  }

  function showLoginError(msg) {
    if (!loginError) return;
    loginError.textContent = msg;
    loginError.hidden = false;
    // 触发抖动动画
    loginError.style.animation = 'none';
    void loginError.offsetWidth;
    loginError.style.animation = '';
  }

  // 登录按钮 → 打开弹窗
  signInBtn?.addEventListener('click', openLoginModal);
  mobileSignInBtn?.addEventListener('click', openLoginModal);

  // 关闭弹窗
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeLoginModal);
  });
  // Escape 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authModal && !authModal.hidden) closeLoginModal();
  });

  // ============================================================
  // 3) 登录表单提交
  // ============================================================
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.hidden = true;

    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    // 前端校验
    if (!email || !password) {
      showLoginError('请填写邮箱和密码');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showLoginError('邮箱格式不正确');
      return;
    }
    if (password.length < 6) {
      showLoginError('密码至少 6 位');
      return;
    }

    setLoginLoading(true);
    try {
      const user = await authService.login(email, password);
      updateAuthUI();
      showToast(`欢迎回来，${user.nickname || '同学'}！`, 'ok');
      closeLoginModal();
      // 登录成功后稍作停留再跳转工作台
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);
    } catch (err) {
      const msg = err?.isNetworkError
        ? '网络连接失败，请确认后端服务已启动 (localhost:3000)'
        : err?.message || '登录失败，请检查邮箱和密码';
      showLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  });

  // ============================================================
  // 4) 用户下拉菜单
  // ============================================================
  function toggleUserMenu(force) {
    if (!userMenu) return;
    const isOpen = force ?? userMenu.hidden;
    userMenu.hidden = !isOpen;
  }

  userChip?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUserMenu();
  });
  // 点击外部关闭
  document.addEventListener('click', (e) => {
    if (userMenu && !userMenu.hidden) {
      if (!userMenu.contains(e.target) && !userChip?.contains(e.target)) {
        toggleUserMenu(false);
      }
    }
  });

  goDashboard?.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
  goStats?.addEventListener('click', () => {
    window.location.href = 'stats.html';
  });
  logoutBtn?.addEventListener('click', () => {
    authService.logout();
    toggleUserMenu(false);
    updateAuthUI();
    showToast('已退出登录', 'info');
  });

  // ============================================================
  // 5) CTA 按钮
  // ============================================================
  ctaBtn?.addEventListener('click', () => {
    if (authService.isAuthenticated()) {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'register.html';
    }
  });

  // ============================================================
  // 6) 移动端菜单
  // ============================================================
  function closeMobileMenu() {
    if (!burger) return;
    burger.setAttribute('aria-expanded', 'false');
    burger.classList.remove('active');
    if (overlay) overlay.hidden = true;
    if (menu) menu.hidden = true;
    document.body.classList.remove('menu-open');
  }

  function toggleMenu(force) {
    if (!burger) return;
    const isOpen = force ?? burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(isOpen));
    burger.classList.toggle('active', isOpen);
    if (overlay) overlay.hidden = !isOpen;
    if (menu) menu.hidden = !isOpen;
    document.body.classList.toggle('menu-open', isOpen);
  }

  burger?.addEventListener('click', () => toggleMenu());
  overlay?.addEventListener('click', () => toggleMenu(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleMenu(false);
      closeLoginModal();
    }
  });
  menu?.querySelectorAll('a, .mobile-signin').forEach((el) => {
    el.addEventListener('click', () => toggleMenu(false));
  });
  // resize > 720 关闭移动菜单
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 720) toggleMenu(false);
    }, 100);
  });

  // 移动端 dashboard 按钮
  mobileDashboardBtn?.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  // ============================================================
  // 7) 统计数字 Count-Up
  // ============================================================
  const stats = [
    { target: 120,   suffix: 'ms', decimals: 0 },
    { target: 99.99, suffix: '%',  decimals: 2 },
    { target: 24,     suffix: '/7', decimals: 0 },
    { target: 2.4,    suffix: 'M',  decimals: 1 },
  ];

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el, stat, index) {
    const duration = 1500 + index * 80;
    const startDelay = 480 + index * 90;

    setTimeout(() => {
      const startTime = performance.now();
      function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);
        const value = stat.target * eased;
        el.textContent = value.toFixed(stat.decimals) + stat.suffix;
        if (progress < 1) requestAnimationFrame(update);
        else el.textContent = stat.target.toFixed(stat.decimals) + stat.suffix;
      }
      requestAnimationFrame(update);
    }, startDelay);
  }

  const statsContainer = document.querySelector('.stats');
  if (statsContainer && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const valueEls = entry.target.querySelectorAll('.stat-value');
          valueEls.forEach((el, i) => { if (stats[i]) countUp(el, stats[i], i); });
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.25 }
    );
    observer.observe(statsContainer);
  } else if (statsContainer) {
    statsContainer.querySelectorAll('.stat-value').forEach((el, i) => {
      if (stats[i]) countUp(el, stats[i], i);
    });
  }

  // ============================================================
  // 8) Logo 加载失败兜底
  // ============================================================
  function handleLogoFallback() {
    const logoImg = document.querySelector('.logo-btn img');
    if (!logoImg) return;
    logoImg.addEventListener('error', () => {
      const btn = logoImg.parentElement;
      if (!btn || btn.querySelector('.logo-fallback')) return;
      const span = document.createElement('span');
      span.className = 'logo-fallback';
      span.textContent = '晨';
      logoImg.style.display = 'none';
      btn.appendChild(span);
    });
  }
})();
