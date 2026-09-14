import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/ui/modal.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';
import Analytics, { isValidDateStr } from '../js/analytics.js';

// ====================================================================
// 晨光自律台 · 统计中心 (Stats Center)
// ====================================================================
// 本页面是「数据驾驶舱」。架构遵循 Phase 10 的「Unified Analytics」：
//
//     CGStore → Analytics.snapshot()（一次读取） → Analytics（唯一统计）
//            → StatsViewModel（纯格式化 / 空态判断 / 图表数据集组装）
//            → render*()（只做 DOM 写入）
//
// 【承诺】
//   - 所有业务统计来自 CGAnalytics，本页**绝不重新计算业务统计**。
//     只做：数的格式化、日期文本、空态判定、Chart 数据集组装。
//   - 单次快照 → 多个区块；不重复 snapshot，不重复造 Chart。
//   - Stats 只读：不写 CGStore / localStorage / revision，不触发 sync。
//   - 切换时间范围时先销毁旧图再建新图，避免 canvas already in use /
//     memory leak / 图表叠加。
// ====================================================================

'use strict';

var Store = globalThis.CGStore;

/* ---------- 认证检查 ---------- */
function checkAuth() {
  var token = Store && Store.getToken ? Store.getToken() : localStorage.getItem('cg_token');
  if (!token) { toast('请先登录', 'error'); setTimeout(function () { window.location.href = 'index.html'; }, 800); return false; }
  return true;
}

/* ---------- 图表颜色（对齐「晨光·静」品牌 token） ---------- */
var C = {
  amber: '#e8a85c', teal: '#4fc3b4', sky: '#7ba7d9',
  text1: '#f2efe8', text2: '#b8b3a8', text3: '#8d887d',
  cardBg: '#191c22', line: 'rgba(255,255,255,.07)', lineStrong: 'rgba(255,255,255,.14)',
};

/* ---------- Chart.js 懒加载 ---------- */
var chartLoaded = false;
function loadChartJS() {
  if (chartLoaded && window.Chart) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'assets/vendor/chart.umd.min.js';
    s.onload = function () { chartLoaded = true; setupDefaults(); resolve(); };
    s.onerror = function () { reject(new Error('Chart.js load failed')); };
    document.head.appendChild(s);
  });
}
function setupDefaults() {
  if (!window.Chart) return;
  Chart.defaults.color = C.text2;
  Chart.defaults.font.family = 'system-ui, -apple-system, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.borderColor = C.line;
  Chart.defaults.plugins.legend.labels.color = C.text2;
  Chart.defaults.plugins.legend.labels.padding = 12;
  Chart.defaults.plugins.tooltip.backgroundColor = C.cardBg;
  Chart.defaults.plugins.tooltip.titleColor = C.text1;
  Chart.defaults.plugins.tooltip.bodyColor = C.text2;
  Chart.defaults.plugins.tooltip.borderColor = C.lineStrong;
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = false;
}
function gradient(ctx, c1, c2) { try { var g = ctx.createLinearGradient(0, 0, 0, 200); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; } catch (_) { return c1; } }

/* ---------- 当前时间范围状态 ---------- */
var currentRangeKey = 'week';

/* 自定义范围长度硬上限（避免数据口径被 eachDay guard 静默截断而无提示） */
var MAX_CUSTOM_DAYS = 733;

/* 活跃构成类别（Analytics.getActivityDistribution().categories 的有序展示） */
var ACTIVITY_CATS = [['checkin', '打卡'], ['focus', '专注'], ['english', '英语'], ['sports', '运动'], ['reading', '阅读'], ['todo', '待办'], ['course', '课程']];

/* ====================================================================
   时间范围
   ==================================================================== */
function resolveRange(key) {
  if (key === 'today') { var t = Analytics.today(); return { key: 'today', label: '今日', range: [t, t] }; }
  if (key === 'week') { var w = Analytics.thisWeek(); return { key: 'week', label: '本周', range: w }; }
  if (key === 'month') { var m = Analytics.thisMonth(); return { key: 'month', label: '本月', range: m }; }
  if (key === 'custom') {
    var s = document.getElementById('customStart').value;
    var e = document.getElementById('customEnd').value;
    if (s && e && s <= e) {
      if (countDays(s, e) > MAX_CUSTOM_DAYS) { toast('自定义范围过长，请控制在两年以内', 'warn'); return null; }
      return { key: 'custom', label: '自定义', range: [s, e] };
    }
    return null;
  }
  return null;
}

function describeRange(r) {
  if (!r) return '';
  if (r.key === 'today') return '今日 · ' + formatDateCN(r.range[0]);
  if (r.key === 'week') return '本周 · ' + formatDateCN(r.range[0]) + ' – ' + formatDateCN(r.range[1]);
  if (r.key === 'month') return '本月 · ' + r.range[0].slice(0, 4) + '年' + parseInt(r.range[0].slice(5, 7), 10) + '月';
  return '自定义 · ' + formatDateCN(r.range[0]) + ' – ' + formatDateCN(r.range[1]);
}

function countDays(a, b) { var n = 0, cur = a, guard = 0; while (cur <= b && guard <= 3660) { n++; cur = dateOffset(cur, 1); guard++; } return n; }

function chartLabel(ds, withWeekday) { var l = formatDateShort(ds); if (withWeekday) l += ' ' + weekdayName(dateWeekday(ds)); return l; }

/* ====================================================================
   Stats ViewModel —— 只做「取数 + 格式化」，不重算业务统计
   ==================================================================== */
function buildStatsViewModel(snap, range) {
  var s = range.range[0], e = range.range[1];
  var days = countDays(s, e);
  var drs = Analytics.getDateRangeSummary(s, e, snap) || null;
  var streaks = Analytics.getStreaks(snap);

  var vm = { range: range, days: days, hasData: hasAnyData(snap) };

  /* ---- 概览 ---- */
  vm.overview = {
    activeDays: drs ? drs.activity.activeDays : 0,
    dayTotal: days,
    todoRate: drs && drs.todos ? drs.todos.completionRate : 0,
    currentStreak: streaks.currentStreak,
    focusMinutes: drs ? drs.focus.minutes : 0,
    studyMinutes: drs ? drs.study.minutes : 0,
  };

  /* ---- 学习 ---- */
  var study = Analytics.getStudySummary(s, e, snap) || { minutes: 0, englishMinutes: 0, focusMinutes: 0, words: 0, readingPages: 0 };
  var readings = drs ? drs.readings : { entries: 0, pages: 0 };
  vm.learning = {
    minutes: study.minutes,
    englishMinutes: study.englishMinutes,
    words: study.words,
    readingEntries: readings.entries,
    readingPages: readings.pages,
  };

  /* ---- 运动（含类型分布） ---- */
  vm.exercise = Analytics.getExerciseSummary(s, e, snap) || { count: 0, minutes: 0, calories: 0, types: {} };

  /* ---- 专注 ---- */
  vm.focus = drs ? drs.focus : { sessions: 0, minutes: 0, avgMinutes: 0 };

  /* ---- 待办 ---- */
  vm.todo = Analytics.getTodoSummary(s, e, snap) || { total: 0, done: 0, pending: 0, overdue: 0, completionRate: 0 };

  /* ---- 课程 ---- */
  vm.course = Analytics.getCourseSummary(snap);

  /* ---- 趋势 ---- */
  vm.trend = buildTrends(snap, s, e, days);

  return vm;
}

function buildTrends(snap, s, e, days) {
  if (days <= 1) {
    var dist = Analytics.getActivityDistribution(s, s, snap);
    return { kind: 'today', daily: Analytics.getDailySummary(s, snap), categories: (dist && dist[0]) ? dist[0].categories : null };
  }
  var mode = days > 62 ? 'weekly' : 'daily';
  return {
    kind: mode,
    mode: mode,
    activity: Analytics.getTrend('activity', s, e, mode, snap),
    study: Analytics.getTrend('study', s, e, mode, snap),
    focus: Analytics.getTrend('focus', s, e, mode, snap),
  };
}

function hasAnyData(snap) {
  return ['checkins', 'english', 'focus', 'sports', 'readings', 'todos', 'courses'].some(function (k) {
    return Array.isArray(snap[k]) && snap[k].length > 0;
  });
}

/* 数据过稀提示：区间有记录但不足以形成趋势 */
function isSparse(vm) { return vm.overview.activeDays < 3 && vm.days > 3; }

/* ====================================================================
   Charts —— 统一生命周期 + 配置组装
   ==================================================================== */
var liveCharts = [];
function trackChart(ch) { liveCharts.push(ch); return ch; }
function disposeCharts() {
  liveCharts.forEach(function (c) { try { if (c && c.destroy) c.destroy(); } catch (_) {} });
  liveCharts = [];
}
function hasData(series) { return series.some(function (d) { return d.value > 0; }); }

function buildLineConfig(labels, data, color, fill, title) {
  return {
    type: 'line',
    data: { labels: labels, datasets: [{ label: title, data: data, borderColor: color, borderWidth: 2.5, tension: .35, pointBackgroundColor: color, pointRadius: 3, pointHoverRadius: 6, fill: true, backgroundColor: fill }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' ' + title + ': ' + formatMinutes(c.parsed.y); } } } },
      scales: { x: { grid: { display: false }, ticks: { color: C.text3, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: C.line }, ticks: { color: C.text3, callback: function (v) { return formatMinutes(v); } } } },
    },
  };
}

function buildBarConfig(labels, data, fill, border, opts) {
  opts = opts || {};
  return {
    type: 'bar',
    data: { labels: labels, datasets: [{ label: opts.yLabel || '值', data: data, backgroundColor: fill, borderColor: border, borderWidth: 1, borderRadius: 4, barPercentage: .72, categoryPercentage: .8 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' ' + (opts.tip || '值') + ': ' + c.parsed.y; } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.text3, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { beginAtZero: true, grid: { color: C.line }, ticks: { color: C.text3, stepSize: opts.step || undefined, precision: opts.prec || 0, callback: opts.yCb || undefined } },
      },
    },
  };
}

/* ====================================================================
   Render —— 各区块
   ==================================================================== */
function $(sel, root) { try { return (root || document).querySelector(sel); } catch (_) { return null; } }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function statCard(label, value, unit, sub) {
  var el = document.createElement('div'); el.className = 'stat-card';
  el.innerHTML = '<div class="stat-value">' + esc(String(value)) + (unit ? '<span class="unit">' + esc(unit) + '</span>' : '') + '</div>' +
    '<div class="stat-label">' + esc(label) + '</div>' + (sub ? '<div class="stat-sub">' + esc(sub) + '</div>' : '');
  return el;
}

function statRow(label, value, small) {
  var el = document.createElement('div'); el.className = 'stat-row';
  el.innerHTML = '<span class="label">' + esc(label) + '</span><span class="value">' + esc(String(value)) + (small ? '<small>' + esc(small) + '</small>' : '') + '</span>';
  return el;
}

function renderOverview(grid, vm) {
  grid.innerHTML = '';
  var o = vm.overview;
  grid.appendChild(statCard('活跃天数', o.activeDays + ' / ' + o.dayTotal, '天', '有记录的天数'));
  grid.appendChild(statCard('完成率', o.todoRate, '%', '待办完成率'));
  grid.appendChild(statCard('当前连续', o.currentStreak, '天', '连续打卡'));
  grid.appendChild(statCard('总专注', formatMinutes(o.focusMinutes), '', '专注时间'));
  grid.appendChild(statCard('学习量', formatMinutes(o.studyMinutes), '', '英语 + 专注'));
}

/* ====================================================================
   趋势解读（UI-2）—— 最近 7 天 vs 再往前 7 天的真实对比
   只读 Analytics，只做展示层比较；无趋势时显示「暂无趋势」。
   ==================================================================== */
function renderInsight(snap) {
  var list = document.getElementById('insightList');
  var empty = document.getElementById('insightEmpty');
  if (!list) return;

  var today = Analytics.today();
  var curStart = dateOffset(today, -6);
  var prevEnd = dateOffset(today, -7);
  var prevStart = dateOffset(today, -13);

  var cur = Analytics.getDateRangeSummary(curStart, today, snap) || null;
  var prev = Analytics.getDateRangeSummary(prevStart, prevEnd, snap) || null;
  var curFocus = cur ? cur.focus.minutes : 0;
  var prevFocus = prev ? prev.focus.minutes : 0;
  var curActive = cur ? cur.activity.activeDays : 0;
  var prevActive = prev ? prev.activity.activeDays : 0;
  var curTodo = cur && cur.todos ? cur.todos.completionRate : 0;
  var prevTodo = prev && prev.todos ? prev.todos.completionRate : 0;

  var items = [];
  // 专注时长：与上个 7 天对比
  if (prevFocus > 0 && curFocus !== prevFocus) {
    var pct = Math.round(Math.abs(curFocus - prevFocus) / prevFocus * 100);
    items.push({ dot: curFocus > prevFocus ? 'teal' : 'sky',
      text: '专注时长较上个 7 天' + (curFocus > prevFocus ? '增加' : '减少') + ' ' + pct + '%。' });
  } else if (prevFocus === 0 && curFocus > 0) {
    items.push({ dot: 'teal', text: '专注重新开始积累：最近 7 天共 ' + formatMinutes(curFocus) + '。' });
  }
  // 活跃天数：与上个 7 天对比
  if (prevActive > 0 && curActive !== prevActive) {
    items.push({ dot: curActive > prevActive ? 'teal' : 'sky',
      text: '活跃天数 ' + curActive + ' 天，' + (curActive > prevActive ? '多于' : '少于') + '上个 7 天的 ' + prevActive + ' 天。' });
  }
  // 待办完成率：与上个 7 天对比
  if (prevTodo > 0 && curTodo !== prevTodo) {
    var diff = Math.round(curTodo - prevTodo);
    items.push({ dot: diff > 0 ? 'teal' : 'sky',
      text: '待办完成率' + (diff > 0 ? '提升' : '回落') + ' ' + Math.abs(diff) + ' 个百分点。' });
  }

  if (!items.length) {
    list.innerHTML = '';
    list.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  list.hidden = false;
  if (empty) empty.hidden = true;
  list.innerHTML = items.map(function (it) {
    return '<li class="dot-' + it.dot + '">' + esc(it.text) + '</li>';
  }).join('');
}

function renderTrend(grid, vm) {
  grid.innerHTML = '';
  var t = vm.trend;
  if (t.kind === 'today') { renderTodayTrend(grid, t.categories); return; }
  grid.appendChild(trendCell('活跃度', t.activity, vm.trend.mode, 'activity'));
  grid.appendChild(trendCell('学习时长', t.study, vm.trend.mode, 'study'));
  grid.appendChild(trendCell('专注时长', t.focus, vm.trend.mode, 'focus'));
}

function trendCell(title, series, mode, metric) {
  var cell = document.createElement('div');
  cell.className = 'trend-cell' + (metric === 'activity' ? ' wide' : '');
  var t = document.createElement('div'); t.className = 'trend-title'; t.textContent = title; cell.appendChild(t);
  var wrap = document.createElement('div'); wrap.className = 'trend-chart'; cell.appendChild(wrap);
  if (!hasData(series)) { wrap.innerHTML = '<div class="trend-empty">暂无数据</div>'; return cell; }
  var canvas = document.createElement('canvas'); wrap.appendChild(canvas);
  var ctx;
  try { ctx = canvas.getContext('2d'); } catch (_) { ctx = null; }
  if (!ctx || !window.Chart) return cell;
  try {
    var labels = series.map(function (d) { return mode === 'weekly' ? formatDateShort(d.date) : chartLabel(d.date, metric === 'activity'); });
    var vals = series.map(function (d) { return d.value; });
    var cfg;
    if (metric === 'activity') cfg = buildBarConfig(labels, vals, gradient(ctx, 'rgba(232,168,92,.2)', 'rgba(232,168,92,0)'), C.amber, { tip: '活跃类别', step: 1, prec: 0, yCb: function (v) { return v; } });
    else if (metric === 'study') cfg = buildLineConfig(labels, vals, C.teal, 'rgba(79,195,180,.06)', '学习');
    else cfg = buildLineConfig(labels, vals, C.sky, 'rgba(123,167,217,.06)', '专注');
    trackChart(new Chart(ctx, cfg));
  } catch (_) { wrap.innerHTML = '<div class="trend-empty">暂无法绘制</div>'; }
  return cell;
}

function renderTodayTrend(grid, categories) {
  var cell = document.createElement('div'); cell.className = 'trend-cell wide';
  var t = document.createElement('div'); t.className = 'trend-title'; t.textContent = '今日活跃构成'; cell.appendChild(t);
  var wrap = document.createElement('div'); wrap.className = 'trend-chart'; cell.appendChild(wrap);
  if (!categories) { wrap.innerHTML = '<div class="trend-empty">今日暂无活跃记录</div>'; grid.appendChild(cell); return; }
  var canvas = document.createElement('canvas'); wrap.appendChild(canvas);
  var ctx;
  try { ctx = canvas.getContext('2d'); } catch (_) { ctx = null; }
  if (!ctx || !window.Chart) { grid.appendChild(cell); return; }
  try {
    var labels = [], data = [];
    ACTIVITY_CATS.forEach(function (entry) {
      if (entry[0] === 'course') return; // course 由排课得出，今日构成中并入专注/学习已体现，避免重复
      labels.push(entry[1]); data.push(categories[entry[0]] ? 1 : 0);
    });
    if (!data.some(function (v) { return v > 0; })) { wrap.innerHTML = '<div class="trend-empty">今日暂无活跃记录</div>'; grid.appendChild(cell); return; }
    var cfg = buildBarConfig(labels, data, gradient(ctx, 'rgba(79,195,180,.2)', 'rgba(79,195,180,.05)'), C.teal, { tip: '做到', step: 1, prec: 0, yCb: function (v) { return v; } });
    trackChart(new Chart(ctx, cfg));
  } catch (_) { wrap.innerHTML = '<div class="trend-empty">暂无法绘制</div>'; }
  grid.appendChild(cell);
}

function renderLearning(body, vm) {
  body.innerHTML = '';
  var l = vm.learning;
  body.appendChild(statRow('学习时间', formatMinutes(l.minutes)));
  body.appendChild(statRow('英语学习', formatMinutes(l.englishMinutes)));
  body.appendChild(statRow('单词量', formatNumber(l.words), '个'));
  var reading = l.readingEntries > 0 ? (l.readingEntries + ' 本 · ' + formatNumber(l.readingPages) + ' 页') : '暂无阅读记录';
  body.appendChild(statRow('阅读', reading));
}

function renderExercise(body, vm) {
  body.innerHTML = '';
  var x = vm.exercise;
  body.appendChild(statRow('运动次数', x.count, '次'));
  body.appendChild(statRow('运动时长', formatMinutes(x.minutes)));
  body.appendChild(statRow('消耗热量', formatNumber(x.calories), 'kcal'));
  var keys = Object.keys(x.types || {});
  if (keys.length) {
    var chips = document.createElement('div'); chips.className = 'type-chips';
    keys.forEach(function (t) { var s = document.createElement('span'); s.className = 'chip'; s.textContent = t + ' × ' + x.types[t]; chips.appendChild(s); });
    body.appendChild(chips);
  } else {
    var note = document.createElement('div'); note.className = 'stat-note'; note.textContent = '本时段暂无运动类型分布'; body.appendChild(note);
  }
}

function renderFocus(body, vm) {
  body.innerHTML = '';
  var f = vm.focus;
  body.appendChild(statRow('专注次数', f.sessions, '次'));
  body.appendChild(statRow('专注时长', formatMinutes(f.minutes)));
  body.appendChild(statRow('平均每次', formatMinutes(f.avgMinutes)));
}

function renderTodo(body, vm) {
  body.innerHTML = '';
  var t = vm.todo;
  body.appendChild(statRow('已完成', t.done, '件'));
  body.appendChild(statRow('未完成', t.pending, '件'));
  if (t.overdue > 0) body.appendChild(statRow('已逾期', t.overdue, '件'));
  var rate = Math.max(0, Math.min(100, t.completionRate || 0));
  var block = document.createElement('div'); block.className = 'rate-block';
  block.innerHTML = '<div class="rate-label"><span>完成率</span><span>' + rate + '%</span></div>' +
    '<div class="progress"><div class="progress-bar teal" style="width:' + rate + '%"></div></div>';
  body.appendChild(block);
}

function renderCourse(body, typesEl, vm) {
  body.innerHTML = '';
  var c = vm.course;
  body.appendChild(statRow('课程总数', c.count, '门'));
  body.appendChild(statRow('平均进度', c.avgProgress, '%'));
  body.appendChild(statRow('已完成', c.done, '门'));
  body.appendChild(statRow('进行中', c.pending, '门'));
  var k = Object.keys(c.typeDistribution || {});
  typesEl.innerHTML = '';
  if (k.length) {
    var chips = document.createElement('div'); chips.className = 'type-chips';
    k.forEach(function (t) { var s = document.createElement('span'); s.className = 'chip'; s.textContent = t + ' × ' + c.typeDistribution[t]; chips.appendChild(s); });
    typesEl.appendChild(chips);
  } else {
    var note = document.createElement('div'); note.className = 'stat-note'; note.textContent = '暂无课程类型分布'; typesEl.appendChild(note);
  }
}

function renderCourseChart(canvas, vm) {
  var total = vm.course.done + vm.course.pending;
  var rate = total > 0 ? Math.round((vm.course.done / total) * 100) : 0;
  var ctx;
  try { ctx = canvas.getContext('2d'); } catch (_) { ctx = null; }
  if (!ctx || !window.Chart) return;
  try {
    var chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: total === 0 ? ['暂无课程'] : ['已完成', '未完成'],
        datasets: [{ data: total === 0 ? [1] : [vm.course.done, vm.course.pending], backgroundColor: total === 0 ? ['#4a4a4a'] : [C.teal, '#f0ede8'], borderColor: C.cardBg, borderWidth: 3, hoverOffset: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, color: C.text2 } },
          tooltip: { callbacks: { label: function (c) { return total === 0 ? ' 暂无课程' : ' ' + c.label + ': ' + c.parsed + ' 个'; } } },
        },
      },
      plugins: [{ id: 'centerText', afterDraw: function (chart) {
        var ctx2 = chart.ctx, a = chart.chartArea; if (!a) return;
        var cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
        ctx2.save(); ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
        ctx2.fillStyle = C.text1; ctx2.font = 'bold 24px "SF Mono", sans-serif';
        ctx2.fillText(total === 0 ? '—' : rate + '%', cx, cy - 4);
        ctx2.fillStyle = C.text3; ctx2.font = '11px sans-serif';
        ctx2.fillText(total === 0 ? '暂无课程' : '完成率', cx, cy + 16);
        ctx2.restore();
      }}],
    });
    trackChart(chart);
  } catch (_) {}
}

function renderPersonalBest(body, pb) {
  body.innerHTML = '';
  addPB(body, '最长连续打卡', pb.longestStreak + '<span class="unit">天</span>', pb.longestStreak > 0 ? '历史最佳' : '暂无打卡');
  addPB(body, '单日专注最长', pbVal(pb.maxFocus, '分钟'));
  addPB(body, '单日学习最多', pbVal(pb.maxStudy, '分钟'));
  addPB(body, '单日运动最多', pbVal(pb.maxSports, '次'));
  addPB(body, '单日阅读最多', pbVal(pb.maxReadingPages, '页'));
  addPB(body, '单日英语最长', pbVal(pb.maxEnglish, '分钟'));
}
function pbVal(best, unit) {
  if (!best) return { html: '—', sub: '暂无记录' };
  return { html: String(best.value) + (unit ? '<span class="unit">' + unit + '</span>' : ''), sub: formatDateShort(best.date) };
}
function addPB(body, label, valueHtml, sub) {
  var el = document.createElement('div'); el.className = 'pb-item';
  el.innerHTML = '<div class="pb-value">' + valueHtml + '</div><div class="pb-label">' + esc(label) + '</div>' + (sub ? '<div class="stat-sub">' + esc(sub) + '</div>' : '');
  body.appendChild(el);
}

/* ====================================================================
   热力图（年度 · GitHub 风格）
   ==================================================================== */
function heatLevel(n) { return n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4; }

function renderHeatmap(container, tooltip, snap) {
  var today = Analytics.today();
  var start = dateOffset(today, -364);
  var map = {};
  Analytics.getActivityMap(snap, { today: today }).forEach(function (d) { map[d.date] = d.count; });
  var detail = {};
  Analytics.getActivityDistribution(start, today, snap).forEach(function (d) { detail[d.date] = d; });

  var days = [];
  for (var i = 0; i < 365; i++) {
    var ds = dateOffset(start, i);
    var cnt = map[ds] || 0;
    days.push({ date: ds, count: cnt, level: heatLevel(cnt), dow: dateWeekday(ds), active: cnt > 0 });
  }
  var weeks = [], cur = [];
  for (var j = 0; j < days[0].dow; j++) cur.push(null);
  days.forEach(function (d) { cur.push(d); if (cur.length === 7) { weeks.push(cur); cur = []; } });
  if (cur.length > 0) weeks.push(cur);

  var months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  var wdShort = ['一', '', '三', '', '五', '', '日'];
  var h = '<div class="hm-container"><div class="hm-months">';
  var lm = -1;
  weeks.forEach(function (w, wi) {
    var fr = w.find(function (d) { return d; });
    if (fr) { var m = parseInt(fr.date.split('-')[1], 10); if (m !== lm) { h += '<span style="grid-column:' + (wi + 1) + '">' + months[m - 1] + '</span>'; lm = m; } }
  });
  h += '</div><div class="hm-body"><div class="hm-weekdays">';
  wdShort.forEach(function (l) { h += '<span>' + l + '</span>'; });
  h += '</div><div class="hm-grid" role="grid" aria-label="年度活跃热力图">';
  weeks.forEach(function (w) {
    h += '<div class="hm-col" role="row">';
    w.forEach(function (d) {
      if (!d) { h += '<div class="hm-cell hm-empty" role="gridcell"></div>'; return; }
      var lbl = formatDateCN(d.date) + ' · 活跃度 ' + d.count;
      h += '<div class="hm-cell hm-level-' + d.level + (d.active ? ' hoverable' : '') + '" data-date="' + d.date + '" role="gridcell"' +
        (d.active ? ' tabindex="0"' : '') + ' aria-label="' + lbl + '" title="' + lbl + '"></div>';
    });
    h += '</div>';
  });
  h += '</div></div><div class="hm-legend"><span>少</span>';
  for (var lv = 0; lv < 5; lv++) h += '<div class="hm-cell hm-level-' + lv + '"></div>';
  h += '<span>多</span></div></div>';
  // 渲染到内层 #heatmapGrid，保留容器里的 tooltip 元素——
  // 此前 container.innerHTML 会把 #heatmapTooltip 一并清掉，悬停/点击详情从此静默失效
  var grid = document.getElementById('heatmapGrid');
  if (!grid) {
    grid = document.createElement('div');
    grid.id = 'heatmapGrid';
    container.appendChild(grid);
  }
  grid.innerHTML = h;
  container._detail = detail;
  hideTooltip(tooltip);
}

/* ====================================================================
   主渲染调度
   ==================================================================== */
function setHidden(id, hidden) { var el = document.getElementById(id); if (el) el.hidden = hidden; }
function setText(elOrId, text) { var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId; if (el) el.textContent = text != null ? text : ''; }
function setHint(id, text) { setText(id, text); }

function hideStates() { setHidden('statsError', true); setHidden('statsEmpty', true); var d = $('#statsDashboard'); if (d) d.hidden = false; }
function showError() { setHidden('statsError', false); setHidden('statsEmpty', true); var d = $('#statsDashboard'); if (d) d.hidden = true; }
function showEmpty() { setHidden('statsError', true); setHidden('statsEmpty', false); var d = $('#statsDashboard'); if (d) d.hidden = true; }

function render(vm, snap) {
  var labelText = describeRange(vm.range);
  var accountUser = (() => {
    try { return JSON.parse(localStorage.getItem('cg_user') || 'null') || {}; } catch (_) { return {}; }
  })();
  var displayName = (snap.user && snap.user.name) || accountUser.nickname || accountUser.name || '';
  setText('rangeLabel', labelText);
  setText('welcomeName', displayName ? '· ' + displayName : '');
  setHint('ovHint', labelText);
  setHint('learnHint', labelText);
  setHint('exHint', labelText);
  setHint('focusHint', labelText);
  setHint('todoHint', labelText);
  setHint('trendHint', labelText + (vm.trend.kind === 'weekly' ? ' · 按周聚合' : ''));

  renderOverview($('#overviewGrid'), vm);
  renderInsight(snap);
  renderTrend($('#trendGrid'), vm);
  renderHeatmap($('#heatmapContainer'), $('#heatmapTooltip'), snap);
  renderLearning($('#learningBody'), vm);
  renderExercise($('#exerciseBody'), vm);
  renderFocus($('#focusBody'), vm);
  renderTodo($('#todoBody'), vm);
  renderCourse($('#courseBody'), $('#courseTypes'), vm);
  renderCourseChart($('#completionChart'), vm);
  renderPersonalBest($('#personalBestBody'), Analytics.getPersonalBest(snap));
}

/* ====================================================================
   加载调度
   ==================================================================== */
async function loadAll() {
  disposeCharts();
  try {
    var snap = Analytics.snapshot();
    if (!hasAnyData(snap)) { showEmpty(); return; }
    await loadChartJS();
    var range = resolveRange(currentRangeKey);
    if (!range) { toast('请先选择有效的自定义日期范围', 'warn'); return; }
    var vm = buildStatsViewModel(snap, range);
    hideStates();
    render(vm, snap);
  } catch (e) {
    showError();
  }
}

/* ====================================================================
   热力图交互（hover / focus）
   ==================================================================== */
function hideTooltip(tooltip) { if (tooltip) { tooltip.classList.remove('show'); tooltip.style.opacity = 0; } }
function showTooltip(tooltip) { if (tooltip) { tooltip.classList.add('show'); tooltip.style.opacity = 1; } }

function heatHover(e) {
  var cell = e.target;
  if (!cell || !cell.classList || !cell.classList.contains('hoverable')) return;
  var tooltip = $('#heatmapTooltip'); var container = $('#heatmapContainer');
  if (!tooltip || !container) return;
  var date = cell.getAttribute('data-date');
  var detail = container._detail || {};
  var d = detail[date];
  var html = '<div class="tooltip-label">' + esc(formatDateCN(date)) + ' · ' + esc(weekdayName(dateWeekday(date))) + '</div>';
  if (d && d.categories) {
    var names = [];
    ACTIVITY_CATS.forEach(function (entry) {
      var k = entry[0];
      if (k !== 'course' && d.categories[k]) names.push(entry[1]);
    });
    html += '<div>活跃度 ' + d.score + '</div>';
    if (names.length) html += '<div class="tooltip-value">' + names.map(function (n) { return esc(n); }).join(' · ') + '</div>';
  } else {
    html += '<div>活跃度 0</div>';
  }
  tooltip.innerHTML = html;
  showTooltip(tooltip);
  var box = cell.getBoundingClientRect();
  var cbox = container.getBoundingClientRect();
  if (box && box.width && cbox) {
    // tooltip 绝对定位于容器坐标空间，需减去容器左上角（getBoundingClientRect 是视口坐标）
    tooltip.style.left = (box.left + box.width / 2 - cbox.left) + 'px';
    tooltip.style.top = (box.top - cbox.top) + 'px';
  }
}
function heatOut(e) {
  var tooltip = $('#heatmapTooltip'); if (!tooltip) return;
  var to = e.relatedTarget;
  if (to && to.classList && to.classList.contains('hoverable')) return;
  hideTooltip(tooltip);
}

/* ====================================================================
   事件绑定
   ==================================================================== */
function setActiveTab(key) {
  $$('.range-tab').forEach(function (btn) {
    var active = btn.getAttribute('data-range') === key;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}
function showCustomRange(show) { var el = $('#customRange'); if (el) el.hidden = !show; }
function applyCustomRange() {
  var s = $('#customStart').value, e = $('#customEnd').value;
  if (!s || !e) { toast('请选择开始与结束日期', 'warn'); return; }
  if (s > e) { toast('开始日期不能晚于结束日期', 'warn'); return; }
  currentRangeKey = 'custom'; setActiveTab('custom'); loadAll();
}

function setupEvents() {
  $$('.range-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-range');
      if (key === 'custom') { setActiveTab('custom'); showCustomRange(true); return; }
      currentRangeKey = key; setActiveTab(key); showCustomRange(false); loadAll();
    });
  });
  var tabsEl = $('.range-tabs');
  if (tabsEl) tabsEl.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var btns = $$('.range-tab'); var idx = btns.indexOf(document.activeElement);
    if (idx < 0) return;
    e.preventDefault();
    var ni = (idx + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
    btns[ni].focus(); btns[ni].click();
  });
  var refresh = $('#refreshBtn');
  if (refresh) refresh.addEventListener('click', function () {
    var btn = this; btn.disabled = true; var ic = btn.querySelector('i'); if (ic) ic.className = 'fas fa-sync-alt fa-spin';
    loadAll().then(function () { btn.disabled = false; if (ic) ic.className = 'fas fa-sync-alt'; toast('数据已刷新', 'success'); });
  });
  var apply = $('#customApply');
  if (apply) apply.addEventListener('click', applyCustomRange);
  var retry = $('#statsRetry');
  if (retry) retry.addEventListener('click', function () { loadAll(); });
  var hm = $('#heatmapContainer');
  if (hm) {
    hm.addEventListener('mouseover', heatHover); hm.addEventListener('mouseout', heatOut);
    hm.addEventListener('focusin', heatHover); hm.addEventListener('focusout', heatOut);
    // 触屏兜底：没有 hover，点格子显示详情、点空白处收起（Phase 15 移动端走查 P2）
    hm.addEventListener('click', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('hoverable')) heatHover(e);
      else heatOut(e);
    });
  }
  window.addEventListener('chenguang:update', function () { loadAll(); });
}

/* ---------- 初始化 ---------- */
if (checkAuth()) {
  setActiveTab('week'); showCustomRange(false);
  setupEvents();
  loadAll();
}

/* 注册 Service Worker（仅 http(s) 环境） */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').catch(function (e) { console.warn('[SW] register failed:', e); });
  });
}
