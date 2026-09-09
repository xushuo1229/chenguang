// ====================================================================
// 晨光自律台 · Dashboard 页面（管理控制台）
// ====================================================================
// 这是功能最全面的页面，包含：
//   - 首页概览（成长数据、课程/运动/英语/阅读卡片）
//   - 今日计划（待办任务管理）
//   - 课程管理（添加/编辑/删除课程）
//   - 阅读管理（添加/编辑/删除书籍）
//   - 运动管理（添加/删除运动记录）
//   - 英语学习（单词背诵功能）
//   - 统计图表（本周学习柱状图、完成率等）
//   - 个人中心（查看/编辑资料、数据导入导出）
//   - 设置面板（主题切换、账号管理）
//
// 代码结构：
//   0. 数据层桥接（统一数据格式转换）
//   1. 侧边栏视图切换
//   2. 模态弹窗系统
//   3-12. 各种 CRUD 功能模块
// ====================================================================

import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/ui/modal.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';

/* ==================== 统一数据层兼容桥（cg_* → chenguangData） ====================
 * 让 dashboard 现有的 courses/books/sports 读写逻辑无需大改即可接入统一数据层。
 * 运动/阅读/英语等由 workbench 写入 chenguangData 后，dashboard 通过
 * chenguang:update 事件实时刷新，实现跨页面数据共享。
 */
(function () {
  if (!window.CGStore) return;
  var Store = window.CGStore;

  // 旧字段形状 ↔ 统一数据层字段形状 互转
  // 关键：保留 totalChapters / learnedChapters 真实章节数，避免进度换算失真
  function toStoreCourses(arr) {
    return (arr || []).map(function (c) {
      var total = Number(c.totalChapters != null ? c.totalChapters : c.total) || 0;
      var learned = Number(c.learnedChapters != null ? c.learnedChapters : c.learned) || 0;
      // 进度始终由真实章节数推算，避免保存时残留旧百分比
      var progress = (total > 0) ? Math.round((learned / total) * 100) : 0;
      return {
        id: c.id || Store.uid(),
        name: c.name || '未命名课程',
        totalChapters: total,
        learnedChapters: learned,
        progress: progress,
        status: c.status || (progress >= 100 ? 'done' : (progress > 0 ? 'doing' : 'todo'))
      };
    });
  }
  function toLegacyCourses(arr) {
    return (arr || []).map(function (c) {
      var total = Number(c.totalChapters || c.total) || 100;
      var learned = Number(c.learnedChapters != null ? c.learnedChapters : (c.learned != null ? c.learned : Math.round((Number(c.progress) || 0) / 100 * total)));
      var p = total > 0 ? Math.round((learned / total) * 100) : 0;
      return { id: c.id, name: c.name, total: total, learned: learned, progress: p, status: c.status };
    });
  }
  function toStoreBooks(arr) {
    return (arr || []).map(function (b) {
      return { id: b.id || Store.uid(), date: b.date || Store.today(),
               bookName: b.name || b.bookName || '书籍',
               pages: Number(b.read != null ? b.read : b.pages) || 0,
               totalPages: Number(b.total != null ? b.total : b.totalPages) || 0 };
    });
  }
  function toLegacyBooks(arr) {
    return (arr || []).map(function (b) {
      return { id: b.id, name: b.bookName, date: b.date, read: b.pages, total: b.totalPages };
    });
  }
  function toStoreSports(arr) {
    return (arr || []).map(function (s) {
      return { id: s.id || Store.uid(), date: s.date || Store.today(),
               name: s.name || '运动',
               calories: Number(s.cal != null ? s.cal : s.calories) || 0,
               duration: Number(s.min != null ? s.min : s.duration) || 0,
               type: s.type || 'general' };
    });
  }
  function toLegacySports(arr) {
    return (arr || []).map(function (s) {
      return { id: s.id, date: s.date, name: s.name, cal: s.calories, min: s.duration, type: s.type };
    });
  }

  // 暴露给后续脚本用的桥接（覆盖下方 STORAGE_KEYS / loadData / saveData 的作用）
  window.__CG_BRIDGE__ = {
    toStoreCourses: toStoreCourses, toLegacyCourses: toLegacyCourses,
    toStoreBooks: toStoreBooks, toLegacyBooks: toLegacyBooks,
    toStoreSports: toStoreSports, toLegacySports: toLegacySports
  };
})();

/* ==================== 0.5 本地统计计算（统一数据层 → 统计指标） ====================
 * 计算各项统计数据，与 stats.html / workbench 保持一致的口径：
 * - longest_streak        打卡最长连续天数
 * - done_checkins         累计打卡次数
 * - study_hours           英语+专注累计小时数
 * - study_days            有学习/专注记录的天数
 * - done_todos            已完成任务数
 */
function computeLocalStats() {
  if (!window.CGStore) {
    return { longest_streak: 0, done_checkins: 0, study_hours: 0, total_study_minutes: 0, study_days: 0, done_todos: 0 };
  }
  var checkins = CGStore.getCheckins ? CGStore.getCheckins() : [];
  var engMins = CGStore.getEnglish().reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0);
  var focMins = CGStore.getFocus().reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0);
  var daySet = {};
  CGStore.getEnglish().forEach(function (x) { if (x.date) daySet[x.date] = 1; });
  CGStore.getFocus().forEach(function (x) { if (x.date) daySet[x.date] = 1; });

  // 最长连续打卡天数（按打卡日期排序后线性扫描）
  var sorted = checkins.map(function (c) { return c.date; }).filter(Boolean).sort();
  var max = 0, cur = 0, prev = null;
  sorted.forEach(function (d) {
    if (prev) {
      var diff = Math.round((new Date(d) - new Date(prev)) / 86400000);
      cur = diff === 1 ? cur + 1 : 1;
    } else {
      cur = 1;
    }
    if (cur > max) max = cur;
    prev = d;
  });

  var doneTodos = CGStore.getTodos().filter(function (t) { return t.done; }).length;
  var totalMins = engMins + focMins;
  return {
    longest_streak: max,
    done_checkins: checkins.length,
    study_hours: Math.round(totalMins / 60 * 10) / 10,
    total_study_minutes: totalMins,
    study_days: Object.keys(daySet).length,
    done_todos: doneTodos
  };
}

function computeTodayInfo() {
  if (!window.CGStore) return { total: 0, done: 0 };
  var todos = CGStore.getTodosByDate(CGStore.today());
  return {
    total: todos.length,
    done: todos.filter(function (t) { return t.done; }).length
  };
}

function computeWeekly() {
  // computeWeekly() 计算近 7 天每天的学习时长（英语 + 专注分钟数之和）
  // 返回一个数组，包含 7 天的数据，用于绘制柱状图
  if (!window.CGStore) return [];
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var off = d.getTimezoneOffset();
    var ds = new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
    var mins = CGStore.getEnglishByDate(ds).reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0)
             + CGStore.getFocusByDate(ds).reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0);
    days.push({ date: ds, study_minutes: mins });
  }
  return days;
}

/* ==================== 0.6 加载真实统计数据（统一数据层本地计算） ====================
 * loadAllStats() 是 Dashboard 页面的核心数据加载函数
 * 它从本地 CGStore 数据存储中计算所有统计指标，然后更新页面显示
 */
async function loadAllStats() {
  if (!window.CGAPI) return;
  var u = null;
  try { u = JSON.parse(localStorage.getItem('cg_user') || 'null'); } catch (_) {}

  var nickname = (u && u.nickname) ? u.nickname : '同学';
  // 顶栏
  var wbName = document.querySelector('.wb-username');
  if (wbName && (!wbName.textContent || wbName.textContent === '同学' || wbName.textContent === '自律王')) {
    wbName.textContent = nickname;
  }

  // 统计一律从统一数据层本地计算（与 stats.html / workbench 同口径）。
  // 说明：后端当前没有 /api/stats/* 端点（404），且本地 chenguangData 已含全部数据。
  var stats = computeLocalStats();

  // 今日任务完成情况 + 近 7 天学习/专注趋势（本地计算）
  var todayInfo = computeTodayInfo();
  var weekly = computeWeekly();

  // === 个人中心 (profile modal) ===
  var joinDay = 1;
  if (u && (u.created_at || u.createdAt)) {
    var ct = new Date(u.created_at || u.createdAt).getTime();
    if (!isNaN(ct)) {
      joinDay = Math.max(1, Math.floor((Date.now() - ct) / 86400000) + 1);
    }
  }
  var streak = (stats && stats.longest_streak) ? stats.longest_streak : 0;
  var doneTasks = (stats && stats.done_checkins) ? stats.done_checkins : 0;
  var studyHours = (stats && stats.study_hours) ? stats.study_hours : 0;
  var studyMins = (stats && stats.total_study_minutes) ? stats.total_study_minutes : 0;

  setText('#profileDisplayName', u ? (u.nickname || '同学') : '同学');
  setText('#profileDisplayEmail', u ? (u.email || '未绑定邮箱') : '未绑定邮箱');
  setText('#profileJoinDate', '第 ' + joinDay + ' 天');
  setText('#profileDays', String(streak));
  setText('#profileTasks', String(doneTasks));
  setText('#profileFocus', (studyHours >= 1)
    ? (studyHours >= 10 ? Math.round(studyHours) + 'h' : studyHours + 'h')
    : studyMins + '分钟');

  // === 首页欢迎语 ===
  var wm = $('#welcomeMsg');
  if (wm) wm.innerHTML = '欢迎回来，' + escapeHtml(nickname) + ' · 今天是第 <b style="color:var(--accent)">' + joinDay + '</b> 天打卡';

  // === 成长数据 (6 metric) — 从统一数据层计算 ===
  var growthBooksFinished = (window.CGStore && CGStore.totalBooksFinished) ? CGStore.totalBooksFinished() : 0;
  var growthPagesRead = (window.CGStore && CGStore.totalPagesRead) ? CGStore.totalPagesRead() : 0;
  setHTML('#growthBooks', String(growthBooksFinished) + '<small>本</small>');
  setHTML('#growthPages', String(growthPagesRead) + '<small>页</small>');
  setHTML('#growthHours', String(studyHours) + '<small>时</small>');
  setHTML('#growthStudyCount', String((stats && stats.study_days) ? stats.study_days : 0) + '<small>次</small>');
  setHTML('#growthMinutes', String(studyMins) + '<small>分</small>');
  setHTML('#growthStreak', String(streak) + '<small>天 🔥</small>');

  // 环形图：以课程平均进度作为成长进度
  var courseAvgForRing = 0;
  try {
    var csForRing = (window.CGStore) ? CGStore.getCourses() : [];
    if (csForRing.length) {
      var sumForRing = 0;
      csForRing.forEach(function (c) { sumForRing += (Number(c.progress) || 0); });
      courseAvgForRing = Math.round(sumForRing / csForRing.length);
    }
  } catch (_) {}
  var ringPct = $('#growthRingPct');
  if (ringPct) ringPct.textContent = courseAvgForRing + '%';
  // 同步 SVG 圆环进度（circumference = 2π×54 ≈ 339.29，CSS 中为硬编码 0.5）
  try {
    var ringCircle = document.querySelector('.ring .progress');
    if (ringCircle) ringCircle.style.strokeDashoffset = 'calc(339.29 * (1 - ' + (courseAvgForRing / 100) + '))';
  } catch (_) {}
  var ringLbl = $('#growthRingLbl');
  if (ringLbl) ringLbl.textContent = '成长进度';

  // === 首页 4 个 stat card ===
  // 课程 card（统一数据层）
  try {
    var coursesArr = (window.CGStore) ? window.__CG_BRIDGE__.toLegacyCourses(CGStore.getCourses()) : [];
    if (!Array.isArray(coursesArr)) coursesArr = [];
    var cN = coursesArr.length;
    var cAvg = 0;
    if (cN > 0) {
      var sum = 0;
      coursesArr.forEach(function (c) {
        var t = Number(c.total) || 0;
        var l = Number(c.learned) || 0;
        sum += t > 0 ? Math.round((l / t) * 100) : 0;
      });
      cAvg = Math.round(sum / cN);
    }
    var cVal = $('#homeCardCourse');
    if (cVal) cVal.innerHTML = (cN > 0)
      ? (cN + ' 门<small>· 平均 ' + cAvg + '%</small>')
      : '0 门<small>· 暂无课程</small>';
    var cSub = $('#homeCardCourseSub');
    if (cSub) cSub.textContent = (cN > 0) ? ('共 ' + cN + ' 门课程') : '● 尚未添加';
  } catch (_) {}

  // 运动 card（统一数据层，计算今日千卡）
  try {
    var sportsArr = (window.CGStore) ? window.__CG_BRIDGE__.toLegacySports(CGStore.getSports()) : [];
    if (!Array.isArray(sportsArr)) sportsArr = [];
    var todayKey = new Date().toISOString().slice(0, 10);
    var todayCals = 0, todayCount = 0;
    sportsArr.forEach(function (s) {
      var key = s.date || (s.created_at ? String(s.created_at).slice(0,10) : '');
      if (key === todayKey) {
        todayCals += Number(s.cal) || Number(s.calories) || 0;
        todayCount += 1;
      }
    });
    var sVal = $('#homeCardSport');
    if (sVal) sVal.innerHTML = (todayCount > 0)
      ? (todayCount + ' 次<small>· ' + todayCals + ' 千卡</small>')
      : '0 次<small>· 0 千卡</small>';
    var sSub = $('#homeCardSportSub');
    if (sSub) sSub.textContent = (todayCals >= 150) ? '▲ 已达成 100%' : '● 今日未开始';
  } catch (_) {}

  // === 首页「英语学习」卡片（此前遗漏，一直显示硬编码 0） ===
  try {
    var engArr = (window.CGStore) ? CGStore.getEnglish() : [];
    if (!Array.isArray(engArr)) engArr = [];
    var engTodayKey = (window.CGStore && CGStore.today) ? CGStore.today() : new Date().toISOString().slice(0, 10);
    var engTodayCount = 0, engTodayMins = 0;
    engArr.forEach(function (e) {
      if ((e.date || '').slice(0, 10) === engTodayKey) {
        engTodayCount += 1;
        engTodayMins += Number(e.minutes) || 0;
      }
    });
    var eVal = $('#homeCardEnglish');
    if (eVal) eVal.innerHTML = (engTodayCount > 0)
      ? (engTodayCount + ' 次<small>· ' + engTodayMins + ' 分钟</small>')
      : '0 次<small>· 0 分钟</small>';
    var eSub = $('#homeCardEnglishSub');
    if (eSub) eSub.textContent = (engTodayCount > 0) ? '▲ 今日进行中' : '● 今日未开始';
  } catch (_) {}

  // === 统计总览 — 本周专注柱状图 ===
  var bars = (weekly && weekly.length === 7) ? weekly : [];
  var weeklyTotal = 0;
  var barCols = document.querySelectorAll('#barChart .bar-col');
  if (barCols.length === 7) {
    if (bars.length === 7) {
      // 找到最大值算高度比例 (避免空表格都是 0 不好看，最大至少 60 分钟基准)
      var max = Math.max.apply(null, bars.map(function (b) { return Number(b.study_minutes) || 0; }));
      bars.forEach(function (b, i) {
        var m = Number(b.study_minutes) || 0;
        weeklyTotal += m;
        var pct = max > 0 ? Math.round((m / max) * 100) : 0;
        var col = barCols[i];
        if (col) {
          col.style.height = (pct > 0 ? pct : 0) + '%';
          col.setAttribute('data-min', m + '分');
          if (m > 0) {
            col.style.background = 'linear-gradient(180deg,#fbbf24,#f59e0b)';
          } else {
            col.style.background = 'rgba(0,0,0,.06)';
          }
        }
      });
    } else {
      // 无 weekly 数据，全部 0
      barCols.forEach(function (col) {
        col.style.height = '0%';
        col.setAttribute('data-min', '0分');
        col.style.background = 'rgba(0,0,0,.06)';
      });
    }
  }
  setText('#focusTotal', weeklyTotal > 0 ? weeklyTotal.toLocaleString() : '0');

  // === 计划完成率 ===
  var td = todayInfo || { total: 0, done: 0 };
  var tdTotal = (td && typeof td.total !== 'undefined') ? Number(td.total) : 0;
  var tdDone = (td && typeof td.done !== 'undefined') ? Number(td.done) : 0;
  var rate = tdTotal > 0 ? Math.round((tdDone / tdTotal) * 100) : 0;
  setText('#planRate', rate + '%');
  setText('#todayProg', tdDone + ' / ' + tdTotal);
  var tBar = $('#todayProgBar');
  if (tBar) tBar.style.width = rate + '%';
  // 本周完成率: 本周（近 7 天）任务 已完成/总数，从统一数据层计算
  var weekTodoTotal = 0, weekTodoDone = 0;
  try {
    if (window.CGStore) {
      var allTodos = CGStore.getTodos();
      var weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      var weekAgoStr = new Date(weekAgo.getTime() - weekAgo.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      allTodos.forEach(function (t) {
        if ((t.date || '') >= weekAgoStr) {
          weekTodoTotal += 1;
          if (t.done) weekTodoDone += 1;
        }
      });
    }
  } catch (_) {}
  var wpTotal = weekTodoTotal;
  var wpDone = weekTodoDone;
  var wrate = wpTotal > 0 ? Math.round((wpDone / wpTotal) * 100) : 0;
  setText('#weekProg', wpDone + ' / ' + wpTotal);
  var wBar = $('#weekProgBar');
  if (wBar) wBar.style.width = wrate + '%';

  // === 累计阅读（统一数据层 readings 聚合） ===
  try {
    var booksArr = (window.CGStore) ? window.__CG_BRIDGE__.toLegacyBooks(CGStore.getReadings()) : [];
    if (!Array.isArray(booksArr)) booksArr = [];
    var readPages = 0, totalBooks = booksArr.length;
    booksArr.forEach(function (b) {
      readPages += Number(b.read) || 0;
    });
    setText('#readingTotal', readPages.toLocaleString());
    var big = $('#readingTotalBig'); if (big) big.textContent = readPages.toLocaleString();
    var sub = $('#readingSub');
    if (sub) sub.innerHTML = '共 ' + totalBooks + ' 本书 · 连续阅读 ' + streak + ' 天';
    var tag = $('#readingTag');
    if (tag) {
      tag.textContent = readPages >= 5000 ? '⭐ 书虫Lv3'
        : readPages >= 2000 ? '⭐ 书虫Lv2'
        : readPages >= 500 ? '⭐ 书虫Lv1'
        : '📚 书虫起步';
    }

    // === 首页「每日阅读」卡片 ===
    var homeReading = $('#homeCardReading');
    if (homeReading) {
      homeReading.innerHTML = totalBooks + ' 本<small>· ' + readPages + ' 页</small>';
    }
    var homeReadingSub = $('#homeCardReadingSub');
    if (homeReadingSub) {
      homeReadingSub.textContent = totalBooks > 0
        ? ('▲ 共 ' + totalBooks + ' 本书')
        : '● 今日未开始';
    }
  } catch (_) {}

  // === slogan 底部 ===
  var slogan = $('#sloganExtra');
  if (slogan) {
    if (streak >= 1) {
      slogan.textContent = '🔥 已坚持 ' + streak + ' 天 · 继续保持！';
    } else {
      slogan.textContent = '🌱 已开启自律之旅';
    }
  }

  // === 设置面板 — 账号 ===
  setText('#settingsNickname', u ? (u.nickname || '同学') : '同学');
  setText('#settingsEmail', u ? (u.email || '未绑定') : '未绑定');
  setText('#settingsStreak', '🔥 ' + streak + ' 天');

  // === 英语 streak tag ===
  setText('#englishStreakTag', '🔥 ' + streak + ' 天');

  // === 课程进度 (view-progress) 动态渲染 ===
  renderProgressList();

  // === 目标与数值 (默认 + localStorage) ===
  var g = readGoals();
  setText('#goalWords', g.words + ' 个');
  setText('#goalCal', g.cal + ' 千卡');
  setText('#goalFocus', g.focus + ' 分钟');
  setText('#goalRate', g.rate + ' %');

  // === 提醒 badge — 真实待办数据 ===
  var badge = $('#remindBadge');
  if (badge) {
    var pendingTodayN = 0, checkedToday = false;
    try {
      if (window.CGStore) {
        pendingTodayN = CGStore.getTodosByDate(CGStore.today()).filter(function (t) { return !t.done; }).length;
        checkedToday = CGStore.isCheckedIn();
      }
    } catch (_) {}
    if (pendingTodayN > 0) {
      badge.textContent = String(pendingTodayN);
      badge.style.display = '';
    } else if (!checkedToday) {
      badge.textContent = '打卡';
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
}

function readGoals() {
  try {
    var raw = localStorage.getItem('cg_goals');
    var g = raw ? JSON.parse(raw) : {};
    return {
      words: Number(g.words) || 20,
      cal:   Number(g.cal)   || 150,
      focus: Number(g.focus) || 1500,
      rate:  Number(g.rate)  || 60
    };
  } catch (_) { return { words: 20, cal: 150, focus: 1500, rate: 60 }; }
}

/* 渲染 view-progress 课程列表（来自统一数据层，通过模块 courses 数组） */
function renderProgressList() {
  var host = document.getElementById('progressList');
  var empty = document.getElementById('progressEmpty');
  if (!host) return;
  // courses 已由 loadData 从 CGStore 加载（legacy 形状：total=100, learned=progress）
  var arr = (typeof courses !== 'undefined' && Array.isArray(courses)) ? courses : [];
  if (!Array.isArray(arr)) arr = [];
  host.innerHTML = '';
  if (arr.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  arr.forEach(function (c) {
    var t = Number(c.total) || 0;
    var l = Number(c.learned) || 0;
    var pct = t > 0 ? Math.min(100, Math.round((l / t) * 100)) : 0;
    var color = pct >= 100 ? 'var(--success)' : (pct >= 30 ? 'var(--accent)' : 'var(--warn)');
    var grad = pct >= 100 ? 'linear-gradient(90deg,#34d399,#10b981)'
              : pct >= 30  ? 'linear-gradient(90deg,#fbbf24,#f59e0b)'
                            : 'linear-gradient(90deg,#fbbf24,#d97706)';
    var row = document.createElement('div');
    row.innerHTML =
      '<div class="label-row" style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">' +
        '<span style="font-weight:600;color:var(--fg-text);">' + escapeHtml(c.name || '课程') + '</span>' +
        '<b style="color:' + color + ';">' + pct + '%</b>' +
      '</div>' +
      '<div style="height:10px;background:rgba(0,0,0,.08);border-radius:999px;overflow:hidden;">' +
        '<div style="width:' + pct + '%;height:100%;background:' + grad + ';"></div>' +
      '</div>';
    host.appendChild(row);
  });
}

/* 入口：DOM 就绪后再执行绑定，避免 'Cannot access $ before initialization' 或时序问题 */
// safeInit() 是 Dashboard 页面的入口函数
// 它会检查登录状态，然后加载数据并初始化所有功能
async function safeInit() {
  // ===== 登录态守卫：未登录则立即跳转回首页 =====
  // cg_token 是登录令牌，存储在 localStorage 中
  // 如果没有 token，说明用户未登录，需要跳转到登录页
  try {
    const token = localStorage.getItem('cg_token');
    if (!token) {
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(4,7,26,.96);color:#fff;font-family:inherit;font-size:15px;';
      errDiv.textContent = '🔐 尚未登录，正在返回首页…';
      document.body.appendChild(errDiv);
      setTimeout(() => { window.location.replace('index.html'); }, 600);
      return;
    }
    // 已登录：先从云端拉取整份数据覆盖本地缓存（保证多设备一致），再渲染
    try { if (window.CGSync) await window.CGSync.afterLogin(); } catch (_) {}

    // 读取用户昵称注入顶部（如果存在）
    var u = null;
    try {
      u = JSON.parse(localStorage.getItem('cg_user') || 'null');
    } catch(_) {}

    // 如果是后端登录的用户（非 demo_token），尝试从后端刷新用户数据
    var isDemo = token && token.indexOf('demo_token_') === 0;
    if (!isDemo && window.CGAPI && CGAPI.auth.isAuthenticated()) {
      try {
        var res = await CGAPI.auth.getCurrentUser();
        if (res && res.user) {
          u = res.user;
          // 同步头像数据
          if (u.avatar_url && !u.avatar) {
            // 后端存储的是 URL，可直接使用
          }
          localStorage.setItem('cg_user', JSON.stringify(u));
        }
      } catch (err) {
        // 后端刷新失败，继续使用本地缓存
        console.warn('[dashboard] 刷新用户信息失败:', err.message);
      }
    }

    // 渲染用户信息
    if (u) {
      const nameEl = document.querySelector('.wb-username');
      if (nameEl) nameEl.textContent = u.nickname || '同学';
      const avatarEl = document.querySelector('.wb-avatar');
      if (avatarEl) {
        if (u.avatar) {
          avatarEl.innerHTML = '<img src="' + u.avatar + '" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;" />';
        } else if (u.avatar_url) {
          avatarEl.innerHTML = '<img src="' + u.avatar_url + '" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;" />';
        } else if (u.nickname) {
          avatarEl.textContent = u.nickname.charAt(0);
        } else {
          avatarEl.textContent = '同';
        }
      }
    }

    // 加载真实统计 (拉取 /api/stats/* 系列接口, 失败时静默)
    try {
      await loadAllStats();
    } catch (err) {
      console.warn('[dashboard] loadAllStats 失败:', err.message);
    }
  } catch(_) {}

  // 动态显示当前日期
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekDay = weekDays[now.getDay()];
    const dateEl = document.getElementById('wbDate');
    if (dateEl) dateEl.textContent = `📅 ${year}年${month}月${day}日 ${weekDay}`;
  } catch(_) {}

  try {
    init();
  } catch (err) {
    console.error('[dashboard] init failed:', err);
    if (window.toast) window.toast('⚠️ 初始化异常：' + err.message, 'error');
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInit);
} else {
  safeInit();
}

function init() {
// ==================== 模态弹窗系统 ====================
// 模态弹窗（Modal）是页面上的浮动窗口，用于显示表单、确认信息等
// showConfirm() 返回一个 Promise，用户点击确定返回 true，取消返回 false
// 这种写法让弹窗可以用 async/await 语法调用，代码更简洁
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const modal = $('#modalConfirm');
    $('#confirmTitle').textContent = title || '⚠️ 确认操作';
    $('#confirmMessage').textContent = message || '确定要执行此操作吗？';
    modal.classList.remove('hidden');
    const okBtn = $('#confirmOk');
    const cancelBtn = $('#confirmCancel');
    const closeBtn = modal.querySelector('[data-close-modal]');
    const cleanup = () => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      modal.classList.add('hidden');
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
  });
}
// 点击遮罩 / 按 Esc 关闭所有 modal
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close-modal]')) closeModal(e.target.getAttribute('data-close-modal'));
  if (e.target.classList?.contains('modal-overlay')) e.target.classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $$('.modal-overlay').forEach(m => m.classList.add('hidden'));
});

/* ==================== 1. 侧边栏视图切换 ====================
 * Dashboard 使用「单页应用」模式：所有视图（首页、课程、阅读等）
 * 都在同一个 HTML 页面中，通过 JS 控制显示/隐藏哪个视图
 * switchView(key) 切换到指定视图，同时更新侧边栏高亮
 */
function switchView(key) {
  $$('.page-view').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('view-' + key);
  if (!target) {
    $$('.sidebar a.nav-item').forEach(l => l.classList.remove('active'));
    const homeLink = document.querySelector('.sidebar a.nav-item[data-view="home"]');
    if (homeLink) homeLink.classList.add('active');
    const homeView = $('#view-home');
    if (homeView) homeView.classList.add('active');
    return;
  }
  target.classList.add('active');
  $$('.sidebar a.nav-item').forEach(l => l.classList.toggle('active', l.dataset.view === key));
  // 切换到课程进度页时刷新渲染（确保数据最新）
  if (key === 'progress' && typeof renderProgressList === 'function') {
    renderProgressList();
  }
  // 滚回顶部
  $('.wb-scroll').scrollTo({ top: 0, behavior: 'smooth' });
}
$$('[data-nav]').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(a.dataset.nav);
  });
});

/* ==================== 2. 背景层导航 / 登录 / 立即开始 CTA ==================== */
$$('[data-bg-nav]').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    $$('[data-bg-nav]').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
  });
});
$$('[data-action]').forEach(btn => {
  btn.addEventListener('click', handleAction);
});
function handleAction(e) {
  const a = e.currentTarget.getAttribute('data-action');
  switch (a) {
    case 'login': openModal('modalLogin'); break;
    case 'scrollWorkbench':
      $('#workbench').scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    case 'switchTheme': cycleTheme(); break;
    case 'openProfile': openProfileModal(); break;
    case 'showRemind': openReminders(); break;
    case 'openNewTask': {
      $('#taskDate').valueAsDate = new Date(Date.now() + 7 * 86400000);
      openModal('modalTask');
      break;
    }
    case 'submitTask': submitTask(); break;
    case 'doLogin': doLogin(); break;
    case 'checkIn': checkInGoal(); break;
    case 'goPlan': switchView('plan'); break;
    case 'openReading': switchView('reading'); break;
    case 'startWords': startWordLearning(); break;
    case 'saveProfile': saveProfileData(); break;
    case 'clearProfileAvatar': clearProfileAvatar(); break;
    case 'exportData': exportAllData(); break;
    case 'importData': importAllData(); break;
    case 'logout': {
      // 统一走 CGStore.logout：清 token/用户镜像/cg_* 键，并重置 chenguangData，
      // 避免上一用户的业务数据残留本地，被下一账号登录时「先推后拉」带到云端
      try {
        if (window.CGStore && typeof CGStore.logout === 'function') {
          CGStore.logout();
        } else {
          localStorage.removeItem('cg_token');
          localStorage.removeItem('cg_user');
          try {
            for (var i = localStorage.length - 1; i >= 0; i--) {
              var k = localStorage.key(i);
              if (k && (k.indexOf('cg_') === 0 || k.indexOf('cgl_') === 0)) localStorage.removeItem(k);
            }
          } catch(_) {}
        }
      } catch(_) {}
      // 关闭个人中心弹窗, 提示并跳转到首页
      try { document.getElementById('modalProfile').classList.add('hidden'); } catch(_) {}
      if (typeof toast === 'function') toast('✅ 已安全退出，即将返回首页…', 'success');
      setTimeout(() => { window.location.href = 'index.html'; }, 600);
      break;
    }
  }
}

/* ==================== 2.5 个人中心逻辑 ==================== */
function exportAllData() {
  try {
    var payload = window.CGStore ? CGStore.get() : null;
    if (!payload) { toast('没有可导出的数据', 'warn'); return; }
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'chenguang-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    // 关键修复：添加 target="_blank" 和 rel="noopener" 防止在当前页面导航
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 延迟释放 Blob URL（给浏览器足够时间处理下载）
    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 10000); // 10秒后释放
    toast('✅ 数据已导出（JSON 备份）', 'success');
  } catch (e) {
    console.error('[export]', e);
    toast('导出失败：' + e.message, 'error');
  }
}

function importAllData() {
  try {
    var fileInput = document.getElementById('importDataFile');
    if (!fileInput) return;
    fileInput.value = '';
    fileInput.onchange = function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object' || !Array.isArray(data.courses)) {
            toast('文件格式不正确，请选择导出的 JSON 备份', 'error');
            return;
          }
          var confirmed = window.confirm('导入将用备份数据覆盖当前全部数据，确定继续吗？');
          if (!confirmed) return;
          // 保留当前登录 token / user 镜像，仅恢复业务数据
          if (window.CGStore) {
            var token = CGStore.getToken();
            var user = data.user || {};
            CGStore.set(data);
            if (token) CGStore.setToken(token);
            // 恢复后触发全页刷新（chenguang:update 已由 set 内部派发）
            if (typeof renderCourses === 'function') renderCourses();
            if (typeof renderBooks === 'function') renderBooks();
            if (typeof renderSports === 'function') renderSports();
            if (typeof loadAllStats === 'function') loadAllStats();
            toast('✅ 数据导入成功', 'success');
          }
        } catch (e) {
          toast('导入失败：' + e.message, 'error');
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  } catch (e) {
    toast('导入失败：' + e.message, 'error');
  }
}
function loadProfileData() {
  try {
    var u = JSON.parse(localStorage.getItem('cg_user') || 'null');
    if (!u) return;
    // 填充表单
    var nickEl = $('#profileNickname');
    if (nickEl) nickEl.value = u.nickname || '';
    var emailEl = $('#profileEmail');
    if (emailEl) emailEl.value = u.email || '';
    // 显示信息
    var nameEl = $('#profileDisplayName');
    if (nameEl) nameEl.textContent = u.nickname || '同学';
    var dispEmail = $('#profileDisplayEmail');
    if (dispEmail) dispEmail.textContent = u.email || '未绑定邮箱';
    // 头像
    var avatarEl = $('#profileAvatar');
    if (avatarEl) {
      if (u.avatar) {
        avatarEl.innerHTML = '<img src="' + u.avatar + '" alt="头像" />';
      } else {
        avatarEl.textContent = (u.nickname || '同').charAt(0);
      }
    }
    // 顶部头像
    var wbAvatar = document.querySelector('.wb-avatar');
    if (wbAvatar) {
      if (u.avatar) {
        wbAvatar.innerHTML = '<img src="' + u.avatar + '" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;" />';
      } else {
        wbAvatar.textContent = (u.nickname || '律').charAt(0);
      }
    }
    // 顶部昵称
    var wbName = document.querySelector('.wb-username');
    if (wbName) wbName.textContent = u.nickname || '自律王';
    // 加入天数
    var joinEl = $('#profileJoinDate');
    if (joinEl) {
      var ct = u.created_at || u.createdAt;
      if (ct) {
        var days = Math.max(1, Math.floor((Date.now() - new Date(ct).getTime()) / 86400000) + 1);
        joinEl.textContent = '第 ' + days + ' 天';
      } else {
        joinEl.textContent = '第 1 天';
      }
    }
  } catch(_) {}
}

function openProfileModal() {
  loadProfileData();
  // 异步刷新 stats + me 信息 (覆盖默认值)
  try { loadAllStats(); } catch (_) {}
  openModal('modalProfile');
}

async function saveProfileData() {
  var newNick = ($('#profileNickname').value || '').trim();
  var newEmail = ($('#profileEmail').value || '').trim();
  // 验证
  if (!newNick) { toast('昵称不能为空', 'warn'); return; }
  if (newNick.length > 16) { toast('昵称最多 16 位', 'warn'); return; }
  if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { toast('邮箱格式不正确', 'warn'); return; }

  // 先更新本地
  try {
    var u = JSON.parse(localStorage.getItem('cg_user') || '{}');
    u.nickname = newNick;
    if (newEmail) u.email = newEmail;
    localStorage.setItem('cg_user', JSON.stringify(u));
  } catch (err) {
    toast('本地保存失败：' + err.message, 'error');
    return;
  }

  // 同步到后端（如果是后端登录的用户）
  var token = localStorage.getItem('cg_token');
  var isDemo = token && token.indexOf('demo_token_') === 0;
  if (!isDemo && CGAPI.auth.isAuthenticated()) {
    try {
      var result = await CGAPI.auth.updateProfile({ nickname: newNick });
      if (result.user && result.user.id) {
        // 后端返回成功，更新本地存储
        u.id = result.user.id;
        u.nickname = result.user.nickname || newNick;
        u.email = result.user.email || newEmail;
        if (result.user.avatar_url) u.avatar_url = result.user.avatar_url;
        localStorage.setItem('cg_user', JSON.stringify(u));
      }
    } catch (err) {
      // 后端同步失败不阻止本地保存，仅提示
      console.warn('[profile] 后端同步失败:', err.message);
      toast('本地已保存，云端同步失败', 'warn');
    }
  }

  // 刷新 UI
  loadProfileData();
  toast('✅ 个人资料已保存', 'success');
  setTimeout(function () { closeModal('modalProfile'); }, 500);
}

function clearProfileAvatar() {
  try {
    var u = JSON.parse(localStorage.getItem('cg_user') || '{}');
    delete u.avatar;
    localStorage.setItem('cg_user', JSON.stringify(u));
    loadProfileData();
    toast('🗑 头像已清除', 'info');
  } catch (_) {}
}

// 头像上传处理
document.addEventListener('change', function (e) {
  if (e.target && e.target.id === 'profileAvatarInput') {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('图片大小不能超过 2MB', 'error');
      e.target.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      var dataUrl = ev.target.result;
      try {
        var u = JSON.parse(localStorage.getItem('cg_user') || '{}');
        u.avatar = dataUrl;
        localStorage.setItem('cg_user', JSON.stringify(u));
        loadProfileData();
        toast('✅ 头像上传成功', 'success');
      } catch (err) {
        toast('上传失败：' + err.message, 'error');
      }
    };
    reader.onerror = function () { toast('图片读取失败', 'error'); };
    reader.readAsDataURL(file);
  }
});

/* ==================== 3. 新建任务提交 ==================== */
function submitTask() {
  const name = $('#taskName').value.trim();
  if (!name) { toast('请填写任务名称', 'warn'); $('#taskName').focus(); return; }
  const cat = $('#taskCat').value;
  const pri = $('#taskPri').value;
  const days = $('#taskDays').value;
  const date = $('#taskDate').value;
  closeModal('modalTask');
  // 同步插入到今日计划
  addTodo(name, pri);
  toast(`✅ 任务已创建：${name}（目标 ${days} 天）`, 'success');
  // 清空
  $('#taskName').value = '';
}

/* ==================== 4. 登录操作（对接后端 localhost:3000） ====================
 * doLogin() 处理用户登录
 * 先尝试连接后端服务器（http://localhost:3000/api/auth/login）
 * 如果后端未启动，降级为「演示登录」（使用本地模拟数据）
 */
async function doLogin() {
  const email = $('#loginEmail').value.trim() || 'demo@chenguang.com';
  const pwd = $('#loginPwd').value || 'demo123456';
  if (!email || !pwd) { toast('邮箱和密码不能为空', 'warn'); return; }
  try {
    const r = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email, password: pwd }),
    });
    const data = await r.json();
    if (r.ok && data.token) {
      try { localStorage.setItem('cg_token', data.token); localStorage.setItem('cg_user', JSON.stringify(data.user)); } catch(_){}
      closeModal('modalLogin');
      toast(`欢迎回来，${data.user?.nickname || '同学'} 👋`, 'success');
    } else {
      toast('登录失败：' + (data.error?.message || data.message || '账号或密码错误'), 'error');
    }
  } catch (err) {
    try {
      localStorage.setItem('cg_token', 'demo_token_' + Date.now());
      localStorage.setItem('cg_user', JSON.stringify({ nickname: '自律王', email: email }));
      // 同步刷新顶部昵称
      const nameEl = document.querySelector('.wb-username');
      if (nameEl) nameEl.textContent = '自律王';
      const avatarEl = document.querySelector('.wb-avatar');
      if (avatarEl) avatarEl.textContent = '律';
    } catch(_) {}
    toast('后端未启动，演示登录成功 ✅', 'warn');
    closeModal('modalLogin');
  }
}

/* ==================== 5. 提醒通知 ==================== */
function openReminders() {
  // 动态生成 3 条 (基于用户真实数据：今日是否运动、今日任务是否有未完成)
  var tips = [];
  var sToday = $('#homeCardSport');
  var sportSub = $('#homeCardSportSub');
  var cur = ($('#todayProg').textContent || '0 / 0').split('/');
  var cDone = parseInt(cur[0]) || 0;
  var cTotal = parseInt(cur[1]) || 0;
  if (cDone === 0 && cTotal > 0) {
    tips.push({ msg: '📋 今日还有 ' + cTotal + ' 个任务未完成，加油💪', level: 'warn' });
  }
  if (sportSub && sportSub.textContent.indexOf('未开始') >= 0) {
    tips.push({ msg: '🏃 今天还没运动哦，起身活动 5 分钟吧', level: 'info' });
  }
  tips.push({ msg: '💧 记得每小时起身活动、喝水哦', level: 'info' });
  if (tips.length === 0) tips.push({ msg: '✨ 今日任务都搞定啦，继续保持！', level: 'success' });
  tips.forEach(function (t, i) {
    if (i === 0) toast(t.msg, t.level);
    else setTimeout(function () { toast(tips[i].msg, tips[i].level); }, 400 * (i + 1));
  });
}

/* ==================== 6. 每日小目标打卡动画 ==================== */
let dailyChecked = false;
function checkInGoal() {
  if (dailyChecked) { toast('今日目标已打卡，明天继续！💪', 'info'); return; }
  dailyChecked = true;
  const card = $('#dailyGoal');
  card.classList.add('done');
  card.querySelector('h3').textContent = '🎉 太棒啦！今日小目标已完成';
  card.querySelector('.small-label').textContent = '✅ 已打卡';
  const btn = card.querySelector('.ok');
  btn.textContent = '✓ 已完成今日目标';
  btn.style.pointerEvents = 'none';
  btn.style.opacity = 0.95;
  toast('🎯 每日小目标打卡成功！+10 经验', 'success');
  // 更新完成率 (动态读 #todayProg 当前文本)
  var cur = ($('#todayProg').textContent || '0 / 0').split('/');
  var curDone = parseInt(cur[0]) || 0;
  var curTotal = parseInt(cur[1]) || 0;
  var wDone = curDone + 1;
  $('#todoDone').textContent = wDone;
  // 刷新总完成率
  var rate = curTotal > 0 ? Math.round((wDone / curTotal) * 100) : 0;
  $('#todayProg').textContent = wDone + ' / ' + curTotal;
  var tBar = $('#todayProgBar');
  if (tBar) tBar.style.width = rate + '%';
}

/* ==================== 7. 周期切换（本周/本月/本学期） ====================
 * 注意：移除硬编码假数据，改为仅切换 UI 标签/提示，
 * 真实数据始终由 loadAllStats() 从后端/CGStore 加载。
 */
$('#periodSelect').addEventListener('change', function () {
  const period = this.value;
  // 仅更新 UI 提示文本（不覆盖真实数据）
  var hints = {
    week: '本周数据',
    month: '本月数据',
    term: '本学期数据'
  };
  toast('📊 已切换到 ' + (hints[period] || '本周') + ' 视图', 'info');
  // 可选：未来可在此处根据 period 参数重新调用 loadAllStats()
});

/* ==================== 8. 今日计划：待办列表（CGStore 双写） ====================
 * 今日计划功能：用户可以添加、完成、删除待办任务
 * 「双写」的意思是：数据同时保存到 CGStore（统一数据层）和 localStorage（旧存储）
 * 这样即使 CGStore 出问题，数据也不会丢失
 */
const defaultTodos = [];
let todos = [];

// 从 CGStore 加载待办（兼容旧格式）
function loadTodosFromStore() {
  if (window.CGStore) {
    try {
      var stored = CGStore.getTodosByDate(CGStore.today());
      // 转换为本地格式 { t, pri, done }
      if (Array.isArray(stored) && stored.length > 0) {
        return stored.map(function (item) {
          return {
            t: item.text || item.t || '未命名任务',
            pri: item.priority || item.pri || 'mid',
            done: !!item.done,
            id: item.id
          };
        });
      }
    } catch (_) {}
  }
  // 兜底：从旧 localStorage 键读取
  try {
    var old = JSON.parse(localStorage.getItem('cg_todos') || '[]');
    if (Array.isArray(old) && old.length > 0) return old;
  } catch (_) {}
  return [...defaultTodos];
}

// 保存待办到 CGStore（双向同步）
function saveTodoToStore(todoItem) {
  if (window.CGStore) {
    try {
      if (todoItem.id && typeof CGStore.updateTodo === 'function') {
        // 已有 id → 原地更新，避免 addTodo 生成重复记录
        CGStore.updateTodo(todoItem.id, {
          text: todoItem.t,
          date: CGStore.today(),
          done: todoItem.done,
          priority: todoItem.pri
        });
      } else {
        var rec = CGStore.addTodo({
          text: todoItem.t,
          date: CGStore.today(),
          done: todoItem.done,
          priority: todoItem.pri
        });
        // 回写生成的 id，后续切换/更新走 updateTodo
        if (rec && rec.id && !todoItem.id) todoItem.id = rec.id;
      }
    } catch (_) {}
  }
  // 兼容旧键
  try { localStorage.setItem('cg_todos', JSON.stringify(todos)); } catch (_) {}
}

function removeTodoFromStore(idOrIdx) {
  if (window.CGStore && idOrIdx != null) {
    try {
      if (typeof idOrIdx === 'number' && todos[idOrIdx]) {
        var local = todos[idOrIdx];
        if (local.id && typeof CGStore.removeTodo === 'function') {
          CGStore.removeTodo(local.id);
        } else {
          // 兜底：按文本+优先级匹配
          var allTodos = CGStore.getTodos();
          var target = allTodos.find(function (t) {
            return t.text === local.t && t.priority === local.pri;
          });
          if (target && target.id && typeof CGStore.removeTodo === 'function') {
            CGStore.removeTodo(target.id);
          }
        }
      }
    } catch (_) {}
  }
  try { localStorage.setItem('cg_todos', JSON.stringify(todos)); } catch (_) {}
}

// 初始化：从 CGStore 加载待办
todos = loadTodosFromStore();

function renderTodos() {
  const host = $('#todoItems');
  if (!host) return;
  host.innerHTML = '';
  if (todos.length === 0) {
    if ($('#todoTotal')) $('#todoTotal').textContent = '0';
    if ($('#todoDone')) $('#todoDone').textContent = '0';
    host.innerHTML = '<div style="text-align:center;padding:30px;color:var(--fg-muted);">暂无计划，添加今天的第一个小目标吧 ✨</div>';
    return;
  }
  todos.forEach((it, i) => {
    const el = document.createElement('div');
    el.className = 'todo-item' + (it.done ? ' done' : '');
    el.innerHTML = `
      <div class="t-check" title="切换完成">${it.done ? '✓' : ''}</div>
      <div class="t-text"></div>
      <div class="t-priority ${it.pri}">${it.pri === 'high' ? '高优先' : it.pri === 'mid' ? '中优先' : '低优先'}</div>
      <div class="t-del" title="删除">🗑</div>`;
    el.querySelector('.t-text').textContent = it.t;
    el.querySelector('.t-check').addEventListener('click', () => toggleTodo(i));
    el.querySelector('.t-del').addEventListener('click', () => removeTodo(i));
    host.appendChild(el);
  });
  $('#todoTotal').textContent = todos.length;
  $('#todoDone').textContent = todos.filter(t => t.done).length;
}
function toggleTodo(i) {
  todos[i].done = !todos[i].done;
  saveTodoToStore(todos[i]); // 同步到 CGStore
  renderTodos();
  toast(todos[i].done ? '✅ 完成：' + todos[i].t : '↩️ 恢复：' + todos[i].t, todos[i].done ? 'success' : 'info');
}
function removeTodo(i) {
  const t = todos[i];
  removeTodoFromStore(i); // 从 CGStore 移除
  todos.splice(i, 1);
  renderTodos();
  toast('🗑 已删除：' + t.t, 'info');
}
function addTodo(text, pri = 'mid') {
  var newItem = { t: text, pri: pri, done: false };
  todos.unshift(newItem);
  saveTodoToStore(newItem); // 同步到 CGStore
  if ($('#todoItems')) renderTodos();
}
$('#todoAddBtn')?.addEventListener('click', submitTodoInput);
$('#todoInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitTodoInput(); });
function submitTodoInput() {
  const inp = $('#todoInput');
  const t = inp.value.trim();
  if (!t) { toast('请输入任务内容', 'warn'); return; }
  addTodo(t, 'mid');
  inp.value = '';
  toast('➕ 已添加任务：' + t, 'success');
}
renderTodos();

/* ==================== 9. 数据卡片点击（跳转对应模块） ==================== */
$$('.card[data-card]').forEach(c => {
  c.addEventListener('click', () => {
    const map = { course: 'course', reading: 'reading', english: 'english', sport: 'sport' };
    const key = map[c.dataset.card];
    if (key) switchView(key);
  });
});

/* ==================== 10. 管理面板开关 ==================== */
$$('[data-toggle]').forEach(t => {
  t.addEventListener('click', () => {
    const on = t.classList.toggle('on');
    toast(on ? '✅ 已开启' : '⏸ 已关闭', 'info');
  });
});

/* ==================== 11. 主题切换（顶部日期按钮） ==================== */
const themes = [
  [ // 晨光琥珀（默认，与 CSS 初始背景一致）
    ['1200px 800px at 15% 10%', 'rgba(251, 191, 36, 0.32)'],
    ['900px 700px at 85% 20%', 'rgba(249, 115, 22, 0.26)'],
    ['1000px 800px at 50% 100%', 'rgba(244, 114, 182, 0.16)'],
    ['#fdf7ee 0%, #faf0dd 38%, #f7e6cd 68%, #f3ddc0 100%']
  ],
  [ // 青晨薄荷
    ['1200px 800px at 15% 10%', 'rgba(52, 211, 153, 0.28)'],
    ['900px 700px at 85% 20%', 'rgba(45, 212, 191, 0.24)'],
    ['1000px 800px at 50% 100%', 'rgba(147, 197, 253, 0.25)'],
    ['#f2faf5 0%, #ecf7f0 40%, #e8f4ee 70%, #e2efe8 100%']
  ],
  [ // 暮色玫瑰
    ['1200px 800px at 15% 10%', 'rgba(251, 113, 133, 0.26)'],
    ['900px 700px at 85% 20%', 'rgba(249, 115, 22, 0.22)'],
    ['1000px 800px at 50% 100%', 'rgba(196, 181, 253, 0.28)'],
    ['#fdf3f1 0%, #fbeee9 40%, #f8e9ea 70%, #f5e4ec 100%']
  ],
];
let themeIdx = 0;
function cycleTheme() {
  themeIdx = (themeIdx + 1) % themes.length;
  const T = themes[themeIdx];
  $('.bg-layer').style.background = `
    radial-gradient(${T[0][0]}, ${T[0][1]}, transparent 60%),
    radial-gradient(${T[1][0]}, ${T[1][1]}, transparent 55%),
    radial-gradient(${T[2][0]}, ${T[2][1]}, transparent 55%),
    linear-gradient(135deg, ${T[3]})
  `;
  const names = ['晨光琥珀', '青晨薄荷', '暮色玫瑰'];
  toast('🎨 主题切换：' + names[themeIdx], 'success');
}
$('#themeSelect')?.addEventListener('change', function () {
  themeIdx = this.selectedIndex; cycleTheme();
});

/* ==================== 12. 课程、书籍、运动数据管理 ====================
 * 这个模块实现了课程/书籍/运动的 CRUD（增删改查）功能
 * CRUD 是数据库术语：
 *   - Create（增）：添加新记录
 *   - Read（查）：读取/显示记录
 *   - Update（改）：修改已有记录
 *   - Delete（删）：删除记录
 */

// 数据存储 key
const STORAGE_KEYS = {
  courses: 'cg_courses',
  books: 'cg_books',
  sports: 'cg_sports',
  words: 'cg_words',
  wordProgress: 'cg_word_progress'
};

// 默认数据 — 全部空数组, 让新用户从 0 开始, 不会看到任何演示数据
const defaultCourses = [];
const defaultBooks = [];
const defaultSports = [];

// 单词库（内置 50 个常用单词）
const wordBank = [
  { word: 'abandon', meaning: 'v. 放弃，抛弃' },
  { word: 'ability', meaning: 'n. 能力，才能' },
  { word: 'absolute', meaning: 'adj. 绝对的，完全的' },
  { word: 'abstract', meaning: 'adj. 抽象的 n. 摘要' },
  { word: 'academic', meaning: 'adj. 学术的 n. 学者' },
  { word: 'accept', meaning: 'v. 接受，承认' },
  { word: 'achieve', meaning: 'v. 实现，达到' },
  { word: 'acquire', meaning: 'v. 获得，取得' },
  { word: 'adapt', meaning: 'v. 适应，改编' },
  { word: 'adequate', meaning: 'adj. 充足的，适当的' },
  { word: 'analyze', meaning: 'v. 分析，解析' },
  { word: 'approach', meaning: 'n. 方法，途径' },
  { word: 'benefit', meaning: 'n. 利益 v. 受益' },
  { word: 'capable', meaning: 'adj. 有能力的' },
  { word: 'comprehensive', meaning: 'adj. 全面的，综合的' },
  { word: 'concentrate', meaning: 'v. 集中，专注' },
  { word: 'convince', meaning: 'v. 说服，使相信' },
  { word: 'critical', meaning: 'adj. 关键的，批评的' },
  { word: 'curriculum', meaning: 'n. 课程' },
  { word: 'demonstrate', meaning: 'v. 证明，演示' },
  { word: 'efficient', meaning: 'adj. 高效的' },
  { word: 'emphasize', meaning: 'v. 强调' },
  { word: 'evaluate', meaning: 'v. 评估，评价' },
  { word: 'fundamental', meaning: 'adj. 基本的，根本的' },
  { word: 'generate', meaning: 'v. 产生，生成' },
  { word: 'implement', meaning: 'v. 实施，执行' },
  { word: 'influence', meaning: 'n. 影响力 v. 影响' },
  { word: 'integrate', meaning: 'v. 整合，集成' },
  { word: 'maintain', meaning: 'v. 维持，保持' },
  { word: 'negotiate', meaning: 'v. 谈判，协商' },
  { word: 'obtain', meaning: 'v. 获得，得到' },
  { word: 'participate', meaning: 'v. 参与' },
  { word: 'potential', meaning: 'adj. 潜在的 n. 潜力' },
  { word: 'recognize', meaning: 'v. 认出，承认' },
  { word: 'significant', meaning: 'adj. 重要的，显著的' },
  { word: 'strategy', meaning: 'n. 策略，战略' },
  { word: 'sufficient', meaning: 'adj. 足够的，充足的' },
  { word: 'synthesize', meaning: 'v. 综合，合成' },
  { word: 'transform', meaning: 'v. 转变，转换' },
  { word: 'understand', meaning: 'v. 理解，明白' },
  { word: 'utilize', meaning: 'v. 利用' },
  { word: 'valuable', meaning: 'adj. 有价值的' },
  { word: 'volume', meaning: 'n. 体积，音量' },
  { word: 'witness', meaning: 'n. 目击者 v. 目击' },
  { word: 'yield', meaning: 'v. 产生，屈服 n. 产量' }
];

// 从统一数据层加载数据（兼容旧 cg_* 读取接口）
function loadData(key, defaults) {
  if (window.CGStore) {
    var B = window.__CG_BRIDGE__;
    if (key === 'cg_courses') return B.toLegacyCourses(CGStore.getCourses());
    if (key === 'cg_books')   return B.toLegacyBooks(CGStore.getReadings());
    if (key === 'cg_sports')  return B.toLegacySports(CGStore.getSports());
    // 其他键仍走原生 localStorage
    try { var d = localStorage.getItem(key); if (d) return JSON.parse(d); } catch (_) {}
    try { localStorage.setItem(key, JSON.stringify(defaults)); } catch (_) {}
    return [...defaults];
  }
  try {
    const data = localStorage.getItem(key);
    if (data) return JSON.parse(data);
  } catch (_) {}
  localStorage.setItem(key, JSON.stringify(defaults));
  return [...defaults];
}

function saveData(key, data) {
  if (window.CGStore) {
    var B = window.__CG_BRIDGE__;
    // 只合并对应集合字段；CGStore.set 是整体替换，会把 user/todos/checkins 等其它数据清空
    if (key === 'cg_courses') { CGStore.merge({ courses: B.toStoreCourses(data) }); return; }
    if (key === 'cg_books')   { CGStore.merge({ readings: B.toStoreBooks(data) }); return; }
    if (key === 'cg_sports')  { CGStore.merge({ sports: B.toStoreSports(data) }); return; }
  }
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (_) {}
}

function getNextId(data) {
  // 兼容字符串 id（uuid）时退化为时间戳，避免 NaN
  var max = 0;
  (data || []).forEach(function (d) {
    var n = typeof d.id === 'number' ? d.id : (parseInt(d.id, 10) || 0);
    if (n > max) max = n;
  });
  return max + 1;
}

// 加载所有数据（来自统一数据层）
let courses = loadData(STORAGE_KEYS.courses, defaultCourses);
let books = loadData(STORAGE_KEYS.books, defaultBooks);
let sports = loadData(STORAGE_KEYS.sports, defaultSports);

// 跨页面 / 跨标签页实时同步：统一数据层写后，重新拉取并刷新
if (window.CGStore && window.CGStore.onUpdate) {
  CGStore.onUpdate(function () {
    courses = toLegacyBridge('cg_courses');
    books   = toLegacyBridge('cg_books');
    sports  = toLegacyBridge('cg_sports');
    // 待办面板同步刷新（工作台添加的任务实时可见）
    try { todos = loadTodosFromStore(); } catch (_) {}
    try {
      if (typeof renderCourses === 'function') renderCourses();
      if (typeof renderBooks === 'function') renderBooks();
      if (typeof renderSports === 'function') renderSports();
      if (typeof renderTodos === 'function') renderTodos();
      if (typeof renderProgressList === 'function') renderProgressList();
      if (typeof loadAllStats === 'function') loadAllStats();
    } catch (_) {}
  });
}
function toLegacyBridge(key) {
  var B = window.__CG_BRIDGE__;
  if (key === 'cg_courses') return B.toLegacyCourses(CGStore.getCourses());
  if (key === 'cg_books')   return B.toLegacyBooks(CGStore.getReadings());
  if (key === 'cg_sports')  return B.toLegacySports(CGStore.getSports());
  return [];
}

/* ========== 渲染课程列表 ========== */
function renderCourses() {
  const host = $('#courseList');
  const empty = $('#courseListEmpty');
  if (!host) return;
  host.innerHTML = '';

  if (courses.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  courses.forEach((c, i) => {
    const pct = Math.round((c.learned / c.total) * 100);
    const el = document.createElement('div');
    el.className = 'course-item';
    el.style.cssText = 'padding:14px 16px;border-radius:12px;background:rgba(255,255,255,.6);border:1px solid var(--fg-border);display:flex;align-items:center;gap:14px;';
    el.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:600;color:var(--fg-text);font-size:14px;">${escapeHtml(c.name)}</div>
        <div style="font-size:12px;color:var(--fg-muted);margin-top:4px;">共 ${c.total} 章 · 已学 ${c.learned} 章</div>
        <div style="margin-top:8px;height:6px;background:rgba(0,0,0,.08);border-radius:999px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#fbbf24,#f59e0b);border-radius:999px;transition:width .3s;"></div>
        </div>
      </div>
      <div style="text-align:center;min-width:70px;">
        <div style="font-size:18px;font-weight:700;color:${pct >= 100 ? 'var(--success)' : 'var(--accent)'};">${pct}%</div>
        <div style="display:flex;gap:4px;justify-content:center;margin-top:4px;">
          <button style="font-size:11px;color:var(--accent);background:none;cursor:pointer;" data-course-edit="${i}">✏️ 编辑</button>
          <button style="font-size:11px;color:var(--fg-muted);background:none;cursor:pointer;" data-course-del="${i}">🗑 删除</button>
        </div>
      </div>
    `;
    host.appendChild(el);
  });
  
  // 绑定编辑和删除事件
  host.querySelectorAll('[data-course-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-course-edit'));
      editCourse(idx);
    });
  });
  host.querySelectorAll('[data-course-del]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-course-del'));
      deleteCourse(idx);
    });
  });
}

async function deleteCourse(idx) {
  const confirmed = await showConfirm('删除课程', '确定要删除这门课程吗？此操作不可撤销。');
  if (confirmed) {
    const c = courses[idx];
    if (window.CGStore && c && c.id != null) {
      CGStore.removeCourse(c.id); // 真源删除 → 同步派发 chenguang:update 刷新
    } else {
      courses.splice(idx, 1);
      saveData(STORAGE_KEYS.courses, courses);
    }
    renderCourses();
    if (typeof renderProgressList === 'function') renderProgressList();
    if (typeof loadAllStats === 'function') loadAllStats(); // 同步首页「课程进度」卡片与课程进度模块
    toast('🗑 课程已删除', 'info');
  }
}

function editCourse(idx) {
  const c = courses[idx];
  if (!c) return;
  $('#editCourseName').value = c.name;
  $('#editCourseTotal').value = c.total;
  $('#editCourseLearned').value = c.learned;
  openModal('modalEditCourse');
  
  // 移除旧的监听器
  const btn = $('#updateCourseBtn');
  btn.replaceWith(btn.cloneNode(true));
  const newBtn = $('#updateCourseBtn');
  newBtn.addEventListener('click', () => {
    const name = $('#editCourseName').value.trim();
    const total = parseInt($('#editCourseTotal').value) || 0;
    const learned = parseInt($('#editCourseLearned').value) || 0;
    
    if (!name) { toast('请输入课程名称', 'warn'); return; }
    if (total < 1) { toast('总章节数必须大于 0', 'warn'); return; }
    if (learned > total) { toast('已学章节不能超过总章节数', 'warn'); return; }

    // ✅ 直接写入统一数据层真源（CGStore），persist() 会同步派发
    //    chenguang:update，页面订阅者立即重新桥接并 renderCourses()，零延迟。
    if (window.CGStore && c.id != null) {
      var progress = total > 0 ? Math.round((learned / total) * 100) : 0;
      var status = progress >= 100 ? 'done' : (progress > 0 ? 'doing' : 'todo');
      CGStore.updateCourse(c.id, {
        name: name,
        totalChapters: total,
        learnedChapters: learned,
        progress: progress,
        status: status
      });
    } else {
      // 兜底：旧局部数组（未加载到 CGStore 时）
      courses[idx] = { ...c, name, total, learned };
      saveData(STORAGE_KEYS.courses, courses);
    }
    // ✅ 关键：立即同步刷新，无任何延迟 / setTimeout
    renderCourses();
    if (typeof renderProgressList === 'function') renderProgressList();
    if (typeof loadAllStats === 'function') loadAllStats(); // 同步首页「课程进度」卡片
    closeModal('modalEditCourse');
    toast('✅ 课程进度已更新', 'success');
  });
}

/* ========== 渲染书籍列表 ========== */
function renderBooks() {
  const host = $('#bookList');
  if (!host) return;
  host.innerHTML = '';
  
  if (books.length === 0) {
    host.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--fg-muted);">暂无书籍，点击上方按钮添加</div>';
    return;
  }
  
  const bookIcons = { '技术': '📘', '文学': '📕', '商业': '📗', '心理': '📙', '传记': '📓', '其他': '📔' };
  
  books.forEach((b, i) => {
    const pct = Math.round((b.read / b.total) * 100);
    const el = document.createElement('div');
    el.className = 'book-item';
    el.style.cssText = 'padding:16px;border-radius:12px;background:rgba(255,255,255,.6);border:1px solid var(--fg-border);position:relative;';
    el.innerHTML = `
      <div style="font-size:32px;text-align:center;margin-bottom:8px;">${bookIcons[b.category] || '📔'}</div>
      <div style="font-weight:600;color:var(--fg-text);font-size:14px;text-align:center;">${escapeHtml(b.name)}</div>
      <div style="font-size:11px;color:var(--fg-muted);text-align:center;margin-top:4px;">进度 ${b.read} / ${b.total} 页</div>
      <div style="margin-top:10px;height:5px;background:rgba(0,0,0,.08);border-radius:999px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#10b981,#06b6d4);border-radius:999px;"></div>
      </div>
      <div style="text-align:center;margin-top:8px;display:flex;gap:6px;justify-content:center;align-items:center;">
        <span style="font-size:12px;font-weight:600;color:${pct >= 100 ? 'var(--success)' : 'var(--accent-3)'};">${pct}%</span>
        <button style="font-size:11px;color:var(--accent);background:none;cursor:pointer;" data-book-edit="${i}">✏️</button>
        <button style="font-size:11px;color:var(--fg-muted);background:none;cursor:pointer;" data-book-del="${i}">🗑</button>
      </div>
    `;
    host.appendChild(el);
  });
  
  // 绑定编辑和删除事件
  host.querySelectorAll('[data-book-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-book-edit'));
      editBook(idx);
    });
  });
  host.querySelectorAll('[data-book-del]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-book-del'));
      deleteBook(idx);
    });
  });
}

async function deleteBook(idx) {
  const confirmed = await showConfirm('删除书籍', '确定要删除这本书吗？此操作不可撤销。');
  if (confirmed) {
    const b = books[idx];
    if (window.CGStore && b && b.id != null) {
      CGStore.removeReading(b.id); // 真源删除 → 同步派发 chenguang:update
    } else {
      books.splice(idx, 1);
      saveData(STORAGE_KEYS.books, books);
    }
    renderBooks();
    if (typeof loadAllStats === 'function') loadAllStats(); // 同步首页「累计阅读」卡片
    toast('🗑 书籍已删除', 'info');
  }
}

function editBook(idx) {
  const b = books[idx];
  if (!b) return;
  $('#editBookName').value = b.name;
  $('#editBookTotal').value = b.total;
  $('#editBookRead').value = b.read;
  openModal('modalEditBook');
  
  // 移除旧的监听器
  const btn = $('#updateBookBtn');
  btn.replaceWith(btn.cloneNode(true));
  const newBtn = $('#updateBookBtn');
  newBtn.addEventListener('click', () => {
    const name = $('#editBookName').value.trim();
    const total = parseInt($('#editBookTotal').value) || 0;
    const read = parseInt($('#editBookRead').value) || 0;
    
    if (!name) { toast('请输入书名', 'warn'); return; }
    if (total < 1) { toast('总页数必须大于 0', 'warn'); return; }
    if (read > total) { toast('已读页数不能超过总页数', 'warn'); return; }

    // ✅ 直接写入统一数据层真源（CGStore.readings），与 renderBooks 读同一字段
    if (window.CGStore && b.id != null) {
      CGStore.updateReading(b.id, {
        bookName: name,
        pages: read,
        totalPages: total
      });
    } else {
      books[idx] = { ...b, name, total, read };
      saveData(STORAGE_KEYS.books, books);
    }
    // ✅ 立即同步刷新
    renderBooks();
    if (typeof loadAllStats === 'function') loadAllStats(); // 同步首页「累计阅读」卡
    closeModal('modalEditBook');
    toast('✅ 书籍进度已更新', 'success');
  });
}

/* ========== 渲染运动列表 ========== */
function renderSports() {
  const host = $('#sportList');
  if (!host) return;
  host.innerHTML = '';
  
  if (sports.length === 0) {
    host.innerHTML = '<div style="text-align:center;padding:30px;color:var(--fg-muted);">暂无运动记录，点击上方按钮添加</div>';
    $('#sportSummary').textContent = '0 项';
    $('#sportCalTotal').textContent = '0';
    $('#sportMinTotal').textContent = '0';
    return;
  }
  
  // 计算今日运动（按日期过滤）
  const today = new Date().toISOString().split('T')[0];
  const todaySports = sports.filter(s => s.date === today);
  
  // 如果今日没有记录，显示最近的记录
  const displaySports = todaySports.length > 0 ? todaySports : sports.slice(-5);
  
  let totalCal = 0, totalMin = 0;
  displaySports.forEach((s, i) => {
    totalCal += s.cal;
    totalMin += s.min;
    
    const el = document.createElement('div');
    el.className = 'sport-item';
    el.style.cssText = 'padding:12px 16px;border-radius:12px;background:rgba(255,255,255,.6);border:1px solid var(--fg-border);display:flex;align-items:center;gap:14px;';
    el.innerHTML = `
      <div style="flex:1;display:flex;align-items:center;gap:12px;">
        <div style="font-size:24px;">${getSportIcon(s.type)}</div>
        <div>
          <div style="font-weight:600;color:var(--fg-text);font-size:14px;">${s.type}</div>
          <div style="font-size:12px;color:var(--fg-muted);">${s.date}</div>
        </div>
      </div>
      <div style="display:flex;gap:16px;">
        <div style="text-align:center;">
          <div style="font-size:16px;font-weight:700;color:var(--warn);">${s.cal}</div>
          <div style="font-size:10px;color:var(--fg-muted);">千卡</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:16px;font-weight:700;color:var(--accent);">${s.min}</div>
          <div style="font-size:10px;color:var(--fg-muted);">分钟</div>
        </div>
      </div>
      <button style="font-size:14px;color:var(--fg-muted);background:none;cursor:pointer;" data-sport-id="${s.id}">🗑</button>    `;
    host.appendChild(el);
  });
  
  // 更新汇总
  $('#sportSummary').textContent = displaySports.length + ' 项';
  $('#sportCalTotal').textContent = totalCal;
  $('#sportMinTotal').textContent = totalMin;
  
  // 绑定删除事件
  host.querySelectorAll('[data-sport-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-sport-id');
      deleteSport(id);
    });
  });
}

function getSportIcon(type) {
  const icons = { '跑步': '🏃', '骑行': '🚴', '游泳': '🏊', '健身': '💪', '瑜伽': '🧘', '跳绳': '🪢', '球类': '⚽', '其他': '📌' };
  return icons[type] || '📌';
}

async function deleteSport(id) {
  const confirmed = await showConfirm('删除运动记录', '确定要删除这条运动记录吗？此操作不可撤销。');
  if (confirmed) {
    // ✅ 直接删除统一数据层真源（CGStore），避免 saveData 旧代理整体替换清空其它数据
    if (window.CGStore && id) {
      CGStore.removeSport(id);
    } else {
      sports = sports.filter(s => String(s.id) !== String(id));
      saveData(STORAGE_KEYS.sports, sports);
    }
    renderSports();
    if (typeof loadAllStats === 'function') loadAllStats(); // 同步首页「每日运动」卡
    toast('🗑 运动记录已删除', 'info');
  }
}

/* ========== 课程添加逻辑 ========== */
function initCourseAdd() {
  $('#addCourseBtn')?.addEventListener('click', () => {
    $('#courseName').value = '';
    $('#courseTotal').value = 20;
    $('#courseLearned').value = 0;
    openModal('modalAddCourse');
  });
  
  $('#saveCourseBtn')?.addEventListener('click', () => {
    const name = $('#courseName').value.trim();
    const total = parseInt($('#courseTotal').value) || 0;
    const learned = parseInt($('#courseLearned').value) || 0;
    
    if (!name) { toast('请输入课程名称', 'warn'); return; }
    if (total < 1) { toast('总章节数必须大于 0', 'warn'); return; }
    if (learned > total) { toast('已学章节不能超过总章节数', 'warn'); return; }

    const progress = total > 0 ? Math.round((learned / total) * 100) : 0;
    const status = progress >= 100 ? 'done' : (progress > 0 ? 'doing' : 'todo');

    // ✅ 直接写入统一数据层真源（CGStore），同步派发 chenguang:update 即时刷新
    if (window.CGStore) {
      CGStore.addCourse({
        name: name,
        totalChapters: total,
        learnedChapters: learned,
        progress: progress,
        status: status
      });
    } else {
      courses.push({ id: getNextId(courses), name, total, learned });
      saveData(STORAGE_KEYS.courses, courses);
    }
    // ✅ 关键：立即同步刷新，无任何延迟 / setTimeout
    renderCourses();
    if (typeof renderProgressList === 'function') renderProgressList();
    if (typeof loadAllStats === 'function') loadAllStats();
    closeModal('modalAddCourse');
    toast('✅ 课程已添加：' + name, 'success');
  });
}

/* ========== 书籍添加逻辑 ========== */
function initBookAdd() {
  $('#addBookBtn')?.addEventListener('click', () => {
    $('#bookName').value = '';
    $('#bookTotal').value = 300;
    $('#bookRead').value = 0;
    $('#bookCategory').value = '技术';
    openModal('modalAddBook');
  });
  
  $('#saveBookBtn')?.addEventListener('click', () => {
    const name = $('#bookName').value.trim();
    const total = parseInt($('#bookTotal').value) || 0;
    const read = parseInt($('#bookRead').value) || 0;
    const category = $('#bookCategory').value;
    
    if (!name) { toast('请输入书名', 'warn'); return; }
    if (total < 1) { toast('总页数必须大于 0', 'warn'); return; }
    if (read > total) { toast('已读页数不能超过总页数', 'warn'); return; }

    // ✅ 直接写入统一数据层真源（CGStore.readings），保存/渲染同一字段，
    //    避免 saveData 代理误用 .books 字段导致 (1) UI 不显示 (2) CGStore.set
    //    整体替换破坏 courses/sports/todos 等其它数据。
    var _today = (window.CGStore && CGStore.today) ? CGStore.today() : new Date().toISOString().split('T')[0];
    if (window.CGStore) {
      CGStore.addReading({
        date: _today,
        bookName: name,
        pages: read,
        totalPages: total
      });
    } else {
      books.push({ id: getNextId(books), name, total, read, category });
      saveData(STORAGE_KEYS.books, books);
    }
    // ✅ 立即同步刷新，无任何延迟 / setTimeout
    renderBooks();
    if (typeof loadAllStats === 'function') loadAllStats(); // 同步首页「累计阅读」卡
    closeModal('modalAddBook');
    toast('✅ 书籍已添加：' + name, 'success');
  });
}

/* ========== 运动添加逻辑 ========== */
function initSportAdd() {
  $('#addSportBtn')?.addEventListener('click', () => {
    $('#sportType').value = '跑步';
    $('#sportCal').value = 100;
    $('#sportMin').value = 30;
    openModal('modalAddSport');
  });
  
  $('#saveSportBtn')?.addEventListener('click', () => {
    const type = $('#sportType').value;
    const cal = parseInt($('#sportCal').value) || 0;
    const min = parseInt($('#sportMin').value) || 0;
    
    if (cal < 1) { toast('消耗必须大于 0', 'warn'); return; }
    if (min < 1) { toast('时长必须大于 0', 'warn'); return; }
    
    // ✅ 直接写入统一数据层真源（CGStore.sports），避免 saveData 旧代理
    //    CGStore.set 整体替换导致课程/书籍/待办等数据被清空。
    if (window.CGStore) {
      CGStore.addSport({
        date: CGStore.today(),
        name: type,
        type: type,
        calories: cal,
        duration: min
      });
    } else {
      sports.push({
        id: getNextId(sports),
        type,
        cal,
        min,
        date: new Date().toISOString().split('T')[0]
      });
      saveData(STORAGE_KEYS.sports, sports);
    }
    // ✅ 立即同步刷新
    renderSports();
    if (typeof loadAllStats === 'function') loadAllStats(); // 同步首页「每日运动」卡
    closeModal('modalAddSport');
    toast(`✅ 运动已记录：${type} ${cal}千卡 / ${min}分钟`, 'success');
  });
}

/* ========== 英语学习功能 ========== */
// 单词背诵功能：从内置单词库随机选取 20 个单词，用户逐个拼写
// wordSession 保存当前学习会话的状态（当前学到第几个、答对了几个等）
let wordSession = null; // 当前单词学习会话

function startWordLearning() {
  // 从单词库随机选取 20 个单词
  const shuffled = [...wordBank].sort(() => Math.random() - 0.5);
  const selectedWords = shuffled.slice(0, 20);
  
  wordSession = {
    words: selectedWords,
    currentIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    skippedCount: 0,
    startTime: Date.now()
  };
  
  // 显示学习面板
  const panel = $('#wordStudyPanel');
  if (panel) panel.style.display = 'block';
  
  showCurrentWord();
  updateWordProgress();
  toast('📚 开始今日单词学习！加油 💪', 'success');
}

function showCurrentWord() {
  if (!wordSession) return;
  
  const { words, currentIndex } = wordSession;
  if (currentIndex >= words.length) {
    endWordLearning();
    return;
  }
  
  const word = words[currentIndex];
  $('#currentWord').textContent = word.word;
  $('#currentMeaning').textContent = word.meaning;
  $('#wordInput').value = '';
  $('#wordInput').focus();
  $('#wordIndexTag').textContent = `${currentIndex + 1} / ${words.length}`;
}

function updateWordProgress() {
  if (!wordSession) return;
  const { currentIndex, words, correctCount } = wordSession;
  $('#wordProgress').textContent = `${correctCount} / ${words.length}`;
  $('#wordTargetTag').textContent = `${words.length} 个`;
  $('#wordStatus').textContent = `已学 ${currentIndex} 个，正确 ${correctCount} 个`;
  
  // 更新累计统计
  const total = parseInt($('#totalWords')?.textContent || '0') + correctCount;
  $('#totalWords').textContent = total;
  
  const accuracy = wordSession.currentIndex > 0 
    ? Math.round((wordSession.correctCount / wordSession.currentIndex) * 100) 
    : 0;
  $('#accuracy').textContent = accuracy + '%';
}

function submitWord() {
  if (!wordSession) return;
  
  const input = $('#wordInput').value.trim().toLowerCase();
  const { words, currentIndex } = wordSession;
  
  if (!input) { toast('请输入单词', 'warn'); return; }
  
  const correctWord = words[currentIndex].word.toLowerCase();
  
  if (input === correctWord) {
    wordSession.correctCount++;
    toast('✅ 正确！继续加油', 'success');
  } else {
    wordSession.wrongCount++;
    toast(`❌ 错误，正确答案是 ${correctWord}`, 'error');
  }
  
  wordSession.currentIndex++;
  updateWordProgress();
  
  setTimeout(() => {
    if (wordSession && wordSession.currentIndex < wordSession.words.length) {
      showCurrentWord();
    } else {
      endWordLearning();
    }
  }, 500);
}

function skipWord() {
  if (!wordSession) return;
  
  wordSession.skippedCount++;
  toast('⏭ 已跳过', 'info');
  wordSession.currentIndex++;
  updateWordProgress();
  showCurrentWord();
}

function endWordLearning() {
  if (!wordSession) return;

  const { words, correctCount, wrongCount, skippedCount, startTime } = wordSession;
  const duration = Math.round((Date.now() - startTime) / 1000);

  $('#wordStudyPanel').style.display = 'none';

  // 持久化到统一数据层（云端同步 + 工作台/统计页共享）
  const mins = Math.max(1, Math.round(duration / 60));
  try {
    if (window.CGStore && correctCount > 0) {
      CGStore.addEnglish({ date: CGStore.today(), words: correctCount, minutes: mins });
      if (typeof loadAllStats === 'function') loadAllStats();
    }
  } catch (_) {}

  let msg = `📊 本次学习完成！`;
  msg += `\n总数: ${words.length}`;
  msg += `\n✅ 正确: ${correctCount}`;
  msg += `\n❌ 错误: ${wrongCount}`;
  msg += `\n⏭ 跳过: ${skippedCount}`;
  msg += `\n⏱ 用时: ${duration} 秒`;

  // 更新累计统计
  $('#listenMin').textContent = parseInt($('#listenMin')?.textContent || '0') + Math.round(duration / 60);

  toast(msg.replace(/\n/g, ' | '), 'success');
  $('#wordStatus').textContent = '今日学习完成！明天继续 💪';

  wordSession = null;
}

/* ========== 初始化所有功能 ========== */
// initFeatures() 负责渲染所有数据列表、绑定所有按钮事件
// 在 safeInit() 成功后调用
function initFeatures() {
  // 渲染数据列表
  renderCourses();
  renderBooks();
  renderSports();
  if (typeof renderProgressList === 'function') renderProgressList();
  
  // 绑定添加功能
  initCourseAdd();
  initBookAdd();
  initSportAdd();
  
  // 绑定英语学习按钮
  $('#startWordsBtn')?.addEventListener('click', startWordLearning);
  $('#submitWordBtn')?.addEventListener('click', submitWord);
  $('#skipWordBtn')?.addEventListener('click', skipWord);
  $('#endWordBtn')?.addEventListener('click', endWordLearning);
  $('#wordInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitWord();
  });
}

// 在 safeInit 成功后初始化功能
initFeatures();

// ===== 跨页面导航定位（工作台侧边栏 → 对应视图/弹窗） =====
// #course / #settings → 切换到对应视图；#profile → 打开个人中心弹窗
try {
  var navHash = (location.hash || '').replace('#', '');
  if (navHash === 'profile') {
    if (typeof openProfileModal === 'function') openProfileModal();
  } else if (navHash && document.getElementById('view-' + navHash)) {
    switchView(navHash);
  }
  if (navHash) history.replaceState(null, '', location.pathname);
} catch (_) {}

} // 闭合 init() 函数

/* end of init() */
// ==================== Service Worker 注册 ====================
// 在页面加载后注册 Service Worker，用于缓存资源实现离线访问
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').catch(function (e) {
      console.warn('[SW] ע��ʧ��:', e);
    });
  });
}
