// ====================================================================
// 知行 · 工作台页面 (Workbench Page)
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
//   - scheduleTextParser → 课表文本解析器（粘贴课表页文字，纯前端解析）
import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/ui/modal.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';
// 具名导入而非依赖 globalThis 副作用：构建期即可确定绑定，
// 不受模块求值顺序影响，压缩后也不会因 global 名改写而失效
import { parseScheduleText } from '../js/scheduleTextParser.js';
// 课程编排层（Phase 9）：归一化 / 今日课程 / 周课表 / 导入去重合并
import CourseSchedule from '../js/courseSchedule.js';
// 统计引擎（Phase 10）：成长面板的连续打卡复用唯一事实来源（Phase 15 修复）
import Analytics from '../js/analytics.js';
import GrowthIntelligence from '../js/growthIntelligence.js';
import GrowthTimeline from '../js/growthTimeline.js';
import AIActions from '../js/aiActions.js';
import CoachMemory from '../js/coachMemory.js';
import { buildDailyFeedback } from '../js/dailyFeedback.js';
import RetentionContext from '../js/retentionContext.js';
import GrowthMemory from '../js/growthMemory.js';
import { mountCourseSpace } from '../js/courseSpaceUI.js';
import { mountCourseSpaceExtraction } from '../js/courseSpaceExtractionUI.js';
import { setupServiceWorker } from '../js/serviceWorkerRegistration.js';

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

    function notifyRecordSaved(message) {
      toast(message + ' 今日成长反馈已更新。', 'success');
    }

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

    /* ============================================================
       Phase 9 · 课程编排（课表 / 周次 / 详情 / 导入合并）
       ============================================================ */

    /** 课表视图的内存状态：week 0=跟随学期自动；mobileDay -1=今日 */
    var schState = { week: 0, mobileDay: -1 };

    /**
     * initPeriodSelects() —— 给 4 个节次下拉框填充「第 1~12 节」选项
     */
    function initPeriodSelects() {
      ['course', 'editCourse'].forEach(function (prefix) {
        var start = document.getElementById(prefix + 'StartPeriod');
        var end = document.getElementById(prefix + 'EndPeriod');
        if (!start || !end) return;
        var html = '';
        for (var p = 1; p <= 12; p++) html += '<option value="' + p + '">第 ' + p + ' 节</option>';
        start.innerHTML = html;
        end.innerHTML = html;
        end.selectedIndex = 0;
      });
    }

    /**
     * normalizeWeeksInput(s) —— 校验并收敛周次输入
     * 允许 1-16 / 1,3,5 / 1~16 / 单 / 双 / 1-16(单) 等；返回去掉空白与「周」字的写法。
     */
    function normalizeWeeksInput(s) {
      var v = String(s || '').trim();
      if (!v) return '';
      return v.replace(/\s+/g, '');
    }

    /**
     * collectCourseMeta(prefix) —— 收集课程元数据（教师/教室/学分/类型/学期/备注）
     * 用于添加/编辑保存。返回对象，字段与 CourseSchedule.normalizeCourse 对齐。
     */
    function collectCourseMeta(prefix) {
      var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
      return {
        teacher: g(prefix + 'Teacher').trim(),
        classroom: g(prefix + 'Classroom').trim(),
        credits: parseFloat(g(prefix + 'Credits')) || 0,
        courseType: g(prefix + 'CourseType'),
        semester: g(prefix + 'Semester').trim(),
        notes: g(prefix + 'Notes').trim()
      };
    }

    /**
     * collectCourseSchedule(prefix) —— 从表单构建 slots[]（若选了星期）
     * 未选星期 → 返回 null（表示「不排课」，编辑时保留原排课不动）。
     */
    function collectCourseSchedule(prefix) {
      var wdEl = document.getElementById(prefix + 'Weekday');
      if (!wdEl) return null;
      var wd = wdEl.value;
      if (wd === '') return null;
      var start = parseInt(document.getElementById(prefix + 'StartPeriod').value, 10) || 1;
      var end = parseInt(document.getElementById(prefix + 'EndPeriod').value, 10) || start;
      if (end < start) end = start;
      var periods = [];
      for (var p = start; p <= end; p++) periods.push(p);
      var weeks = normalizeWeeksInput(document.getElementById(prefix + 'Weeks').value);
      return [{
        weekday: Number(wd),
        periods: periods,
        weeks: weeks
      }];
    }

    /**
     * prefillCourseScheduleForm(prefix, course) —— 打开编辑弹窗时回填排课字段
     * 课程只有一个上课时段 → 回填；0 个 / 多个时段 → 留空（保存时保留原排课，
     * 避免多时段课程被编辑表单静默改坏）。
     */
    function prefillCourseScheduleForm(prefix, course) {
      var nc = CourseSchedule.normalizeCourse(course);
      ['Weekday', 'StartPeriod', 'EndPeriod', 'Weeks'].forEach(function (suf) {
        var el = document.getElementById(prefix + suf);
        if (el) el.value = '';
      });
      if (nc.slots && nc.slots.length === 1) {
        var s = nc.slots[0];
        if (s.weekday >= 0) {
          var wdEl = document.getElementById(prefix + 'Weekday');
          if (wdEl) wdEl.value = String(s.weekday);
          var startEl = document.getElementById(prefix + 'StartPeriod');
          var endEl = document.getElementById(prefix + 'EndPeriod');
          if (startEl) startEl.value = String(s.periods[0] || 1);
          if (endEl) endEl.value = String(s.periods[s.periods.length - 1] || s.periods[0] || 1);
          var wEl = document.getElementById(prefix + 'Weeks');
          if (wEl) wEl.value = s.weeks || '';
        }
      }
      ['Teacher', 'Classroom', 'Credits', 'CourseType', 'Semester', 'Notes'].forEach(function (suf) {
        var el = document.getElementById(prefix + suf);
        if (el) el.value = (nc[suf.toLowerCase()] !== undefined && nc[suf.toLowerCase()] !== null) ? nc[suf.toLowerCase()] : '';
      });
      var creditEl = document.getElementById(prefix + 'Credits');
      if (creditEl && !creditEl.value) creditEl.value = '0';
    }

    /**
     * scheduleWeekInfo() —— 当前课表视图展示的是第几周
     * 优先级：用户手动步进（schState.week）> 学期配置手动周次 > 按学期开始日自动推算。
     * weekNum≤0 → 未配置学期（此时不按周次过滤，显示全部课程的星期）。
     */
    function scheduleWeekInfo() {
      var sem = Store.getSemester();
      var weekNum = 0;
      if (Number(sem.currentWeek) > 0) weekNum = Number(sem.currentWeek);
      else if (sem.semesterStart) weekNum = CGDate.semesterWeekOf(CGDate.todayStr(), sem.semesterStart);
      var manual = Number(sem.currentWeek) > 0;
      if (Number(schState.week) > 0) { weekNum = Number(schState.week); manual = true; }
      return { weekNum: weekNum, manual: manual, hasStart: !!sem.semesterStart, start: sem.semesterStart };
    }

    /**
     * renderSchedule() —— 渲染课程视图顶部的「课表」卡片
     * 桌面：7 列周课表网格；移动端：星期 tabs + 单日列表。今日高亮。
     */
    function renderSchedule() {
      var card = $('#scheduleCard');
      if (!card) return;
      var info = scheduleWeekInfo();
      var courses = Store.getCourses();
      var days = CourseSchedule.getWeeklyCourses(courses, info.weekNum);
      var todayStrNow = CGDate.todayStr();

      // 本周星期一起始日期：有学期开始日则按第 N 周推算，否则回退到本周一
      var monday = '';
      if (info.weekNum > 0 && info.start) monday = CGDate.dateOffset(info.start, (info.weekNum - 1) * 7);
      else monday = CGDate.dateOffset(todayStrNow, -CGDate.dateWeekday(todayStrNow));

      // ---- 周次标签 + 信息行 ----
      var weekLabel = '—';
      if (info.weekNum > 0) {
        weekLabel = '第 ' + info.weekNum + ' 周' + (info.manual ? '（手动）' : '');
      } else {
        weekLabel = info.hasStart ? '—' : '未设置';
      }
      var elWeek = $('#schWeekLabel');
      if (elWeek) elWeek.textContent = weekLabel;
      var rangeTxt = CGDate.formatDateShort(monday) + ' ~ ' + CGDate.formatDateShort(CGDate.dateOffset(monday, 6));
      var infoArr = [rangeTxt];
      if (!info.hasStart) infoArr.unshift('未设置学期开始日，课表按星期显示');
      if (info.hasStart && !info.manual && info.weekNum <= 0) infoArr.unshift('学期开始后自动计算周次');
      var infoEl = $('#schInfoText');
      if (infoEl) infoEl.textContent = infoArr.join(' · ');
      $('#schHint').style.display = info.hasStart ? 'none' : 'block';
      if (info.hasStart) {
        var startInput = $('#semesterStartDate');
        if (startInput && startInput.value !== info.start) startInput.value = info.start;
      }

      // ---- 空态 ----
      var hasAnyScheduled = courses.some(function (c) {
        var nc = CourseSchedule.normalizeCourse(c);
        return nc.slots && nc.slots.length > 0;
      });
      var emptyEl = $('#schEmpty');
      if (emptyEl) emptyEl.style.display = hasAnyScheduled ? 'none' : 'block';

      // ---- 桌面网格 ----
      var grid = $('#schGrid');
      var gridHtml = '';
      for (var d = 0; d < 7; d++) {
        var day = days[d];
        var dateStr = CGDate.dateOffset(monday, d);
        var isToday = dateStr === todayStrNow;
        var count = day.items.length;
        gridHtml += '<div class="sch-day' + (isToday ? ' today' : '') + '">' +
          '<div class="sch-day-head"><span>' + scheduleWeekdayCN(d) + ' ' + CGDate.formatDateShort(dateStr) + '</span>' +
          (count ? '<span class="count">' + count + '</span>' : '') + '</div>';
        if (count) {
          day.items.forEach(function (hit) {
            gridHtml += scheduleItemHtml(hit);
          });
        }
        gridHtml += '</div>';
      }
      grid.innerHTML = gridHtml;

      // ---- 移动端 tabs + 单日列表 ----
      renderScheduleTabs(days, monday);
      renderScheduleMobile(days, monday, info.weekNum);
    }

    /** scheduleWeekdayCN(d) —— weekday 序号(0=周一) → '周一'…'周日' */
    function scheduleWeekdayCN(d) { return CGDate.weekdayName(d) || ''; }

    /**
     * scheduleItemHtml(hit) —— 单个课程格（课表卡片，带 time 与教室信息）
     * click 时打开课程详情。
     */
    function scheduleItemHtml(hit) {
      var c = hit.course, s = hit.slot;
      var periodsTxt = s.periods && s.periods.length ? '第' + s.periods.join(',') + '节' : '';
      var timeTxt = CGDate.periodTimeRange(s.periods[0], s.periods[s.periods.length - 1]);
      var meta = [periodsTxt, timeTxt].filter(Boolean).join(' ');
      if (s.weeks) meta += (meta ? ' · ' : '') + s.weeks + '周';
      if (c.classroom) meta += (meta ? ' · ' : '') + esc(c.classroom);
      return '<button type="button" class="sch-item" data-detail-course="' + escAttr(c.id) + '">' +
        '<span class="it-name">' + esc(c.name) + '</span>' +
        (meta ? '<span class="it-meta">' + esc(meta) + '</span>' : '') +
        '</button>';
    }

    /** escAttr(v) —— HTML 属性转义（id 只做兜底） */
    function escAttr(v) { return String(v).replace(/"/g, '&quot;'); }

    /**
     * renderScheduleTabs(days, monday) —— 移动端星期 tabs
     */
    function renderScheduleTabs(days, monday) {
      var tabsEl = $('#schTabs');
      if (!tabsEl) return;
      var todayStrNow = CGDate.todayStr();
      var active = schState.mobileDay >= 0 ? schState.mobileDay : CGDate.dateWeekday(todayStrNow);
      if (active < 0) active = 0;
      var html = '';
      for (var d = 0; d < 7; d++) {
        var dateStr = CGDate.dateOffset(monday, d);
        var isToday = dateStr === todayStrNow;
        var name = scheduleWeekdayCN(d).replace('周', '');
        html += '<button type="button" class="sch-tab' + (d === active ? ' active' : '') + '" data-sch-day="' + d + '">' +
          name + (isToday ? '·今' : '') + '</button>';
      }
      tabsEl.innerHTML = html;
    }

    /**
     * renderScheduleMobile(days, monday) —— 移动端单日课程列表
     */
    function renderScheduleMobile(days, monday) {
      var host = $('#schMobile');
      if (!host) return;
      var todayStrNow = CGDate.todayStr();
      var active = schState.mobileDay >= 0 ? schState.mobileDay : CGDate.dateWeekday(todayStrNow);
      if (active < 0) active = 0;
      var day = days[active];
      var dateStr = CGDate.dateOffset(monday, active);
      var html = '<div class="sch-mday-title">' + scheduleWeekdayCN(active) + ' ' +
        CGDate.formatDateShort(dateStr) + (dateStr === todayStrNow ? '（今天）' : '') +
        (day.items.length ? ' · ' + day.items.length + ' 节' : '') + '</div>';
      if (!day.items.length) {
        html += '<div class="sch-empty" style="display:block;">当天没有课，好好休息 🌙</div>';
      } else {
        day.items.forEach(function (hit) { html += scheduleItemHtml(hit); });
      }
      host.innerHTML = html;
    }

    /**
     * openCourseDetail(id) —— 打开课程详情弹窗（Phase 9 能力：名称/教师/时段/周次/教室等）
     */
    function openCourseDetail(id) {
      var course = Store.getCourses().filter(function (c) { return c.id === id; })[0];
      if (!course) { toast('找不到该课程', 'warn'); return; }
      var nc = CourseSchedule.normalizeCourse(course);
      setText('cdTitle', '📘 ' + (nc.name || '课程'));

      var total = Number(nc.totalChapters) || 0;
      var learned = Number(nc.learnedChapters != null ? nc.learnedChapters : 0) || 0;
      var pct = total > 0 ? Math.min(100, Math.round((learned / total) * 100)) : (Number(nc.progress) || 0);
      $('#cdBar').style.width = Math.min(100, pct) + '%';
      $('#cdPct').textContent = pct + '%';

      var rows = [];
      // 上课时间
      var timeLabel = CourseSchedule.courseTimeLabel(nc);
      rows.push(['上课时间', timeLabel || '未排课', !timeLabel]);
      rows.push(['章节进度', total > 0 ? ('已学 ' + learned + ' / 共 ' + total + ' 章') : (nc.status === 'doing' ? '学习中' : '未开始'), false]);
      rows.push(['教师', nc.teacher || '—', !nc.teacher]);
      rows.push(['教室', nc.classroom || '—', !nc.classroom]);
      rows.push(['学分', nc.credits ? (nc.credits + ' 学分') : '—', !nc.credits]);
      rows.push(['课程类型', nc.courseType || '—', !nc.courseType]);
      rows.push(['学期', nc.semester || '—', !nc.semester]);
      rows.push(['备注', nc.notes || '—', !nc.notes]);

      var html = '';
      rows.forEach(function (r) {
        html += '<div class="cd-row' + (r[1].length > 24 ? ' full' : '') + (r[2] ? ' no-val' : '') + '">' +
          '<label>' + esc(r[0]) + '</label><div class="cd-val">' + esc(r[1]) + '</div></div>';
      });
      $('#cdInfo').innerHTML = html;
      openModal('modalCourseDetail');
      // 记住「编辑」要打开的是哪门课
      window.__cgDetailCourseId = id;
    }

    /**
     * applyImportPlan(plan) —— 按（新增/合并/跳过）计划写入 Store
     * 每个课程恰好一次业务写（addCourse / updateCourse），保证 revision 只 +1。
     * 【返回】统计 { added, merged, skipped }
     */
    function applyImportPlan(plan) {
      var stats = { added: 0, merged: 0, skipped: 0 };
      plan.forEach(function (item) {
        var c = item.candidate;
        if (item.action === 'new') {
          Store.addCourse({
            name: c.name,
            progress: 0, status: 'todo', totalChapters: 0, learnedChapters: 0,
            slots: c.slots || [],
            teacher: c.teacher || '', classroom: c.classroom || c.location || '',
            credits: c.credits || 0, courseType: c.courseType || '', semester: c.semester || '',
            notes: c.notes || ''
          });
          stats.added++;
        } else if (item.action === 'attach') {
          // 旧进度课程（无 slots）首次挂课表：一次 update 写入全部
          // 只补「目标为空」的元数据，绝不覆写手动录入值（progress 一律不碰）
          var attach = {
            slots: c.slots || [],
            teacher: c.teacher || item.target.teacher || '',
            classroom: c.classroom || c.location || item.target.classroom || ''
          };
          [['credits', 'credits'], ['courseType', 'courseType'],
           ['semester', 'semester'], ['notes', 'notes']].forEach(function (pair) {
            var tv = item.target[pair[0]];
            if (c[pair[1]] && (tv === undefined || tv === '' || tv === 0)) attach[pair[0]] = c[pair[1]];
          });
          Store.updateCourse(item.target.id, attach);
          stats.merged++;
        } else if (item.action === 'merge' || item.action === 'dup') {
          var patch = item.action === 'merge' ? CourseSchedule.mergeIntoCourse(c, item.target) : {};
          if (Object.keys(patch).length) {
            Store.updateCourse(item.target.id, patch);
            stats.merged++;
          } else {
            // 完全重复（dup）或合并后无任何差异 → 不写 Store、不产生 revision
            stats.skipped++;
          }
        } else {
          stats.skipped++;
        }
      });
      return stats;
    }

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
      var yesterday = Store.today(new Date(new Date().setDate(new Date().getDate() - 1)));
      var todosYesterday = Store.getTodosByDate(yesterday);
      var yesterdayActivity = Store.getReadingsByDate(yesterday).length +
        Store.getEnglishByDate(yesterday).length +
        Store.getSportsByDate(yesterday).length +
        Store.getFocusByDate(yesterday).length;

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
        nextTodo: todos.find(function (x) { return !x.done; }),
        yesterdayTodoTotal: todosYesterday.length,
        yesterdayTodoDone: todosYesterday.filter(function (x) { return x.done; }).length,
        yesterdayActivity: yesterdayActivity,
        growthBooks: Store.totalBooksFinished(),
        growthPages: Store.totalPagesRead(),
        growthRate: courses.length ? Store.courseAvgProgress() : 0,
        growthFocus: focusAll,
        growthStudy: Store.getEnglish().reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0),
        growthStreak: (Analytics.getStreaks().currentStreak || 0)   // 连续打卡：复用 Analytics 唯一口径（旧 continuousDays 字段从未被写入，恒 0）
      };
    }

    /* ---------- 更新 UI ---------- */
    // updateUI() 把 computeState() 计算出的数据「填」到页面的各个位置
    // 这是「数据驱动视图」模式：数据变了 → 重新计算 → 更新页面显示
    function updateUI() {
      var s = computeState();

      setText('welcomeName', s.nick);
      setText('welcomeDay', s.day);
      setText('greetWord', greetWord());
      setText('welcomeStreak', s.growthStreak);

      setText('planDone', s.planDone);
      setText('planTotal', s.planTotal);
      setText('planStatus', '今日 ' + s.planDone + ' / ' + s.planTotal);
      var planPercent = s.planTotal > 0 ? Math.round((s.planDone / s.planTotal) * 100) : 0;
      var planRing = document.getElementById('planRing');
      if (planRing) planRing.style.setProperty('--plan-percent', String(planPercent));
      setText('planRingNum', planPercent + '%');
      var nextEl = $('#todayNext');
      if (nextEl) {
        var nextAction = nextActionText(s);
        setText('todayNextText', nextAction);
        nextEl.hidden = !nextAction;
      }
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
      setText('readStatus', (s.readBooks + s.readPages) > 0 ? '今日进行中' : '今天可从 10 页开始');

      setText('englishCount', s.englishCount);
      setText('englishMinutes', s.englishMinutes);
      setText('englishStatus', (s.englishCount + s.englishMinutes) > 0 ? '今日进行中' : '今天可从 10 词开始');

      setText('sportCount', s.sportCount);
      setText('sportCal', s.sportCal);
      setText('sportStatus', (s.sportCount + s.sportCal) > 0 ? '今日进行中' : '今天可从 10 分钟开始');
      var st = $('#sportTip');
      if (st) st.style.display = (s.sportCount + s.sportCal) > 0 ? 'none' : 'inline';

      setText('focusCount', s.focusTodayCount);
      setText('focusMinutes', s.focusTodayMin);
      setText('focusStatus', s.focusTodayMin > 0 ? '今日专注 ' + s.focusTodayMin + ' 分钟' : '今天可专注 25 分钟');

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

      renderWbInsights(s);
      renderGrowthBrief(Store.get());
      if (typeof updateOnboardUI === 'function') updateOnboardUI();
    }

    var dismissedProposals = [];


    function renderRetention(snapshot, brief) {
      var today = brief && brief.date ? brief.date : undefined;
      var snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
      var welcomeEl = document.getElementById('retentionWelcome');
      var welcomeTitle = document.getElementById('retentionWelcomeTitle');
      var welcomeList = document.getElementById('retentionWelcomeRecords');
      var welcomeMsg = document.getElementById('retentionWelcomeMessage');
      if (welcomeEl && welcomeTitle && welcomeList && welcomeMsg) {
        var wb = RetentionContext.buildWelcomeBack(snap, { today: today });
        if (wb && wb.records.length) {
          welcomeEl.hidden = false;
          welcomeTitle.textContent = '欢迎回来';
          welcomeList.textContent = '';
          wb.records.forEach(function (record) {
            var li = document.createElement('li');
            li.textContent = record;
            welcomeList.appendChild(li);
          });
          welcomeMsg.textContent = wb.message;
        } else {
          welcomeEl.hidden = true;
          welcomeTitle.textContent = '';
          welcomeList.textContent = '';
          welcomeMsg.textContent = '';
        }
      }
      var streakEl = document.getElementById('retentionStreak');
      var streakMsg = document.getElementById('retentionStreakMessage');
      if (streakEl && streakMsg) {
        var sr = RetentionContext.buildStreakReminder(snap, { today: today });
        if (sr) {
          streakEl.hidden = false;
          streakMsg.textContent = sr.message;
        } else {
          streakEl.hidden = true;
          streakMsg.textContent = '';
        }
      }
      var candidateEl = document.getElementById('retentionCandidate');
      var candidateContent = document.getElementById('retentionCandidateContent');
      var candidateEvidence = document.getElementById('retentionCandidateEvidence');
      if (candidateEl && candidateContent && candidateEvidence) {
        var memory = snap.memory || null;
        var candidate = RetentionContext.getRetentionCandidate(memory);
        if (candidate) {
          candidateEl.hidden = false;
          candidateEl.setAttribute('data-candidate-id', candidate.id);
          candidateContent.textContent = candidate.content;
          candidateEvidence.textContent = candidate.evidence.length ? '依据：' + candidate.evidence.join('，') : '';
        } else {
          candidateEl.hidden = true;
          candidateEl.removeAttribute('data-candidate-id');
          candidateContent.textContent = '';
          candidateEvidence.textContent = '';
        }
      }
    }
    function renderGrowthBrief(snapshot) {
      var container = document.getElementById('growthBriefCard');
      if (!container) return;
      var brief = GrowthIntelligence.buildDailyInsight(
        snapshot && typeof snapshot === 'object' ? snapshot : Store.get()
      );
      AIActions.observeOutcome(Store);
      var statusEl = document.getElementById('growthBriefStatus');
      var scoreEl = document.getElementById('growthBriefScore');
      var rangesEl = document.getElementById('growthBriefRanges');
      var dateEl = document.getElementById('growthBriefDate');
      var changesEl = document.getElementById('growthBriefChanges');
      var actionsEl = document.getElementById('growthBriefActions');
      var stageEl = document.getElementById('growthBriefStage');
      var stageLabel = document.getElementById('growthBriefStageLabel');
      var stageDescription = document.getElementById('growthBriefStageDescription');
      var feedback = buildDailyFeedback(snapshot, {
        today: brief.date,
        todaySummary: brief.todaySummary,
        growthState: brief.growthState
      });
      var feedbackEl = document.getElementById('growthBriefFeedback');
      if (feedbackEl) {
        feedbackEl.innerHTML = '';
        var summaryTitle = document.createElement('h5');
        summaryTitle.textContent = '今日变化';
        var summaryText = document.createElement('p');
        summaryText.textContent = feedback.summary;
        feedbackEl.appendChild(summaryTitle);
        feedbackEl.appendChild(summaryText);

        var highlightTitle = document.createElement('h5');
        highlightTitle.textContent = '今日亮点';
        feedbackEl.appendChild(highlightTitle);
        if (feedback.highlights.length) {
          var highlightList = document.createElement('ul');
          feedback.highlights.forEach(function (highlight) {
            var item = document.createElement('li');
            item.textContent = highlight;
            highlightList.appendChild(item);
          });
          feedbackEl.appendChild(highlightList);
        } else {
          var emptyHighlight = document.createElement('p');
          emptyHighlight.textContent = '完成一次记录后，这里会生成你的今日成长反馈';
          feedbackEl.appendChild(emptyHighlight);
        }

        var actionTitle = document.createElement('h5');
        actionTitle.textContent = '下一步建议';
        feedbackEl.appendChild(actionTitle);
        if (feedback.nextActions.length) {
          var actionList = document.createElement('ul');
          feedback.nextActions.forEach(function (action) {
            var item = document.createElement('li');
            item.textContent = action;
            actionList.appendChild(item);
          });
          feedbackEl.appendChild(actionList);
        } else {
          var emptyAction = document.createElement('p');
          emptyAction.textContent = '完成一次记录后，这里会生成你的今日成长反馈';
          feedbackEl.appendChild(emptyAction);
        }
      }
      var narrative = GrowthTimeline.buildNarrative(GrowthTimeline.buildTimeline({
        today: brief.date,
        growthState: brief.growthState
      }));
      if (stageEl && stageLabel && stageDescription) {
        if (narrative.currentStage) {
          stageEl.hidden = false;
          stageLabel.textContent = '当前成长阶段：' + narrative.currentStage.label;
          stageDescription.textContent = narrative.currentStage.meaning;
        } else {
          stageEl.hidden = true;
          stageLabel.textContent = '';
          stageDescription.textContent = '';
        }
      }
      renderRetention(snapshot, brief);
      if (statusEl) statusEl.textContent = brief.status;
      renderGrowthScore(rangesEl, scoreEl, brief.growthState);
      if (dateEl) dateEl.textContent = brief.date;
      var whyEl = document.getElementById('growthBriefWhy');
      if (whyEl) whyEl.textContent = brief.why;
      if (changesEl) {
        changesEl.innerHTML = '';
        if (!brief.dataSufficient) {
          changesEl.appendChild(elBriefLine('当前数据不足，先连续记录 7 天后再看趋势。'));
        } else if (!brief.changes.length) {
          changesEl.appendChild(elBriefLine('最近没有明显变化，节奏平稳。'));
        } else {
          brief.changes.forEach(function (change) {
            changesEl.appendChild(elBriefLine(change.label + '：' + change.current + (change.previous ? '（上期 ' + change.previous + '）' : '') + '，' + (change.delta > 0 ? '+' : '') + change.delta + '%'));
          });
        }
      }
      var focusEl = document.getElementById('growthBriefFocus');
      if (focusEl) {
        focusEl.innerHTML = '';
        if (brief.concern) focusEl.appendChild(elBriefLine('关注：' + brief.concern.reason));
        if (brief.strength) focusEl.appendChild(elBriefLine('保持：' + brief.strength.reason));
        if (!brief.concern && !brief.strength) focusEl.appendChild(elBriefLine('暂无足够数据生成风险或优势信号。'));
      }
      if (actionsEl) {
        actionsEl.innerHTML = '';
        var outcomes = AIActions.observeOutcome(Store);
        outcomes.forEach(function (outcome) {
          if (outcome.status === 'pending') return;
          var line = elBriefLine(outcome.status === 'completed' ? '已完成的建议：' + outcome.id : '进行中的建议：' + outcome.id);
          line.classList.add('brief-positive');
          actionsEl.appendChild(line);
        });
        var proposals = brief.recommendedActions.filter(function (proposal) {
          return dismissedProposals.indexOf(proposal.id) < 0;
        });
        if (!proposals.length && !outcomes.length) actionsEl.appendChild(elBriefLine('当前数据不足，暂无可靠建议。'));
        proposals.forEach(function (proposal) {
          CoachMemory.addRecommendation(proposal);
          var row = document.createElement('div');
          row.className = 'growth-brief-action';
          var copy = document.createElement('div');
          copy.appendChild(document.createElement('strong')).textContent = proposal.title;
          copy.appendChild(document.createElement('span')).textContent = '为什么：' + proposal.why;
          row.appendChild(copy);
          var buttons = document.createElement('div');
          var adopt = document.createElement('button');
          adopt.type = 'button';
          adopt.className = 'btn-primary brief-adopt';
          adopt.textContent = proposal.type === 'review_goal' ? '查看目标' : '采用建议';
          adopt.addEventListener('click', function () { adoptProposal(proposal); });
          var dismiss = document.createElement('button');
          dismiss.type = 'button';
          dismiss.className = 'btn-wb ghost';
          dismiss.textContent = '忽略';
          dismiss.addEventListener('click', function () {
            AIActions.rejectProposal(proposal);
            dismissedProposals.push(proposal.id);
      renderGrowthBrief(Store.get());
          });
          buttons.appendChild(adopt);
          buttons.appendChild(dismiss);
          row.appendChild(buttons);
          actionsEl.appendChild(row);
        });
      }
    }

    function renderGrowthScore(rangesEl, scoreEl, growthState) {
      if (!rangesEl) return;
      rangesEl.innerHTML = '';
      if (!growthState || !growthState.growthScore || !growthState.growthSummary) return;

      if (scoreEl) {
        scoreEl.hidden = false;
        scoreEl.textContent = 'Growth Score ' + growthState.growthScore.value + ' / 100 · ' +
          (growthState.growthScore.dataSufficient ? '由完成、连续性与趋势加权得出' : '数据不足，等待更多记录');
      }

      ['7d', '30d', '90d'].forEach(function (key) {
        var range = growthState.growthSummary.ranges && growthState.growthSummary.ranges[key];
        if (!range) return;
        var card = document.createElement('div');
        card.className = 'growth-brief-range';
        var title = document.createElement('h5');
        title.textContent = key === '7d' ? '7天' : (key === '30d' ? '30天' : '90天');
        var body = document.createElement('p');
        body.textContent = [
          '学习：' + range.learningTrend.description,
          range.consistency.description,
          range.tasks.description
        ].join(' ');
        card.appendChild(title);
        card.appendChild(body);
        rangesEl.appendChild(card);
      });
    }

    function elBriefLine(text) {
      var line = document.createElement('div');
      line.className = 'growth-brief-line';
      line.textContent = text;
      return line;
    }

    function adoptProposal(proposal) {
      var result = AIActions.applyProposal(Store, proposal);
      if (!result.accepted) {
        toast('这个建议暂时不能自动执行', 'warn');
        return;
      }
      if (result.result && result.result.navigation) {
        window.location.href = result.result.navigation === 'goals' ? 'goals.html' : 'stats.html';
        return;
      }
            renderGrowthBrief(Store.get());
      toast('已加入今日计划，完成后会反馈到成长简报', 'success');
    }

    function nextActionText(s) {
      if (s.nextTodo) return '从「' + (s.nextTodo.text || '未命名待办') + '」开始，完成后进度会立刻更新。';
      if (!s.nextTodo && !Store.getGoals().length) return '先去目标页定一个小目标，今天的记录就有了方向。';
      if (!Store.isCheckedIn(today())) return '先完成今日打卡，把今天的节奏启动起来。';
      if (!Store.getCourses().length) return '添加一门课程，学习进度会开始自动汇总。';
      if (s.planTotal === 0) return '今天的计划还是空的，添加一件 10 分钟的小事。';
      return '今日待办已完成，可以补一条阅读、运动或专注记录。';
    }

    /* ========== 今日发现（UI-2）==========
     * 基于真实记录的本地规则洞察（非 AI、非虚构）：
     * 只读 CGStore/Analytics 展示层数据，无任何写入。 */
    function greetWord() {
      var h = new Date().getHours();
      if (h < 5) return '夜深了';
      if (h < 11) return '早上好';
      if (h < 14) return '中午好';
      if (h < 18) return '下午好';
      return '晚上好';
    }

    function renderWbInsights(s) {
      var list = $('#wbInsightList');
      var empty = $('#wbInsightEmpty');
      if (!list) return;

      var items = [];
      // 昨日承接：只引用真实历史记录，帮助用户感知连续性。
      if (s.yesterdayTodoTotal > 0) {
        items.push(s.yesterdayTodoDone > 0
          ? { dot: 'sky', text: '昨天完成 ' + s.yesterdayTodoDone + ' / ' + s.yesterdayTodoTotal + ' 项待办，今天接着推进。' }
          : { dot: 'sky', text: '昨天计划了 ' + s.yesterdayTodoTotal + ' 项待办，今天可以从中挑一件重新开始。' });
      } else if (s.yesterdayActivity > 0) {
        items.push({ dot: 'sky', text: '昨天有 ' + s.yesterdayActivity + ' 条成长记录，今天继续接上就好。' });
      } else if (s.planTotal === 0 && s.growthStreak === 0) {
        items.push({ dot: 'amber', text: '还没有历史记录。先打卡或做一件 10 分钟的小事，洞察会从这里开始。' });
      }
      // 连续记录：有积累时给正反馈
      if (s.growthStreak >= 2) {
        items.push({ dot: 'teal', text: '你已经连续打卡 ' + s.growthStreak + ' 天，节奏保持得很好。' });
      }
      // 今日待办：指向下一步行动
      if (s.planTotal > 0) {
        var left = s.planTotal - s.planDone;
        items.push(left <= 0
          ? { dot: 'teal', text: '今日 ' + s.planTotal + ' 件待办已全部完成，可以安心收尾了。' }
          : { dot: 'amber', text: '今日还有 ' + left + ' 件待办，从第一件开始就好。' });
      }
      // 专注：给出今日现状与温和建议
      if (s.focusTodayMin > 0) {
        items.push({ dot: 'sky', text: '今天已专注 ' + s.focusTodayMin + ' 分钟（' + s.focusTodayCount + ' 次），积累看得见。' });
      } else if (s.growthStreak >= 1) {
        items.push({ dot: 'sky', text: '今天还没有专注记录，试试一次 25 分钟的深度专注。' });
      }
      // 阅读：有在读时提醒进度
      if (s.readBooks > 0 && s.readPages > 0) {
        items.push({ dot: 'teal', text: '书架上正在读 ' + s.readBooks + ' 本，今日已读 ' + s.readPages + ' 页。' });
      }

      // 全部无记录：诚实空态，不编造发现
      if (!items.length) {
        list.innerHTML = '';
        list.style.display = 'none';
        if (empty) empty.hidden = false;
        return;
      }
      list.style.display = '';
      if (empty) empty.hidden = true;
      list.innerHTML = items.map(function (it) {
        return '<li class="dot-' + it.dot + '">' + esc(it.text) + '</li>';
      }).join('');
    }

    /* ========== 列表渲染：课程 ========== */
    function renderCourseList() {
      var host = $('#courseList');
      if (!host) return;
      var courses = Store.getCourses();
      host.innerHTML = '';
      if (!courses.length) {
        host.innerHTML = '<div class="item-empty">还没有课程。点击「添加课程」，学习进度会自动汇总。</div>';
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
          '<button class="item-btn edit" data-edit-course="' + c.id + '" aria-label="编辑课程">✏️</button>' +
          '<button class="item-btn del" data-del-course="' + c.id + '" aria-label="删除课程">🗑</button>';
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
          '<button class="item-btn edit" data-edit-book="' + b.id + '" aria-label="编辑书籍">✏️</button>' +
          '<button class="item-btn del" data-del-book="' + b.id + '" aria-label="删除书籍">🗑</button>';
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
        host.innerHTML = '<div class="item-empty">还没有运动记录。今天 10 分钟散步也算一次有效开始。</div>';
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
          '<button class="item-btn del" data-del-sport="' + s.id + '" aria-label="删除运动记录">🗑</button>';
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
        host.innerHTML = '<div class="item-empty">还没有英语记录。先背 10 个词，节奏就建立起来了。</div>';
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
          '<button class="item-btn del" data-del-english="' + r.id + '" aria-label="删除英语记录">🗑</button>';
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
          '<button class="item-btn del" data-del-focus="' + f.id + '" aria-label="删除专注记录">🗑</button>';
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
        host.innerHTML = '<div class="item-empty">今天还没有任务。点击「+ 添加任务」，先安排一件 10 分钟的小事。</div>';
        return;
      }
      todos.slice(0, 20).forEach(function (t) {
        var row = document.createElement('div');
        row.className = 'task-row' + (t.done ? ' done' : '');
        row.innerHTML =
          '<div class="t-check' + (t.done ? ' checked' : '') + '" data-toggle-todo="' + t.id + '" title="点击切换完成">' + (t.done ? '✓' : '') + '</div>' +
          '<div class="t-text">' + esc(t.text) + '</div>' +
          '<button class="item-btn del" data-del-todo="' + t.id + '" title="删除" aria-label="删除待办">🗑</button>';
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
      var trigger = e.target.closest('.card-action, .btn-primary, .btn-wb, #newBtn, #bellBtn, [data-edit-course], [data-del-course], [data-detail-course], [data-edit-book], [data-del-book], [data-del-sport], [data-del-english], [data-del-focus], [data-toggle-todo], [data-del-todo], [data-more-ch]');
      if (!trigger) return;
      e.preventDefault();

      var act = trigger.getAttribute('data-act');

      // 今日打卡
      if (act === 'checkin') {
        var already = Store.isCheckedIn(today());
        if (already) { toast('✅ 今天已打卡，继续保持！', 'info'); }
        else { Store.addCheckin(today(), 'done'); updateUI(); notifyRecordSaved('✅ 今日打卡成功！'); }
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

      // 添加课程 → 打开模态框（清空表单 + 展开课程编排区域）
      if (act === 'add-course') {
        resetCourseForm();
        openModal('modalAddCourse');
        setTimeout(function () { var n = $('#courseName'); n && n.focus(); }, 120);
        return;
      }

      // 导入课表 → 打开模态框（默认到「粘贴文本」Tab，无需后端）
      if (act === 'import-course') {
        if ($('#importCourseText')) $('#importCourseText').value = '';
        if ($('#importCoursePreview')) { $('#importCoursePreview').hidden = true; $('#importCoursePreview').innerHTML = ''; }
        switchImportCourseTab('text');
        openModal('modalImportCourse');
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
        prefillCourseScheduleForm('editCourse', course);
        openModal('modalEditCourse');
        return;
      }

      // 课程详情
      if (trigger.hasAttribute('data-detail-course')) {
        openCourseDetail(trigger.getAttribute('data-detail-course'));
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
        var toggledTodo = Store.toggleTodo(trigger.getAttribute('data-toggle-todo'));
        updateUI();
        if (toggledTodo && toggledTodo.done) notifyRecordSaved('任务已完成');
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
      var payload = {
        name: name, totalChapters: total, learnedChapters: learned,
        progress: prog, status: prog >= 100 ? 'done' : (prog > 0 ? 'doing' : 'todo')
      };
      // 排课信息（可选）：选了星期才带 slots
      var sched = collectCourseSchedule('course');
      var meta = collectCourseMeta('course');
      if (sched) { payload.slots = sched; payload.semester = meta.semester; }
      payload.teacher = meta.teacher;
      payload.classroom = meta.classroom;
      payload.credits = meta.credits;
      payload.courseType = meta.courseType;
      payload.notes = meta.notes;
      if (meta.semester) payload.semester = meta.semester;
      // 同名课程允许存在（可能是不同班次/老师），但要让用户知道不是误操作
      var isDupName = Store.get().courses.some(function (c) { return c.name === name; });
      Store.addCourse(payload);
      updateUI();
      closeModal('modalAddCourse');
      toast(isDupName ? '已存在同名课程，本次已作为新的班次添加。' : '课程已添加：' + name, 'success');
    });

    // 导入课表：通过链接抓取并解析课程，按名称去重合并进 Store
    $('#importCourseBtn').addEventListener('click', function () {
      var url = $('#importCourseUrl').value.trim();
      if (!url) { toast('请输入课表页面链接', 'warn'); return; }
      if (!/^https?:\/\//i.test(url)) {
        toast('链接需以 http:// 或 https:// 开头', 'warn');
        return;
      }
      var btn = $('#importCourseBtn');
      var original = btn.textContent;
      btn.disabled = true;
      btn.textContent = '抓取中…';
      CGAPI.course.importFromUrl(url)
        .then(function (res) {
          var list = res && res.data && res.data.courses;
          if (!list || !list.length) throw new Error('未解析到课程');
          // Phase 9：转成与文本解析一致的形态（后端 slots 的 period 是单节），
          // 再按「课程名 + 时段」去重计划合并，绝不静默覆盖手动编辑
          var candidates = (list || []).map(function (item) {
            return {
              name: (item && item.name || '').trim(),
              slots: (item && item.slots || []).map(function (s) {
                return { weekday: s.weekday, periods: [s.period] };
              }).filter(function (s) { return s.weekday >= 0; }),
              weeks: item && item.weeks || '',
              location: item && item.location || ''
            };
          });
          var plan = CourseSchedule.planImport(candidates, Store.getCourses());
          var stats = applyImportPlan(plan);
          closeModal('modalImportCourse');
          updateUI();
          if (stats.added > 0 || stats.merged > 0) {
            toast('✅ 已导入 ' + stats.added + ' 门课程' + (stats.merged ? '，合并 ' + stats.merged + ' 门' : '') + (stats.skipped ? '，跳过 ' + stats.skipped + ' 门' : ''), 'success');
          } else {
            toast('解析到课程均已在列表中，未新增', 'info');
          }
        })
        .catch(function (err) {
          var msg = (err && err.message) || '无法解析该课表，请确认是可公开访问的表格页面';
          toast('导入失败：' + msg, 'warn');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = original;
        });
    });

    // ============================================================
    // 粘贴课表文本 → 纯前端解析（无需后端、无需网址）
    // ============================================================

    /**
     * 示例课表文本 —— 供用户在没有课表时快速体验解析效果。
     * 故意混入三种写法（连堂区间「1-2节」、中文数字节次「第五、六节」、
     * 多行块状），一次性展示解析器的主要能力。
     */
    var SAMPLE_SCHEDULE = [
      '课程表 2026-2027学年第一学期',
      '',
      '高等数学 周一第1-2节 1-16周 教三A101 张三',
      '大学英语 周三第3,4节 1-16周 教四302 李四',
      '线性代数 周二 第3-4节 1-16周 教二205',
      '数据结构',
      '周四 第五、六节 1-16周',
      '实验楼B301',
      '王老师',
      '大学物理 周五第7-8节 1-16周 教一108',
      '体育 周三第9-10节 1-16周 体育馆',
    ].join('\n');

    (function initImportCourseTabs() {
      var tabs = $$('.ic-tab');
      tabs.forEach(function (t) {
        t.addEventListener('click', function () {
          switchImportCourseTab(t.getAttribute('data-ic-tab'));
        });
      });

      // 实时解析预览：textarea 变化时即时显示识别结果
      var ta = $('#importCourseText');
      if (ta) ta.addEventListener('input', renderImportPreview);

      // 载入示例：填入示例文本并立即预览
      var sample = $('#loadSampleSchedule');
      if (sample) {
        sample.addEventListener('click', function (ev) {
          ev.preventDefault();
          if (!ta) return;
          ta.value = SAMPLE_SCHEDULE;
          renderImportPreview();
          toast('已载入示例课表，可直接点「解析并导入」', 'info');
        });
      }
    })();

    function switchImportCourseTab(which) {
      $$('.ic-tab').forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-ic-tab') === which);
      });
      $$('.ic-pane').forEach(function (p) {
        var on = p.getAttribute('data-ic-pane') === which;
        p.classList.toggle('active', on);
        p.hidden = !on;
      });
      $$('[data-ic-foot]').forEach(function (b) {
        var on = b.getAttribute('data-ic-foot') === which;
        b.hidden = !on;
      });
      // 切到文本 Tab 时即时刷一次预览
      if (which === 'text') renderImportPreview();
    }

    /**
     * 取得课表解析函数。
     * 优先用模块具名导入（构建期绑定，最可靠）；
     * 兜底用 globalThis 上的同名函数（便于在浏览器控制台直接调试，
     * 也兼容理论上未走打包器的引用方式）。
     */
    function getScheduleParser() {
      if (typeof parseScheduleText === 'function') return parseScheduleText;
      if (typeof globalThis !== 'undefined' && typeof globalThis.CGParseScheduleText === 'function') {
        return globalThis.CGParseScheduleText;
      }
      return null;
    }

    /**
     * 把解析器结果渲染到预览区，并按名去重（与既有 courses 比较）。
     * 让用户在点「导入」前先看清识别结果，必要时改粘贴内容。
     */
    function renderImportPreview() {
      var ta = $('#importCourseText');
      var pv = $('#importCoursePreview');
      if (!ta || !pv) return;
      var raw = ta.value || '';
      if (!raw.trim()) { pv.hidden = true; pv.innerHTML = ''; return; }

      var parser = getScheduleParser();
      if (!parser) {
        pv.hidden = false;
        pv.innerHTML = '<div class="ic-preview-empty">⚠️ 解析器未加载，请刷新页面或检查 js/scheduleTextParser.js</div>';
        return;
      }

      var list;
      try { list = parser(raw); }
      catch (e) {
        pv.hidden = false;
        pv.innerHTML = '<div class="ic-preview-empty">⚠️ 解析异常：' + escapeHtml(e.message || String(e)) + '</div>';
        return;
      }

      pv.hidden = false;
      if (!list || !list.length) {
        pv.innerHTML = '<div class="ic-preview-empty">⚠️ 未识别到任何课程。请确认复制了完整的课表内容（应包含「周一/周二」等星期词，或课程名称）。</div>';
        return;
      }

      // Phase 9：按 数量统计 + 逐门动线（新增/合并/跳过）生成预览
      var plan = CourseSchedule.planImport(list, Store.getCourses());
      var cnt = { new: 0, merge: 0, skip: 0 };
      var ACTION_TEXT = { new: '🆕 新增', attach: '🔗 合并到现有', merge: '🔀 合并', dup: '⏭ 跳过（重复）', skip: '⏭ 跳过' };
      var html = '<div class="ic-preview-title">✅ 识别到 ' + list.length + ' 门课程</div>';
      plan.forEach(function (item) {
        var isAdd = item.action === 'new';
        if (isAdd) cnt.new++;
        else if (item.action === 'merge' || item.action === 'attach') cnt.merge++;
        else cnt.skip++;
        var slotsTxt = (item.candidate.slots || []).map(function (s) {
          var wd = ['周一','周二','周三','周四','周五','周六','周日'][s.weekday] || ('星期' + (s.weekday + 1));
          return wd + ' 第' + (s.periods && s.periods.length ? s.periods.join(',') : '?') + '节';
        }).join('；');
        var meta = [
          slotsTxt,
          item.candidate.weeks ? (item.candidate.weeks + '周') : '',
          item.candidate.location ? ('@ ' + item.candidate.location) : ''
        ].filter(Boolean).join(' · ');
        html += '<div class="ic-preview-item">'
          + '<span class="ic-preview-name">' + escapeHtml(item.candidate.name) +
            ' <span style="font-size:.66rem;color:var(--text-muted);font-weight:400;">' + (ACTION_TEXT[item.action] || item.action) + '</span></span>'
          + (meta ? '<span class="ic-preview-meta">' + escapeHtml(meta) + '</span>' : '')
          + '</div>';
      });
      html += '<div class="ic-preview-warn">'
        + '将新增 <b>' + cnt.new + '</b> 门，合并 <b>' + cnt.merge + '</b> 门，跳过重复 <b>' + cnt.skip + '</b> 门。'
        + (cnt.new + cnt.merge === 0 ? '（课程都在了，你可以关闭此窗口）' : '点击「解析并导入」完成。')
        + '</div>';
      pv.innerHTML = html;
    }

    // 解析并导入按钮
    $('#parseCourseTextBtn').addEventListener('click', function () {
      var ta = $('#importCourseText');
      var raw = (ta && ta.value) || '';
      if (!raw.trim()) { toast('请先粘贴课表文本', 'warn'); return; }
      var parser = getScheduleParser();
      if (!parser) { toast('解析器未加载，请刷新页面', 'error'); return; }

      var list;
      try { list = parser(raw); }
      catch (e) { toast('解析异常：' + (e.message || e), 'error'); return; }

      if (!list || !list.length) {
        toast('未识别到任何课程。请检查粘贴内容是否包含星期词或课程名', 'warn');
        return;
      }

      // Phase 9：按「课程名 + 时段」去重计划合并（绝不静默覆盖手动编辑）
      var plan = CourseSchedule.planImport(list, Store.getCourses());
      var stats = applyImportPlan(plan);

      closeModal('modalImportCourse');
      updateUI();
      if (stats.added > 0 || stats.merged > 0) {
        var msg = '✅ 导入完成：新增 ' + stats.added + ' 门'
          + (stats.merged ? '，合并 ' + stats.merged + ' 门' : '')
          + (stats.skipped ? '，跳过重复 ' + stats.skipped + ' 门' : '');
        var noSlot = plan.some(function (p) { return p.candidate && !(p.candidate.slots && p.candidate.slots.length); });
        if (noSlot) msg += '（部分课程未识别到时段，请手动补全章节数）';
        toast(msg, 'success');
      } else {
        toast('解析到课程均已在列表中，未新增', 'info');
      }
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
      var ePayload = {
        name: name, totalChapters: total, learnedChapters: learned,
        progress: prog, status: prog >= 100 ? 'done' : (prog > 0 ? 'doing' : 'todo')
      };
      // 元数据始终回写（编辑弹窗已回填当前值）
      var eMeta = collectCourseMeta('editCourse');
      ePayload.teacher = eMeta.teacher;
      ePayload.classroom = eMeta.classroom;
      ePayload.credits = eMeta.credits;
      ePayload.courseType = eMeta.courseType;
      ePayload.semester = eMeta.semester;
      ePayload.notes = eMeta.notes;
      // 排课：用户本次选择了星期 → 以新时段替换；未选 → 保留原排课不动
      var eSched = collectCourseSchedule('editCourse');
      if (eSched) ePayload.slots = eSched;
      Store.updateCourse(editingCourseId, ePayload);
      editingCourseId = null;
      updateUI();
      closeModal('modalEditCourse');
      toast('✅ 课程已更新', 'success');
    });

    /* ---------- 课表控件绑定（Phase 9） ---------- */

    // 节次下拉选项（添加/编辑弹窗共用）
    initPeriodSelects();

    // 学期开始日变更 → 保存配置并重算周次
    var semStartInput = $('#semesterStartDate');
    if (semStartInput) {
      semStartInput.addEventListener('change', function () {
        Store.setSemester({ semesterStart: this.value || '' });
        schState.week = 0; // 改了开始日，回到自动周次
        renderSchedule();
      });
    }

    // 上一周 / 下一周 / 回到本周
    // 注意：只有 currentWeek 真的变化时才写 Store（避免值未变也 bump revision、标脏 user 待推送）
    function setWeekIfChanged(desired) {
      if (Number(Store.getSemester().currentWeek) !== Number(desired)) {
        Store.setSemester({ currentWeek: desired });
      }
    }
    $('#semWeekPrev')?.addEventListener('click', function () {
      var info = scheduleWeekInfo();
      var w = (Number(info.weekNum) > 0 ? Number(info.weekNum) : 1) - 1;
      schState.week = w > 0 ? w : 1;
      setWeekIfChanged(schState.week);
      renderSchedule();
    });
    $('#semWeekNext')?.addEventListener('click', function () {
      var info = scheduleWeekInfo();
      var w = (Number(info.weekNum) > 0 ? Number(info.weekNum) : 0) + 1;
      schState.week = w;
      setWeekIfChanged(w);
      renderSchedule();
    });
    $('#semWeekNow')?.addEventListener('click', function () {
      schState.week = 0;
      setWeekIfChanged(0); // 0 = 自动（按学期开始日推算）
      renderSchedule();
    });

    // 移动端星期 tabs 切换
    var schTabsEl = $('#schTabs');
    if (schTabsEl) {
      schTabsEl.addEventListener('click', function (e) {
        var tab = e.target.closest && e.target.closest('.sch-tab');
        if (!tab) return;
        schState.mobileDay = Number(tab.getAttribute('data-sch-day')) || 0;
        renderSchedule();
      });
    }

    // 详情弹窗 → 编辑
    $('#cdEditBtn')?.addEventListener('click', function () {
      var cid = window.__cgDetailCourseId;
      if (!cid) return;
      var course = Store.getCourses().filter(function (c) { return c.id === cid; })[0];
      if (!course) { closeModal('modalCourseDetail'); return; }
      closeModal('modalCourseDetail');
      editingCourseId = cid;
      $('#editCourseName').value = course.name || '';
      $('#editCourseTotal').value = Number(course.totalChapters) || 0;
      $('#editCourseLearned').value = Number(course.learnedChapters) || 0;
      prefillCourseScheduleForm('editCourse', course);
      openModal('modalEditCourse');
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
      notifyRecordSaved('✅ 书籍已添加：' + name);
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
      notifyRecordSaved('运动已记录：' + type);
    });

    // 保存英语
    $('#saveEngBtn').addEventListener('click', function () {
      var words = parseInt($('#engWords').value, 10) || 0;
      var mins = parseInt($('#engMin').value, 10) || 0;
      if (words < 1) { toast('单词数必须大于 0', 'warn'); return; }
      Store.addEnglish({ date: today(), words: words, minutes: mins });
      updateUI();
      closeModal('modalAddEnglish');
      notifyRecordSaved('英语学习已记录：' + words + ' 词');
    });

    // 保存新建任务
    $('#saveTaskBtn').addEventListener('click', function () {
      var text = ($('#taskText').value || '').trim();
      var pri = $('#taskPriority').value || 'mid';
      if (!text) { toast('请输入任务内容', 'warn'); return; }
      Store.addTodo({ text: text, date: today(), done: false, priority: pri });
      updateUI();
      closeModal('modalAddTask');
      toast('已添加任务：' + text, 'success');
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
      notifyRecordSaved(auto ? ('专注完成，+' + elapsedMin + ' 分钟') : ('已记录 ' + elapsedMin + ' 分钟专注'));
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
        var nc = CourseSchedule.normalizeCourse(c);
        var timeTxt = CourseSchedule.courseTimeLabel(nc);
        var el = document.createElement('div');
        el.className = 'cv-item';
        el.innerHTML =
          '<div class="cv-main">' +
            '<div class="cv-name">' + esc(c.name) + '</div>' +
            '<div class="cv-sub">共 ' + total + ' 章 · 已学 ' + learned + ' 章' +
              (timeTxt ? '<br><span style="opacity:.85;">🕒 ' + esc(timeTxt) + '</span>' : '') +
            '</div>' +
            '<div class="cv-bar"><div class="cv-fill" style="width:' + pct + '%;"></div></div>' +
            '<div class="cv-actions">' +
              '<button data-more-ch="' + c.id + '" title="学完一章">＋1 章</button>' +
              '<button data-detail-course="' + c.id + '">👁 详情</button>' +
              '<button data-edit-course="' + c.id + '">✏️ 编辑</button>' +
              '<button data-del-course="' + c.id + '">🗑 删除</button>' +
            '</div>' +
          '</div>' +
          '<div class="cv-pct ' + (pct >= 100 ? 'done' : '') + '">' + pct + '%' + (pct >= 100 ? ' 🎉' : '') + '</div>';
        host.appendChild(el);
      });
      // 课程视图里同步渲染课表卡片（首页登录后首次进入也在这里触发）
      if (typeof renderSchedule === 'function') renderSchedule();
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

    /* ---------- 新手指引 ---------- */
    function onboardState() {
      return {
        checkin: !!Store.isCheckedIn(today()),
        goal: (Store.getGoals() || []).length > 0,
        course: (Store.getCourses() || []).length > 0,
        todo: (Store.getTodosByDate(today()) || []).length > 0,
      };
    }

    function hasAnyRecord() {
      var s = onboardState();
      return s.checkin || s.goal || s.course || s.todo ||
        (Store.getReadings() || []).length > 0 ||
        (Store.getSports() || []).length > 0 ||
        (Store.getEnglish() || []).length > 0 ||
        (Store.getFocus() || []).length > 0;
    }

    function updateOnboardUI() {
      var card = $('#onboardCard');
      if (!card || card.classList.contains('hidden')) return;
      var s = onboardState();
      [['checkin', s.checkin], ['goal', s.goal], ['course', s.course], ['todo', s.todo]].forEach(function (pair) {
        var btn = document.querySelector('#onboardActions [data-ob="' + pair[0] + '"]');
        if (btn) btn.classList.toggle('done', pair[1]);
      });
      var doneCount = (s.checkin ? 1 : 0) + (s.goal ? 1 : 0) + (s.course ? 1 : 0) + (s.todo ? 1 : 0);
      setText('#onboardProgress', doneCount + ' / 4');
      if (doneCount === 4) finishOnboard(true);
    }

    function maybeShowOnboard() {
      var card = $('#onboardCard');
      if (!card) return;
      try {
        var u = Store.getUser() || {};
        if (u.onboarded || hasAnyRecord()) return;
      } catch (_) { return; }
      card.classList.remove('hidden');
      updateOnboardUI();
    }

    function finishOnboard(silent) {
      var card = $('#onboardCard');
      if (card) card.classList.add('hidden');
      try { Store.setUser({ onboarded: true }); } catch (_) {}
      if (!silent) toast('新手指引完成，开始记录你的成长吧！', 'success');
    }

    /* ---------- 课程弹窗表单辅助 ---------- */

    /**
     * resetCourseForm() —— 清空「添加课程」表单（含排课区域）
     * 声明在 IIFE 顶层：点击委托与 onboarding 引导都会调用。
     */
    function resetCourseForm() {
      var fields = [
        ['courseName', ''], ['courseTotal', '20'], ['courseLearned', '0'],
        ['courseWeekday', ''], ['courseStartPeriod', '1'], ['courseEndPeriod', '1'],
        ['courseWeeks', ''], ['courseSemester', ''], ['courseTeacher', ''],
        ['courseClassroom', ''], ['courseCredits', '0'], ['courseNotes', '']
      ];
      fields.forEach(function (pair) {
        var el = document.getElementById(pair[0]);
        if (el) el.value = pair[1];
      });
      var typeEl = $('#courseCourseType');
      if (typeEl) typeEl.value = '';
    }

    function runOnboardAction(action) {
      if (action === 'checkin') {
        if (!Store.isCheckedIn(today())) {
          Store.addCheckin(today(), 'done');
          updateUI();
          notifyRecordSaved('✅ 今日打卡成功！');
        }
        return;
      }
      if (action === 'goal') {
        location.href = 'goals.html';
        return;
      }
      if (action === 'course') {
        resetCourseForm();
        openModal('modalAddCourse');
        return;
      }
      if (action === 'todo') {
        var taskTextEl = $('#taskText');
        if (taskTextEl) taskTextEl.value = '';
        var priSel = $('#taskPriority');
        if (priSel) priSel.value = 'mid';
        openModal('modalAddTask');
        setTimeout(function () { taskTextEl && taskTextEl.focus(); }, 120);
      }
    }

    var obCloseBtn = $('#onboardClose');
    if (obCloseBtn) obCloseBtn.addEventListener('click', function () {
      finishOnboard(true);
      toast('已跳过新手引导，随时可以从目标页开始', 'info');
    });
    document.querySelectorAll('#onboardActions [data-ob]').forEach(function (btn) {
      btn.addEventListener('click', function () { runOnboardAction(this.getAttribute('data-ob')); });
    });

    /* ---------- 首次加载（初始化） ---------- */
    // init() 在页面加载完毕后执行，负责：
    //   1. 从云端同步最新数据（如果有登录态）
    //   2. 恢复主题偏好
    //   3. 更新页面显示
    function init() {
      if (window.CGSync && CGStore.getToken && CGStore.getToken()) {
        try {
          var revisionBefore = CGStore.getRevision();
          window.CGSync.afterLogin().then(function () {
            if (revisionBefore !== CGStore.getRevision()) {
              updateUI();
              maybeShowOnboard();
            }
          }).catch(function () {});
        } catch (_) {}
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
      var courseSpace = mountCourseSpace();
      courseSpace.loadSnapshot();
      mountCourseSpaceExtraction();
      // 支持从其它页面直达：workbench.html?view=course / manage / profile
      var wantView = new URLSearchParams(location.search).get('view');
      if (WB_VIEWS.indexOf(wantView) === -1) wantView = 'home';
      switchWbView(wantView);
      maybeShowOnboard();
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
setupServiceWorker();
