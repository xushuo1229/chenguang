// ====================================================================
// 晨光自律台 · 工作台页面 (Workbench Page)
// ====================================================================
// 这是用户登录后的主页面，功能包括：
//   - 今日计划（待办任务的增删改查）
//   - 课程管理（添加/编辑/删除课程，查看学习进度）
//   - 书籍管理（添加/编辑/删除书籍，查看阅读进度）
//   - 运动记录（记录每日运动，统计卡路里）
//   - 英语学习记录
//   - 专注计时器（番茄钟功能，可选 15/25/45 分钟）
//   - 用户成长数据概览
//   - 侧边栏导航（首页/课程/管理/个人中心）
//
// 整个文件被 IIFE（立即执行函数表达式）包裹，
// 内部变量不会污染全局作用域。
// ====================================================================

// ==================== 模块导入 ====================
// 以下 import 语句导入公共工具和模块，类似 Python 的 import：
//   - dom.js    → DOM 操作辅助函数（如 $ = getElementById 简写、setText、$$ 等）
//   - date.js   → 日期格式化函数（如 fmtDate）
//   - toast.js  → Toast 轻提示组件（在页面右下角弹出短消息）
//   - modal.js  → Modal 弹窗组件（openModal / closeModal）
//   - apiClient → API 客户端，用于和后端服务器通信
//   - store.js  → CGStore 本地数据存储层（管理所有数据的读写）
//   - sync.js   → 数据同步模块，实现多设备间数据同步
import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/ui/modal.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';

  // ============================================================
  // IIFE（立即执行函数表达式）— 整个工作台的代码都在这里面
  // ============================================================
  // 格式：(function() { ... })()
  //   - 外层括号 () 把 function 包成「表达式」
  //   - 末尾 () 立即执行这个函数
  //   - 好处：里面 var 声明的变量都是「局部变量」，不会和其他脚本冲突
  //   - 这是 JavaScript 中非常常见的「模块化」写法
  (function () {
    // 'use strict' = 严格模式，禁止一些容易出错的写法（如忘记声明变量就直接用）
    'use strict';

    // Store 是全局数据存储对象 CGStore 的引用
    // 所有数据（课程、书籍、运动、待办、打卡记录等）都通过 Store 来读写
    var Store = window.CGStore;

    /* ---------- 弹窗位置修复 ---------- */
    // 页面早期把所有弹窗写在了「首页视图」里面：一旦切到课程/管理/我的视图，
    // 首页被隐藏，弹窗也跟着隐形，导致“点了没反应”。
    // 这里把弹窗统一挪到 <body> 最外层，任何视图下都能正常弹出。
    try {
      document.querySelectorAll('.modal-overlay, .confirm-overlay').forEach(function (el) {
        if (el.parentElement && el.parentElement !== document.body) {
          document.body.appendChild(el);
        }
      });
    } catch (_) {}

    // today() 返回今天日期的字符串，格式如 "2026-09-08"
    // Store.today() 内部会做时区处理，确保返回的是「本地日期」
    function today() { return Store.today(); }

    /* ---------- 确认对话框（使用 showConfirm 函数） ---------- */
    // 当用户执行危险操作（如删除数据）时，弹出确认框让用户二次确认
    // confirmCb 是「回调函数」（callback）：用户点击「确定」后要执行的操作
    // 什么是回调函数？就是「现在先记住这个函数，等用户点了按钮再执行它」
    var confirmCb = null;
    function confirm(title, text, cb) {
      setText('#confirmTitle', title);
      setText('#confirmText', text);
      confirmCb = cb;
      document.getElementById('confirmDialog').classList.add('show');
    }
    document.getElementById('confirmCancel').addEventListener('click', function () {
      confirmCb = null;
      document.getElementById('confirmDialog').classList.remove('show');
    });
    document.getElementById('confirmOk').addEventListener('click', function () {
      document.getElementById('confirmDialog').classList.remove('show');
      if (typeof confirmCb === 'function') confirmCb();
      confirmCb = null;
    });

    // ESC 键关闭当前弹窗 / 确认框
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal-overlay.open').forEach(function (m) {
        closeModal(m.id);
      });
      document.getElementById('confirmDialog').classList.remove('show');
    });

    /* ---------- 展开面板切换 ---------- */
    // 页面上有很多可折叠的面板（课程列表、书籍列表等）
    // 点击「展开」按钮时，切换面板的显示/隐藏
    // 使用「事件委托」模式：在 document 上统一监听，而不是给每个按钮单独绑定
    // 这样即使后来动态添加了新按钮，也能正常响应点击
    document.addEventListener('click', function (e) {
      // 模态框关闭按钮
      var closeBtn = e.target.closest('[data-modal-close]');
      if (closeBtn) {
        var overlay = closeBtn.closest('.modal-overlay');
        if (overlay) {
          closeModal(overlay.id);
        }
        return;
      }

      // 点击模态框遮罩层关闭
      if (e.target.classList && e.target.classList.contains('modal-overlay')) {
        if (e.target.classList.contains('open') || e.target.classList.contains('show')) {
          closeModal(e.target.id);
          return;
        }
      }

      var toggle = e.target.closest('.expand-toggle');
      if (!toggle) return;
      e.preventDefault();
      var targetId = toggle.getAttribute('data-expand');
      var panel = document.getElementById(targetId);
      if (!panel) return;
      var isOpen = panel.classList.toggle('show');
      toggle.classList.toggle('open', isOpen);
      // 展开时立即渲染列表
      if (isOpen) {
        if (targetId === 'coursePanel') renderCourseList();
        else if (targetId === 'bookPanel') renderBookList();
        else if (targetId === 'sportPanel') renderSportList();
        else if (targetId === 'englishPanel') renderEnglishList();
        else if (targetId === 'focusPanel') renderFocusList();
        else if (targetId === 'taskPanel') renderHomeTasks();
      }
    });

    /* ---------- 身份 / 天数 ---------- */
    function getUser() { return Store.getUser() || { name: '', startDate: '', totalDays: 0, continuousDays: 0 }; }

    /* ---------- 数据 → UI 状态 ---------- */
    // computeState() 从数据存储中读取所有数据，计算出页面需要显示的统计值
    // 这是「纯计算」函数：只读取数据，不修改任何数据
    // 返回一个对象，包含所有需要显示的统计数字
    function computeState() {
      var u = getUser();
      var nick = u.name || '同学';
      var joinDays = (u.totalDays && u.totalDays > 0) ? u.totalDays : 1;
      try {
        if (u.startDate) {
          var diff = Math.floor((Date.now() - new Date(u.startDate).getTime()) / 86400000);
          joinDays = Math.max(1, diff + 1);
        }
      } catch (_) {}

      var todos = Store.getTodosByDate(today());
      var courses = Store.getCourses();
      var readingsToday = Store.getReadingsByDate(today());
      var englishToday = Store.getEnglishByDate(today());
      var sportsToday = Store.getSportsByDate(today());
      var focusToday = Store.getFocusByDate(today());
      var focusAll = Store.totalFocusMinutes();

      return {
        nick: nick, day: joinDays,
        planTotal: todos.length,
        planDone: todos.filter(function (x) { return x.done; }).length,
        courseCount: courses.length,
        courseAvg: Store.courseAvgProgress(),
        readBooks: readingsToday.length,
        readPages: readingsToday.reduce(function (s, x) { return s + (Number(x.pages) || 0); }, 0),
        englishCount: englishToday.length,
        englishMinutes: englishToday.reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0),
        sportCount: sportsToday.length,
        sportCal: sportsToday.reduce(function (s, x) { return s + (Number(x.calories) || 0); }, 0),
        focusTodayCount: focusToday.length,
        focusTodayMin: focusToday.reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0),
        growthBooks: Store.totalBooksFinished(),
        growthPages: Store.totalPagesRead(),
        growthRate: courses.length ? Store.courseAvgProgress() : 0,
        growthFocus: focusAll,
        growthStudy: Store.getEnglish().reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0),
        growthStreak: (u.continuousDays || 0)
      };
    }

    /* ---------- 更新 UI ---------- */
    // updateUI() 把 computeState() 计算出的数据「填」到页面的各个位置
    // 这是「数据驱动视图」模式：数据变了 → 重新计算 → 更新页面显示
    function updateUI() {
      var s = computeState();

      setText('welcomeName', s.nick);
      setText('welcomeDay', s.day);

      setText('planDone', s.planDone);
      setText('planTotal', s.planTotal);
      setText('planStatus', '今日 ' + s.planDone + ' / ' + s.planTotal);
      var pe = $('#planEmpty');
      if (pe) pe.style.display = (s.planTotal > 0) ? 'none' : 'inline';

      setText('courseCount', s.courseCount);
      setText('courseAvg', s.courseAvg);
      setText('courseStatus', s.courseCount + ' 门');
      var ce = $('#courseEmpty'), cb = $('#courseBody');
      if (ce) ce.style.display = (s.courseCount > 0) ? 'none' : 'inline';
      if (cb) cb.style.display = (s.courseCount > 0) ? 'inline' : 'none';

      setText('readBooks', s.readBooks);
      setText('readPages', s.readPages);
      setText('readStatus', (s.readBooks + s.readPages) > 0 ? '今日进行中' : '今日未开始');

      setText('englishCount', s.englishCount);
      setText('englishMinutes', s.englishMinutes);
      setText('englishStatus', (s.englishCount + s.englishMinutes) > 0 ? '今日进行中' : '今日未开始');

      setText('sportCount', s.sportCount);
      setText('sportCal', s.sportCal);
      setText('sportStatus', (s.sportCount + s.sportCal) > 0 ? '今日进行中' : '今日未开始');
      var st = $('#sportTip');
      if (st) st.style.display = (s.sportCount + s.sportCal) > 0 ? 'none' : 'inline';

      setText('focusCount', s.focusTodayCount);
      setText('focusMinutes', s.focusTodayMin);
      setText('focusStatus', s.focusTodayMin > 0 ? '今日专注 ' + s.focusTodayMin + ' 分钟' : '今日未开始');

      // 打卡按钮完成态
      var checkinBtn = document.querySelector('.hero-actions .btn-primary[data-act="checkin"]');
      if (checkinBtn) {
        var checked = Store.isCheckedIn(today());
        checkinBtn.classList.toggle('checked', checked);
        checkinBtn.textContent = checked ? '✅ 今日已打卡' : '✅ 今日打卡';
      }

      // 课程视图可见时同步刷新
      var cvVisible = document.getElementById('wb-view-course') && !document.getElementById('wb-view-course').hidden;
      if (cvVisible && typeof renderCourseView === 'function') renderCourseView();

      // 任务清单面板可见时同步刷新
      var taskPanel = document.getElementById('taskPanel');
      if (taskPanel && taskPanel.classList.contains('show') && typeof renderHomeTasks === 'function') renderHomeTasks();

      setText('growthBooks', s.growthBooks);
      setText('growthPages', s.growthPages);
      setText('growthRate', s.growthRate + '%');
      setText('growthFocus', s.growthFocus);
      setText('growthStudy', s.growthStudy);
      setText('growthStreak', s.growthStreak);

      var barSpecs = [
        ['barBooks', s.growthBooks, 12], ['barPages', s.growthPages, 3000],
        ['barRate', s.growthRate, 100], ['barFocus', s.growthFocus, 1500],
        ['barStudy', s.growthStudy, 60], ['barStreak', s.growthStreak, 30]
      ];
      barSpecs.forEach(function (spec) {
        var el = document.getElementById(spec[0]);
        if (el) el.style.width = Math.min(100, Math.round((spec[1] / spec[2]) * 100)) + '%';
      });

      var bell = $('#bellCount');
      if (bell) {
        var pending = s.planTotal - s.planDone;
        bell.textContent = pending > 0 ? pending : 0;
        var bellBtn = $('#bellBtn');
        if (bellBtn) bellBtn.style.display = pending > 0 ? 'inline-flex' : 'none';
      }

      // 展开面板可见时刷新列表
      if ($('#coursePanel') && $('#coursePanel').classList.contains('show')) renderCourseList();
      if ($('#bookPanel') && $('#bookPanel').classList.contains('show')) renderBookList();
      if ($('#sportPanel') && $('#sportPanel').classList.contains('show')) renderSportList();
      if ($('#englishPanel') && $('#englishPanel').classList.contains('show')) renderEnglishList();
    }

    /* ========== 列表渲染：课程 ========== */
    function renderCourseList() {
      var host = $('#courseList');
      if (!host) return;
      var courses = Store.getCourses();
      host.innerHTML = '';
      if (!courses.length) {
        host.innerHTML = '<div class="item-empty">暂无课程，点击「添加课程」开始</div>';
        return;
      }
      courses.forEach(function (c) {
        var total = Number(c.totalChapters) || 0;
        var learned = Number(c.learnedChapters != null ? c.learnedChapters : 0) || 0;
        var pct = total > 0 ? Math.min(100, Math.round((learned / total) * 100)) : 0;
        var row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML =
          '<div class="item-main">' +
            '<div class="item-title">' + esc(c.name) + '</div>' +
            '<div class="item-sub">共 ' + total + ' 章 · 已学 ' + learned + ' 章</div>' +
          '</div>' +
          '<div class="item-bar"><div class="item-bar-fill" style="width:' + pct + '%;"></div></div>' +
          '<div class="item-pct" style="color:' + (pct >= 100 ? '#22c55e' : '#f5b042') + ';">' + pct + '%</div>' +
          '<button class="item-btn edit" data-edit-course="' + c.id + '">✏️</button>' +
          '<button class="item-btn del" data-del-course="' + c.id + '">🗑</button>';
        host.appendChild(row);
      });
    }

    /* ========== 列表渲染：书籍 ========== */
    function renderBookList() {
      var host = $('#bookList');
      if (!host) return;
      var books = Store.getReadings();
      host.innerHTML = '';
      if (!books.length) {
        host.innerHTML = '<div class="item-empty">书架空空如也，点击「开启好书」添加</div>';
        return;
      }
      books.forEach(function (b) {
        var total = Number(b.totalPages) || 0;
        var read = Number(b.pages) || 0;
        var pct = total > 0 ? Math.min(100, Math.round((read / total) * 100)) : 0;
        var row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML =
          '<div class="item-main">' +
            '<div class="item-title">' + esc(b.bookName) + '</div>' +
            '<div class="item-sub">共 ' + total + ' 页 · 已读 ' + read + ' 页</div>' +
          '</div>' +
          '<div class="item-bar"><div class="item-bar-fill" style="width:' + pct + '%;"></div></div>' +
          '<div class="item-pct" style="color:' + (pct >= 100 ? '#22c55e' : '#f5b042') + ';">' + pct + '%</div>' +
          '<button class="item-btn edit" data-edit-book="' + b.id + '">✏️</button>' +
          '<button class="item-btn del" data-del-book="' + b.id + '">🗑</button>';
        host.appendChild(row);
      });
    }

    /* ========== 列表渲染：运动 ========== */
    function renderSportList() {
      var host = $('#sportList');
      if (!host) return;
      var sports = Store.getSports().reverse();
      host.innerHTML = '';
      if (!sports.length) {
        host.innerHTML = '<div class="item-empty">暂无运动记录，动起来吧！</div>';
        return;
      }
      sports.slice(0, 20).forEach(function (s) {
        var row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML =
          '<div class="item-main">' +
            '<div class="item-title">🏃 ' + esc(s.name) + '</div>' +
            '<div class="item-sub">' + (s.date || '') + ' · ' + (s.calories || 0) + ' 千卡 · ' + (s.duration || 0) + ' 分钟</div>' +
          '</div>' +
          '<button class="item-btn del" data-del-sport="' + s.id + '">🗑</button>';
        host.appendChild(row);
      });
    }

    /* ========== 列表渲染：英语 ========== */
    function renderEnglishList() {
      var host = $('#englishList');
      if (!host) return;
      var records = Store.getEnglish().reverse();
      host.innerHTML = '';
      if (!records.length) {
        host.innerHTML = '<div class="item-empty">暂无英语学习记录</div>';
        return;
      }
      records.slice(0, 20).forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML =
          '<div class="item-main">' +
            '<div class="item-title">🗣️ ' + (r.words || 0) + ' 词 · ' + (r.minutes || 0) + ' 分钟</div>' +
            '<div class="item-sub">' + (r.date || '') + '</div>' +
          '</div>' +
          '<button class="item-btn del" data-del-english="' + r.id + '">🗑</button>';
        host.appendChild(row);
      });
    }

    /* ========== 列表渲染：专注 ========== */
    function renderFocusList() {
      var host = $('#focusList');
      if (!host) return;
      var records = Store.getFocus().slice().reverse();
      host.innerHTML = '';
      if (!records.length) {
        host.innerHTML = '<div class="item-empty">还没有专注记录，从 25 分钟开始试试！</div>';
        return;
      }
      records.slice(0, 20).forEach(function (f) {
        var row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML =
          '<div class="item-main">' +
            '<div class="item-title">⏳ ' + (f.minutes || 0) + ' 分钟' + (f.task ? ' · ' + esc(f.task) : '') + '</div>' +
            '<div class="item-sub">' + (f.date || '') + '</div>' +
          '</div>' +
          '<button class="item-btn del" data-del-focus="' + f.id + '">🗑</button>';
        host.appendChild(row);
      });
    }

    /* ========== 列表渲染：今日任务清单（工作台首页） ========== */
    function renderHomeTasks() {
      var host = $('#taskList');
      if (!host) return;
      var todos = Store.getTodosByDate(today());
      host.innerHTML = '';
      if (!todos.length) {
        host.innerHTML = '<div class="item-empty">今天还没有任务，点击「+ 添加任务」开始规划 ✨</div>';
        return;
      }
      todos.slice(0, 20).forEach(function (t) {
        var row = document.createElement('div');
        row.className = 'task-row' + (t.done ? ' done' : '');
        row.innerHTML =
          '<div class="t-check' + (t.done ? ' checked' : '') + '" data-toggle-todo="' + t.id + '" title="点击切换完成">' + (t.done ? '✓' : '') + '</div>' +
          '<div class="t-text">' + esc(t.text) + '</div>' +
          '<button class="item-btn del" data-del-todo="' + t.id + '" title="删除">🗑</button>';
        host.appendChild(row);
      });
    }

    /* ---------- 编辑状态暂存 ---------- */
    // 当用户点击「编辑」某个课程/书籍时，记住正在编辑的是哪个
    // 这样在弹窗中修改并点击「保存」时，知道要更新哪一条记录
    var editingCourseId = null, editingBookId = null;

    /* ---------- 主交互（事件委托） ---------- */
    // 这是整个页面最大的事件监听器
    // 使用「事件委托」：在 document 上监听所有点击，根据点击的元素来判断要做什么
    // 好处：不需要给每个按钮单独绑定事件，代码更简洁
    document.addEventListener('click', function (e) {
      // e.target.closest() 从点击位置往上找最近的匹配元素
      // 如果点击的不是这些按钮中的任何一个，就直接退出
      var trigger = e.target.closest('.card-action, .btn-primary, #newBtn, #bellBtn, [data-edit-course], [data-del-course], [data-edit-book], [data-del-book], [data-del-sport], [data-del-english], [data-del-focus], [data-toggle-todo], [data-del-todo], [data-more-ch]');
      if (!trigger) return;
      e.preventDefault();

      var act = trigger.getAttribute('data-act');

      // 今日打卡
      if (act === 'checkin') {
        var already = Store.isCheckedIn(today());
        if (already) { toast('✅ 今天已打卡，继续保持！', 'info'); }
        else { Store.addCheckin(today(), 'done'); updateUI(); toast('✅ 今日打卡成功！', 'success'); }
        return;
      }

      // 通知铃铛
      if (trigger.id === 'bellBtn') {
        var todosToday = Store.getTodosByDate(today());
        var pendingN = todosToday.filter(function (t) { return !t.done; }).length;
        toast('📋 今日还有 ' + pendingN + ' 项待办未完成', 'info');
        return;
      }

      // 添加任务 → 打开模态框
      if (act === 'add' || trigger.id === 'newBtn') {
        var taskTextEl = $('#taskText');
        if (taskTextEl) taskTextEl.value = '';
        var priSel = $('#taskPriority');
        if (priSel) priSel.value = 'mid';
        openModal('modalAddTask');
        setTimeout(function () { taskTextEl && taskTextEl.focus(); }, 120);
        return;
      }

      // 开始专注 → 打开计时器模态框
      if (act === 'focus') {
        focusReset();
        openModal('modalFocusTimer');
        return;
      }

      // 添加课程 → 打开模态框
      if (act === 'add-course') {
        $('#courseName').value = '';
        $('#courseTotal').value = 20;
        $('#courseLearned').value = 0;
        openModal('modalAddCourse');
        return;
      }

      // 编辑课程
      if (trigger.hasAttribute('data-edit-course')) {
        var cid = trigger.getAttribute('data-edit-course');
        var course = Store.getCourses().filter(function (c) { return c.id === cid; })[0];
        if (!course) return;
        editingCourseId = cid;
        $('#editCourseName').value = course.name || '';
        $('#editCourseTotal').value = Number(course.totalChapters) || 0;
        $('#editCourseLearned').value = Number(course.learnedChapters) || 0;
        openModal('modalEditCourse');
        return;
      }

      // 删除课程
      if (trigger.hasAttribute('data-del-course')) {
        var dcid = trigger.getAttribute('data-del-course');
        var dcourse = Store.getCourses().filter(function (c) { return c.id === dcid; })[0];
        confirm('删除课程', '确定要删除「' + (dcourse ? dcourse.name : '该课程') + '」吗？此操作不可撤销。', function () {
          Store.removeCourse(dcid);
          updateUI();
          toast('🗑 课程已删除', 'info');
        });
        return;
      }

      // 添加书籍 → 打开模态框
      if (act === 'read') {
        $('#bookName').value = '';
        $('#bookTotal').value = 300;
        $('#bookRead').value = 0;
        openModal('modalAddBook');
        return;
      }

      // 编辑书籍
      if (trigger.hasAttribute('data-edit-book')) {
        var bid = trigger.getAttribute('data-edit-book');
        var book = Store.getReadings().filter(function (b) { return b.id === bid; })[0];
        if (!book) return;
        editingBookId = bid;
        $('#editBookName').value = book.bookName || '';
        $('#editBookTotal').value = Number(book.totalPages) || 0;
        $('#editBookRead').value = Number(book.pages) || 0;
        openModal('modalEditBook');
        return;
      }

      // 删除书籍
      if (trigger.hasAttribute('data-del-book')) {
        var dbid = trigger.getAttribute('data-del-book');
        var dbook = Store.getReadings().filter(function (b) { return b.id === dbid; })[0];
        confirm('删除书籍', '确定要删除「' + (dbook ? dbook.bookName : '该书') + '」吗？', function () {
          Store.removeReading(dbid);
          updateUI();
          toast('🗑 书籍已删除', 'info');
        });
        return;
      }

      // 删除运动
      if (trigger.hasAttribute('data-del-sport')) {
        var dsid = trigger.getAttribute('data-del-sport');
        confirm('删除运动记录', '确定要删除这条运动记录吗？', function () {
          Store.removeSport(dsid);
          updateUI();
          toast('🗑 记录已删除', 'info');
        });
        return;
      }

      // 删除英语
      if (trigger.hasAttribute('data-del-english')) {
        var deid = trigger.getAttribute('data-del-english');
        confirm('删除英语记录', '确定要删除这条学习记录吗？', function () {
          Store.removeEnglish(deid);
          updateUI();
          toast('🗑 记录已删除', 'info');
        });
        return;
      }

      // 删除专注记录
      if (trigger.hasAttribute('data-del-focus')) {
        var dfid = trigger.getAttribute('data-del-focus');
        confirm('删除专注记录', '确定要删除这条专注记录吗？', function () {
          Store.removeFocus(dfid);
          updateUI();
          renderFocusList();
          toast('🗑 记录已删除', 'info');
        });
        return;
      }

      // 勾选/取消今日任务（工作台任务清单）
      if (trigger.hasAttribute('data-toggle-todo')) {
        Store.toggleTodo(trigger.getAttribute('data-toggle-todo'));
        updateUI();
        return;
      }

      // 删除今日任务（工作台任务清单）
      if (trigger.hasAttribute('data-del-todo')) {
        var dtid = trigger.getAttribute('data-del-todo');
        Store.removeTodo(dtid);
        updateUI();
        toast('🗑 任务已删除', 'info');
        return;
      }

      // 课程快捷 +1 章
      if (trigger.hasAttribute('data-more-ch')) {
        var mc = Store.getCourses().filter(function (x) { return x.id === trigger.getAttribute('data-more-ch'); })[0];
        if (mc) {
          var mTotal = Number(mc.totalChapters) || 0;
          var mLearned = Math.min(mTotal, (Number(mc.learnedChapters) || 0) + 1);
          var mProgress = mTotal > 0 ? Math.round((mLearned / mTotal) * 100) : 0;
          Store.updateCourse(mc.id, {
            learnedChapters: mLearned,
            progress: mProgress,
            status: mProgress >= 100 ? 'done' : (mProgress > 0 ? 'doing' : 'todo')
          });
          updateUI();
          toast(mLearned >= mTotal && mTotal > 0 ? '🎉 恭喜完成《' + mc.name + '》！' : '📈 已学 +1 章（' + mLearned + '/' + mTotal + '）', 'success');
        }
        return;
      }

      // 运动记录 → 打开模态框
      if (act === 'sport') {
        $('#sportType').value = '跑步';
        $('#sportCal').value = 100;
        $('#sportMin').value = 30;
        openModal('modalAddSport');
        return;
      }

      // 英语学习 → 打开模态框
      if (act === 'english') {
        $('#engWords').value = 20;
        $('#engMin').value = 10;
        openModal('modalAddEnglish');
        return;
      }
    });

    /* ---------- 模态框保存按钮绑定 ---------- */

    // 保存课程
    $('#saveCourseBtn').addEventListener('click', function () {
      var name = $('#courseName').value.trim();
      var total = parseInt($('#courseTotal').value, 10) || 0;
      var learned = parseInt($('#courseLearned').value, 10) || 0;
      if (!name) { toast('请输入课程名称', 'warn'); return; }
      if (total < 1) { toast('总章节数必须大于 0', 'warn'); return; }
      if (learned > total) { toast('已学章节不能超过总章节数', 'warn'); return; }
      var prog = Math.round((learned / total) * 100);
      Store.addCourse({
        name: name, totalChapters: total, learnedChapters: learned,
        progress: prog, status: prog >= 100 ? 'done' : (prog > 0 ? 'doing' : 'todo')
      });
      updateUI();
      closeModal('modalAddCourse');
      toast('✅ 课程已添加：' + name, 'success');
    });

    // 更新课程
    $('#updateCourseBtn').addEventListener('click', function () {
      if (!editingCourseId) return;
      var name = $('#editCourseName').value.trim();
      var total = parseInt($('#editCourseTotal').value, 10) || 0;
      var learned = parseInt($('#editCourseLearned').value, 10) || 0;
      if (!name) { toast('请输入课程名称', 'warn'); return; }
      if (total < 1) { toast('总章节数必须大于 0', 'warn'); return; }
      if (learned > total) { toast('已学章节不能超过总章节数', 'warn'); return; }
      var prog = Math.round((learned / total) * 100);
      Store.updateCourse(editingCourseId, {
        name: name, totalChapters: total, learnedChapters: learned,
        progress: prog, status: prog >= 100 ? 'done' : (prog > 0 ? 'doing' : 'todo')
      });
      editingCourseId = null;
      updateUI();
      closeModal('modalEditCourse');
      toast('✅ 课程已更新', 'success');
    });

    // 保存书籍
    $('#saveBookBtn').addEventListener('click', function () {
      var name = $('#bookName').value.trim();
      var total = parseInt($('#bookTotal').value, 10) || 0;
      var read = parseInt($('#bookRead').value, 10) || 0;
      if (!name) { toast('请输入书名', 'warn'); return; }
      if (total < 1) { toast('总页数必须大于 0', 'warn'); return; }
      if (read > total) { toast('已读页数不能超过总页数', 'warn'); return; }
      Store.addReading({ date: today(), bookName: name, pages: read, totalPages: total });
      updateUI();
      closeModal('modalAddBook');
      toast('✅ 书籍已添加：' + name, 'success');
    });

    // 更新书籍
    $('#updateBookBtn').addEventListener('click', function () {
      if (!editingBookId) return;
      var name = $('#editBookName').value.trim();
      var total = parseInt($('#editBookTotal').value, 10) || 0;
      var read = parseInt($('#editBookRead').value, 10) || 0;
      if (!name) { toast('请输入书名', 'warn'); return; }
      if (total < 1) { toast('总页数必须大于 0', 'warn'); return; }
      if (read > total) { toast('已读页数不能超过总页数', 'warn'); return; }
      Store.updateReading(editingBookId, { bookName: name, pages: read, totalPages: total });
      editingBookId = null;
      updateUI();
      closeModal('modalEditBook');
      toast('✅ 书籍已更新', 'success');
    });

    // 保存运动
    $('#saveSportBtn').addEventListener('click', function () {
      var type = $('#sportType').value;
      var cal = parseInt($('#sportCal').value, 10) || 0;
      var min = parseInt($('#sportMin').value, 10) || 0;
      if (cal < 1) { toast('消耗必须大于 0', 'warn'); return; }
      Store.addSport({ date: today(), name: type, calories: cal, duration: min, type: 'general' });
      updateUI();
      closeModal('modalAddSport');
      toast('✅ 运动已记录：' + type, 'success');
    });

    // 保存英语
    $('#saveEngBtn').addEventListener('click', function () {
      var words = parseInt($('#engWords').value, 10) || 0;
      var mins = parseInt($('#engMin').value, 10) || 0;
      if (words < 1) { toast('单词数必须大于 0', 'warn'); return; }
      Store.addEnglish({ date: today(), words: words, minutes: mins });
      updateUI();
      closeModal('modalAddEnglish');
      toast('✅ 英语学习已记录：' + words + ' 词', 'success');
    });

    // 保存新建任务
    $('#saveTaskBtn').addEventListener('click', function () {
      var text = ($('#taskText').value || '').trim();
      var pri = $('#taskPriority').value || 'mid';
      if (!text) { toast('请输入任务内容', 'warn'); return; }
      Store.addTodo({ text: text, date: today(), done: false, priority: pri });
      updateUI();
      closeModal('modalAddTask');
      toast('✅ 已添加任务：' + text, 'success');
    });
    $('#taskText').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('#saveTaskBtn').click();
    });

    /* ---------- 专注计时器（番茄钟功能） ---------- */
    // 这是一个倒计时计时器，帮助用户专注学习/工作
    // 工作原理：
    //   1. 用户选择时长（15/25/45 分钟）
    //   2. 点击「开始专注」，每秒倒计时一次（用 setInterval 定时器实现）
    //   3. 倒计时结束或用户手动停止时，记录本次专注时长
    // 变量说明：
    var focusMins = 45;          // 选定时长（分钟）
    var focusTotalSec = 45 * 60; // 总秒数
    var focusLeftSec = focusTotalSec;
    var focusTickTimer = null;   // setInterval 句柄
    var focusRunning = false;

    // fmtClock(sec) 将秒数格式化为 "MM:SS" 格式，如 90 秒 → "01:30"
    function fmtClock(sec) {
      var m = Math.floor(sec / 60), r = sec % 60;
      return ('0' + m).slice(-2) + ':' + ('0' + r).slice(-2);
    }
    function renderFocusUI() {
      var clock = $('#focusClock');
      if (clock) {
        clock.textContent = fmtClock(focusLeftSec);
        clock.classList.toggle('running', focusRunning);
      }
      var bar = $('#focusProgBar');
      if (bar) {
        var pct = focusTotalSec > 0 ? Math.round(((focusTotalSec - focusLeftSec) / focusTotalSec) * 100) : 0;
        bar.style.width = pct + '%';
      }
      var startBtn = $('#focusStartBtn');
      if (startBtn) startBtn.textContent = focusRunning ? '⏸ 暂停' : (focusLeftSec < focusTotalSec ? '▶ 继续专注' : '▶ 开始专注');
      var giveup = $('#focusGiveupBtn');
      if (giveup) giveup.style.display = (focusLeftSec < focusTotalSec) ? '' : 'none';
      Array.prototype.forEach.call(document.querySelectorAll('.focus-preset'), function (b) {
        b.disabled = focusRunning || focusLeftSec < focusTotalSec;
        b.classList.toggle('active', Number(b.getAttribute('data-mins')) === focusMins);
      });
      // 顶栏计时 chip：切到任何视图都能看到专注进行中
      var chip = document.getElementById('focusChip');
      if (chip) {
        var active = focusRunning || focusLeftSec < focusTotalSec;
        chip.style.display = active ? 'inline-flex' : 'none';
        var chipTime = document.getElementById('focusChipTime');
        if (chipTime) chipTime.textContent = fmtClock(focusLeftSec);
        chip.classList.toggle('running', focusRunning);
      }
    }
    function stopFocusTick() {
      if (focusTickTimer) { clearInterval(focusTickTimer); focusTickTimer = null; }
      focusRunning = false;
    }
    // focusFinish(auto) 专注结束时调用
    // auto=true 表示倒计时自然结束（自动完成），auto=false 表示用户手动停止
    function focusFinish(auto) {
      stopFocusTick();
      var elapsedMin = Math.round((focusTotalSec - focusLeftSec) / 60);
      if (auto) elapsedMin = focusTotalSec / 60;
      if (elapsedMin < 1) elapsedMin = 1;
      var task = ($('#focusTask').value || '').trim();
      Store.addFocus({ date: today(), minutes: elapsedMin, task: task });
      updateUI();
      closeModal('modalFocusTimer');
      toast(auto ? ('🎉 专注完成！+' + elapsedMin + ' 分钟') : ('⏹ 已记录 ' + elapsedMin + ' 分钟专注'), 'success');
    }
    function focusReset() {
      stopFocusTick();
      focusTotalSec = focusMins * 60;
      focusLeftSec = focusTotalSec;
      renderFocusUI();
    }
    Array.prototype.forEach.call(document.querySelectorAll('.focus-preset'), function (btn) {
      btn.addEventListener('click', function () {
        focusMins = Number(this.getAttribute('data-mins')) || 25;
        focusReset();
      });
    });
    $('#focusStartBtn').addEventListener('click', function () {
      if (focusRunning) {
        stopFocusTick();
        renderFocusUI();
        toast('⏸ 已暂停', 'info');
        return;
      }
      focusRunning = true;
      renderFocusUI();
      focusTickTimer = setInterval(function () {
        focusLeftSec -= 1;
        if (focusLeftSec <= 0) {
          focusLeftSec = 0;
          renderFocusUI();
          focusFinish(true);
          return;
        }
        renderFocusUI();
      }, 1000);
    });
    $('#focusGiveupBtn').addEventListener('click', function () {
      focusFinish(false);
    });
    // 顶栏计时 chip：点击回到首页并打开计时器
    document.getElementById('focusChip').addEventListener('click', function (e) {
      e.preventDefault();
      switchWbView('home');
      openModal('modalFocusTimer');
    });

    /* ---------- 内嵌视图切换（首页 / 课程 / 管理 / 我的） ---------- */
    // 工作台页面有 4 个视图：home（首页）、course（课程）、manage（管理）、profile（个人中心）
    // switchWbView() 切换显示哪个视图，同时更新侧边栏的高亮状态
    var WB_VIEWS = ['home', 'course', 'manage', 'profile'];
    function switchWbView(key) {
      WB_VIEWS.forEach(function (v) {
        var el = document.getElementById('wb-view-' + v);
        if (el) el.hidden = (v !== key);
      });
      // 桌面侧边栏 + 移动端底部栏一起更新高亮
      $$('.sidebar .nav-item, .mobile-tabbar a[data-nav]').forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('data-nav') === key);
      });
      if (key === 'course') renderCourseView();
      if (key === 'profile') renderProfileView();
      try { history.replaceState(null, '', '?view=' + key); } catch (_) {}
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // 桌面侧边栏和移动端底部栏统一处理：
    //   home/course/manage/profile → 页面内切换
    //   stats/ai → 交给浏览器正常跳转到对应页面
    function bindWbNav() {
      $$('.sidebar .nav-item, .mobile-tabbar a[data-nav]').forEach(function (a) {
        a.addEventListener('click', function (e) {
          var key = this.getAttribute('data-nav');
          if (!key || WB_VIEWS.indexOf(key) === -1) return; // stats/ai 正常跳转
          e.preventDefault();
          switchWbView(key);
        });
      });
    }
    // 兼容页面上原有的重复绑定（只保留一处生效，避免事件叠加）
    if (!window.__cgWbNavBound) {
      window.__cgWbNavBound = true;
      bindWbNav();
    }

    /* ---------- 课程视图 ---------- */
    // 渲染「课程」页面：显示所有课程的进度条，支持 +1 章、编辑、删除操作
    function renderCourseView() {
      var host = $('#courseViewList');
      if (!host) return;
      var courses = Store.getCourses();
      var summary = $('#cvSummary');
      if (!courses.length) {
        host.innerHTML = '<div class="item-empty">还没有课程，点击右上角「添加课程」开始第一门课 ✨</div>';
        if (summary) summary.textContent = '';
        return;
      }
      var sum = 0;
      courses.forEach(function (c) { sum += Number(c.progress) || 0; });
      if (summary) summary.textContent = '共 ' + courses.length + ' 门 · 平均进度 ' + Math.round(sum / courses.length) + '%';
      host.innerHTML = '';
      courses.forEach(function (c) {
        var total = Number(c.totalChapters) || 0;
        var learned = Number(c.learnedChapters) || 0;
        var pct = total > 0 ? Math.round((learned / total) * 100) : 0;
        var el = document.createElement('div');
        el.className = 'cv-item';
        el.innerHTML =
          '<div class="cv-main">' +
            '<div class="cv-name">' + esc(c.name) + '</div>' +
            '<div class="cv-sub">共 ' + total + ' 章 · 已学 ' + learned + ' 章</div>' +
            '<div class="cv-bar"><div class="cv-fill" style="width:' + pct + '%;"></div></div>' +
            '<div class="cv-actions">' +
              '<button data-more-ch="' + c.id + '" title="学完一章">＋1 章</button>' +
              '<button data-edit-course="' + c.id + '">✏️ 编辑</button>' +
              '<button data-del-course="' + c.id + '">🗑 删除</button>' +
            '</div>' +
          '</div>' +
          '<div class="cv-pct ' + (pct >= 100 ? 'done' : '') + '">' + pct + '%' + (pct >= 100 ? ' 🎉' : '') + '</div>';
        host.appendChild(el);
      });
    }

    /* ---------- 我的视图（个人中心） ---------- */
    // currentStreak() 计算连续打卡天数：从今天往回数，连续打卡了多少天
    function currentStreak() {
      var days = {};
      Store.getCheckins().forEach(function (c) { if (c.date) days[c.date] = 1; });
      var streak = 0;
      var d = new Date();
      // 今天没打卡也从昨天起算连续
      if (!days[fmtDateKey(d)]) d.setDate(d.getDate() - 1);
      while (days[fmtDateKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
      return streak;
    }
    function fmtDateKey(d) {
      var m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
      return d.getFullYear() + '-' + m + '-' + day;
    }
    function renderProfileView() {
      var u = Store.getUser() || {};
      var cu = null;
      try { cu = JSON.parse(localStorage.getItem('cg_user') || 'null'); } catch (_) {}
      var name = u.name || (cu && cu.nickname) || '同学';
      var email = (cu && cu.email) || '本地模式（未登录）';
      var avatarCh = name.charAt(0) || '同';

      var joinDays = 1;
      try {
        if (u.startDate) {
          joinDays = Math.max(1, Math.floor((Date.now() - new Date(u.startDate).getTime()) / 86400000) + 1);
        }
      } catch (_) {}

      setText('pfAvatar', avatarCh);
      setText('pfName', name);
      setText('pfEmail', email);
      setText('pfDays', '第 ' + joinDays + ' 天 · 连续打卡 ' + currentStreak() + ' 天');
      setText('pfCheckins', Store.getCheckins().length);
      setText('pfTodos', Store.getTodos().filter(function (t) { return t.done; }).length);
      setText('pfFocus', Store.totalFocusMinutes());
      setText('pfPages', Store.totalPagesRead());

      // 最近 7 天打卡可视化
      var week = $('#pfWeek');
      if (week) {
        var daySet = {};
        Store.getCheckins().forEach(function (c) { if (c.date) daySet[c.date] = 1; });
        var names = ['日', '一', '二', '三', '四', '五', '六'];
        var html = '';
        for (var i = 6; i >= 0; i--) {
          var dd = new Date();
          dd.setDate(dd.getDate() - i);
          var key = fmtDateKey(dd);
          var hit = !!daySet[key];
          html += '<div class="mw-day' + (hit ? ' hit' : '') + (i === 0 ? ' today' : '') + '">' +
                    '<div class="mw-dot">' + (hit ? '✓' : '') + '</div>' +
                    '<div class="mw-label">' + (i === 0 ? '今天' : '周' + names[dd.getDay()]) + '</div>' +
                  '</div>';
        }
        week.innerHTML = html;
      }
    }

    /* ---------- 管理视图 ---------- */
    // applyWbTheme(theme) 切换页面主题颜色（晨光琥珀/青晨薄荷/暮色玫瑰）
    function applyWbTheme(theme) {
      if (theme === 'teal' || theme === 'rose') {
        document.body.setAttribute('data-wb-theme', theme);
      } else {
        document.body.removeAttribute('data-wb-theme'); // 默认晨光琥珀
      }
      try { localStorage.setItem('cg_wb_theme', theme || 'amber'); } catch (_) {}
      var sel = $('#wbThemeSelect');
      if (sel) sel.value = theme || 'amber';
    }
    $('#wbThemeSelect')?.addEventListener('change', function () {
      applyWbTheme(this.value);
      toast('🎨 主题已切换', 'success');
    });

    // exportAllData() 导出所有数据为 JSON 文件（备份功能）
    // 工作原理：把所有数据转成 JSON 字符串，创建一个 Blob 对象，
    // 然后创建一个临时的下载链接，触发浏览器下载
    function exportAllData() {
      var payload = Store.get();
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'chenguang-backup-' + CGStore.today() + '.json';
      a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 800);
      toast('📦 数据备份已导出', 'success');
    }
    $('#wbExportBtn')?.addEventListener('click', exportAllData);
    $('#pfExportBtn')?.addEventListener('click', exportAllData);

    $('#wbImportBtn')?.addEventListener('click', function () {
      $('#wbImportFile').click();
    });
    $('#wbImportFile')?.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object' || !Array.isArray(data.courses)) {
            toast('文件格式不正确，请选择导出的 JSON 备份', 'warn');
            return;
          }
          confirm('导入备份', '导入将覆盖当前全部数据，确定继续吗？', function () {
            var token = CGStore.getToken();
            CGStore.set(data);
            if (token) CGStore.setToken(token);
            updateUI();
            renderCourseView();
            toast('✅ 数据导入成功', 'success');
          });
        } catch (e) {
          toast('导入失败：' + e.message, 'error');
        }
      };
      reader.readAsText(file);
      this.value = '';
    });

    function doLogout() {
      confirm('退出登录', '将清除本机数据并返回首页，确定吗？', function () {
        CGStore.logout();
        location.href = 'index.html';
      });
    }
    $('#wbLogoutBtn')?.addEventListener('click', doLogout);
    $('#pfLogoutBtn')?.addEventListener('click', doLogout);

    /* ---------- 跨页面同步 ---------- */
    // 当其他页面（如 stats / ai）修改了数据时，自动刷新当前页面的显示
    // onUpdate 是一个「事件监听器」：数据变化时自动调用 updateUI()
    Store.onUpdate(updateUI);

    /* ---------- 首次加载（初始化） ---------- */
    // init() 在页面加载完毕后执行，负责：
    //   1. 从云端同步最新数据（如果有登录态）
    //   2. 恢复主题偏好
    //   3. 更新页面显示
    function init() {
      if (window.CGSync && CGStore.getToken && CGStore.getToken()) {
        try { window.CGSync.afterLogin().then(updateUI).catch(updateUI); } catch (_) {}
      }
      var wd0 = $('#welcomeDate'); if (wd0) wd0.textContent = fmtDate(new Date());
      // 恢复主题偏好
      var savedTheme = 'amber';
      try { savedTheme = localStorage.getItem('cg_wb_theme') || 'amber'; } catch (_) {}
      applyWbTheme(savedTheme);
      // 管理页显示当前账号
      try {
        var cu = JSON.parse(localStorage.getItem('cg_user') || 'null');
        setText('wbManageUser', (cu && (cu.nickname || cu.email)) || '本地模式');
      } catch (_) {}
      updateUI();
      // 支持从其它页面直达：workbench.html?view=course / manage / profile
      var wantView = new URLSearchParams(location.search).get('view');
      if (WB_VIEWS.indexOf(wantView) === -1) wantView = 'home';
      switchWbView(wantView);
    }

    // DOM 加载时机判断：
    //   - 如果 HTML 还没解析完（loading），等 DOMContentLoaded 事件再执行 init
    //   - 如果已经解析完了，直接执行 init
    // 这样确保 init() 执行时，页面元素都已经存在
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

  })(); // IIFE 结束

// ==================== Service Worker 注册 ====================
// Service Worker 是浏览器在后台运行的脚本，可以：
//   1. 缓存页面资源，让用户离线也能访问
//   2. 拦截网络请求，实现数据缓存策略
//   3. 推送通知等
// navigator.serviceWorker.register() 注册一个 Service Worker 文件
// 只在 HTTP/HTTPS 协议下生效（file:// 协议不支持）
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').catch(function (e) {
      console.warn('[SW] 注册失败:', e);
    });
  });
}
