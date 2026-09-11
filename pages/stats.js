import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/ui/modal.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';
import Analytics, { isValidDateStr } from '../js/analytics.js';

// ====================================================================
// 晨光自律台 · 统计数据页面 (Stats Page)
// ====================================================================
// 这个页面使用 Chart.js 图表库来可视化展示用户的统计数据：
//   - KPI 指标卡（连续打卡天数、总打卡数、课程完成率、学习时长）
//   - 折线图（近 7 天打卡数 + 学习时长趋势）
//   - 环形图（课程完成率）
//   - 柱状图（近 30 天学习时长分布）
//   - 热力图（类似 GitHub 的贡献热力图，展示全年活动强度）
//
// Chart.js 是一个流行的 JavaScript 图表库，可以在 Canvas 上绑制各种图表
// ====================================================================

(function () {
  'use strict';

  var Store = window.CGStore;

  /* ---------- 认证检查 ---------- */
  // checkAuth() 检查用户是否已登录
  // 如果没有登录令牌（cg_token），显示提示并跳转到首页
  function checkAuth() {
    var token = Store.getToken ? Store.getToken() : localStorage.getItem('cg_token');
    if (!token) { toast('请先登录', 'error'); setTimeout(function () { window.location.href = 'index.html'; }, 800); return false; }
    return true;
  }

  /* ---------- 图表颜色（对齐「晨光·静」品牌 token） ---------- */
  // 定义图表使用的颜色常量，统一视觉风格
  // 这些颜色在绘制图表时会用到，如折线颜色、背景色等
  var C = {
    amber: '#e8a85c', amberAlpha: 'rgba(232,168,92,.18)',
    teal: '#4fc3b4', tealAlpha: 'rgba(79,195,180,.16)',
    sky: '#7ba7d9', skyAlpha: 'rgba(123,167,217,.14)',
    text1: '#f2efe8', text2: '#b8b3a8', text3: '#8d887d',
    cardBg: '#191c22', border: '#21252d',
    line: 'rgba(255,255,255,.07)', lineStrong: 'rgba(255,255,255,.14)',
  };

  /* ---------- Chart.js 加载 ---------- */
  // Chart.js 是第三方图表库，不在页面 HTML 中直接引入
  // 而是用 JS 动态创建 <script> 标签来加载
  // 这样可以避免页面首次加载时下载不需要的文件
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
  function gradient(ctx, c1, c2) { var g = ctx.createLinearGradient(0,0,0,260); g.addColorStop(0,c1); g.addColorStop(1,c2); return g; }

  /* ---------- 数据计算（统一走 Analytics 引擎） ---------- */
  // 依据 Phase 10「Unified Analytics」：统计一律由 js/analytics.js 产出，
  // 本页不再自行对 Store 原始数据做二次计算；KPI / 图表只做「取数 + 格式化」。
  // 所有函数接收同一个快照 snap（loadAll 里 Analytics.snapshot() 一次生成），
  // 纯读不改写：不碰 CGStore、不触发同步、不动 revision。

  // 数据覆盖的起始日期（数据发现，不是统计）：从各集合最早一条记录 + 学期开始日取最小。
  // 只认 YYYY-MM-DD 且真实存在的日期（复用引擎 isValidDateStr，含 round-trip 存在性校验，
  // 杜绝 '2026-9-1'/'2026-02-30' 这类记录污染 `normalizeRange` → 整页白屏，Review H1）。
  var isYmd = isValidDateStr;
  function dataStartOf(snap) {
    var min = null;
    ['checkins', 'english', 'focus', 'sports', 'readings', 'todos'].forEach(function (key) {
      ((snap && snap[key]) || []).forEach(function (r) {
        var d = r && r.date ? String(r.date) : '';
        if (isYmd(d) && (!min || d < min)) min = d;
      });
    });
    if (snap && snap.user && isYmd(snap.user.semesterStart) && (!min || snap.user.semesterStart < min)) min = snap.user.semesterStart;
    if (!min || min > todayStr()) min = todayStr(); // 未来学期/无记录 → 从今天起
    return min;
  }

  function getOverview(snap) {
    // KPI 指标卡片：
    //   - longest_streak：最长连续打卡（Analytics.getStreaks）
    //   - done_checkins：累计打卡次数
    //   - completion_rate：课程平均完成率（Analytics 统一课程口径）
    //   - study_hours：累计学习时长（小时）
    var st = Analytics.getStreaks(snap);
    var course = Analytics.getCompletionRate('course', null, null, snap);
    var study = Analytics.getStudySummary(dataStartOf(snap), todayStr(), snap) || { minutes: 0 }; // 空/坏数据兜底（Review H1）
    return {
      longest_streak: st.longestStreak,
      done_checkins: (snap.checkins || []).length,
      completion_rate: course.avgProgress,
      study_hours: Math.round(study.minutes / 60 * 10) / 10,
    };
  }
  function getWeeklyData(snap) {
    // 近 7 天（含今天）：每天打卡次数 + 学习时长 —— 来自 Analytics.getTrend
    var range = Analytics.lastNDays(7);
    var study = Analytics.getTrend('study', range[0], range[1], 'daily', snap);
    var cin = Analytics.getTrend('checkin', range[0], range[1], 'daily', snap);
    return study.map(function (d, i) {
      return { date: d.date, checkin_count: cin[i] ? cin[i].value : 0, study_minutes: d.value };
    });
  }
  function getMonthlyData(snap) {
    // 近 30 天学习时长（柱状图）
    var range = Analytics.lastNDays(30);
    return Analytics.getTrend('study', range[0], range[1], 'daily', snap)
      .map(function (d) { return { date: d.date, study_minutes: d.value }; });
  }
  function getHeatmapData(snap) {
    // 全年活跃热力图：Analytics 活动度（0–7，按「活跃类别数」计）
    return Analytics.getActivityMap(snap); // [{ date, count }]
  }
  function getCourseCompletion(snap) {
    // 课程完成/未完成数量（Analytics 课程口径：progress>=100 或 status=done）
    var lib = Analytics.getCompletionRate('course', null, null, snap);
    return { done: lib.done, pending: lib.pending };
  }
  // 图表坐标轴小标签：'9月11日' / '9月11日 周五'（复用 date.js，避免 formatDate 死引用）
  function chartLabel(ds, withWeekday) {
    var label = formatDateShort(ds);
    if (withWeekday) label += ' ' + weekdayName(dateWeekday(ds));
    return label;
  }

  /* ---------- 图表实例 ---------- */
  // charts 对象保存三个图表的实例引用
  // 在重新渲染前需要先调用 .destroy() 销毁旧图表，避免内存泄漏
  var charts = { weekly: null, completion: null, study: null };

  /* ---------- 折线图 ---------- */
  // renderWeekly(data) 绘制近 7 天的打卡数和学习时长双轴折线图
  // 左 Y 轴 = 打卡数，右 Y 轴 = 学习时长（分钟）
  function renderWeekly(data) {
    var canvas = document.getElementById('weeklyChart');
    if (charts.weekly) charts.weekly.destroy();
    if (!window.Chart) return;
    var labels = data.map(function (d) { return chartLabel(d.date, true); });
    var ctx = canvas.getContext('2d');
    charts.weekly = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: [
        { label: '打卡数', data: data.map(function(d){return d.checkin_count;}), borderColor: C.amber, backgroundColor: gradient(ctx, C.amberAlpha, 'rgba(232,168,92,0)'), borderWidth: 2.5, fill: true, tension: .35, pointBackgroundColor: C.amber, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 7, yAxisID: 'y' },
        { label: '学习时长(分钟)', data: data.map(function(d){return d.study_minutes;}), borderColor: C.teal, backgroundColor: gradient(ctx, C.tealAlpha, 'rgba(79,195,180,0)'), borderWidth: 2.5, fill: true, tension: .35, pointBackgroundColor: C.teal, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 7, yAxisID: 'y1' },
      ]},
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8 } },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label.indexOf('学习') > -1 ? ' 学习: ' + formatMinutes(c.parsed.y) : ' 打卡: ' + c.parsed.y + ' 次'; } } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: C.text3 } },
          y: { position: 'left', beginAtZero: true, grid: { color: C.line }, ticks: { color: C.text3, stepSize: 1, precision: 0 } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: C.text3, callback: function (v) { return formatMinutes(v); } } },
        },
      },
    });
  }

  /* ---------- 环形图 ---------- */
  // renderCompletion(data) 绘制课程完成率环形图
  // 中间显示完成率百分比，外圈绿色=已完成，灰色=未完成
  function renderCompletion(data) {
    var canvas = document.getElementById('completionChart');
    if (charts.completion) charts.completion.destroy();
    if (!window.Chart) return;
    var total = data.done + data.pending;
    var rate = total > 0 ? Math.round((data.done/total)*100) : 0;
    var ctx = canvas.getContext('2d');
    charts.completion = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: total === 0 ? ['暂无课程'] : ['已完成','未完成'], datasets: [{ data: total === 0 ? [1] : [data.done, data.pending], backgroundColor: total === 0 ? ['#ebedf0'] : [C.teal, '#f0ede8'], borderColor: '#fff', borderWidth: 3, hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8 } },
          tooltip: { callbacks: { label: function (c) { return total === 0 ? ' 暂无课程' : ' ' + c.label + ': ' + c.parsed + ' 个'; } } } },
      },
      plugins: [{ id: 'centerText', afterDraw: function (chart) {
        var ctx = chart.ctx, a = chart.chartArea; if (!a) return;
        var cx = (a.left+a.right)/2, cy = (a.top+a.bottom)/2;
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.text1; ctx.font = 'bold 32px "SF Mono", sans-serif';
        ctx.fillText(total === 0 ? '—' : rate+'%', cx, cy-4);
        ctx.fillStyle = C.text3; ctx.font = '11px sans-serif';
        ctx.fillText(total === 0 ? '暂无课程' : '完成率', cx, cy+18);
        ctx.restore();
      }}],
    });
  }

  /* ---------- 柱状图 ---------- */
  // renderStudy(data) 绘制近 30 天的学习时长柱状图
  // 每个柱子代表一天，高度代表学习分钟数
  function renderStudy(data) {
    var canvas = document.getElementById('studyChart');
    if (charts.study) charts.study.destroy();
    if (!window.Chart) return;
    var ctx = canvas.getContext('2d');
    var g = ctx.createLinearGradient(0,0,0,200); g.addColorStop(0, C.sky); g.addColorStop(1, C.skyAlpha);
    charts.study = new Chart(ctx, {
      type: 'bar',
      data: { labels: data.map(function(d){return chartLabel(d.date);}), datasets: [{ label: '学习时长', data: data.map(function(d){return d.study_minutes;}), backgroundColor: g, borderColor: C.sky, borderWidth: 1, borderRadius: 4, barPercentage: .7, categoryPercentage: .8 }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' 学习: ' + formatMinutes(c.parsed.y); } } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: C.text3, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: C.line }, ticks: { color: C.text3, callback: function (v) { return formatMinutes(v); } } },
        },
      },
    });
  }

  /* ---------- 热力图 ---------- */
  // renderHeatmap(data) 绘制类似 GitHub 贡献图的年度活动热力图
  // 工作原理：
  //   1. 生成过去 365 天的日期数组
  //   2. 根据每天的活动次数划分 5 个等级（0-4），等级越高颜色越深
  //   3. 按周分组，每列代表一周，每行代表星期几
  //   4. 生成 HTML 拼接字符串，渲染到页面上
  function renderHeatmap(data) {
    var container = document.getElementById('heatmapContainer'); if (!container) return;
    var map = {}; data.forEach(function (d) { map[d.date] = d.count; });
    var today = new Date(), days = [];
    for (var i = 364; i >= 0; i--) {
      var date = new Date(today); date.setDate(date.getDate()-i);
      // 用本地日期键（Analytics 的 getActivityMap 产出的也是本地日期）：
      // toISOString() 取 UTC，会与本地键错位一整天（UTC+8 凌晨 0-8 点尤其明显，Review M2）
      var ds = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
      var cnt = map[ds]||0;
      days.push({ date: ds, count: cnt, level: cnt===0?0:cnt===1?1:cnt===2?2:cnt===3?3:4, dow: date.getDay() });
    }
    var weeks = [], cur = [];
    for (var j = 0; j < days[0].dow; j++) cur.push(null);
    days.forEach(function (d) { cur.push(d); if (cur.length===7) { weeks.push(cur); cur = []; } });
    if (cur.length > 0) weeks.push(cur);

    var months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    var wd = ['一','二','三','四','五','六','日'];
    var h = '<div class="hm-container"><div class="hm-months">';
    var lm = -1;
    weeks.forEach(function (w, wi) {
      var fr = w.find(function (d) { return d; });
      if (fr) { var m = parseInt(fr.date.split('-')[1],10)-1; if (m !== lm) { h += '<span style="grid-column:'+(wi+1)+'">'+months[m]+'</span>'; lm = m; } }
    });
    h += '</div><div class="hm-body"><div class="hm-weekdays">';
    wd.forEach(function (l, i) { h += '<span>'+(i%2===0?l:'')+'</span>'; });
    h += '</div><div class="hm-grid">';
    weeks.forEach(function (w) {
      h += '<div class="hm-col">';
      w.forEach(function (d) { h += d ? '<div class="hm-cell hm-level-'+d.level+'" title="'+d.date+': '+d.count+' 次"></div>' : '<div class="hm-cell hm-empty"></div>'; });
      h += '</div>';
    });
    h += '</div></div><div class="hm-legend"><span>少</span>';
    for (var lv = 0; lv < 5; lv++) h += '<div class="hm-cell hm-level-'+lv+'"></div>';
    h += '<span>多</span></div></div>';
    container.innerHTML = h;
  }

  /* ---------- KPI ---------- */
  // renderKPI(d) 把统计概览数据填入页面顶部的 KPI 指标卡片
  function renderKPI(d) {
    document.getElementById('kpiStreak').textContent = d.longest_streak || 0;
    document.getElementById('kpiCheckins').textContent = d.done_checkins || 0;
    document.getElementById('kpiRate').textContent = d.completion_rate || 0;
    document.getElementById('kpiStudy').textContent = d.study_hours || 0;
  }

  /* ---------- 主加载 ---------- */
  // loadAll() 是页面的入口函数，依次执行：
  //   1. 动态加载 Chart.js 图表库
  //   2. 渲染 KPI 指标卡片
  //   3. 渲染折线图、环形图、柱状图、热力图
  async function loadAll() {
    try { await loadChartJS(); } catch (e) { toast('图表库加载失败，请检查网络', 'error'); return; }
    // 单次快照 → 所有图表共用同一份数据（引擎设计：一次读取 → 多个结果）
    var snap = Analytics.snapshot();
    renderKPI(getOverview(snap));
    renderWeekly(getWeeklyData(snap));
    renderCompletion(getCourseCompletion(snap));
    renderStudy(getMonthlyData(snap));
    renderHeatmap(getHeatmapData(snap));
  }

  /* ---------- 刷新 ---------- */
  // 点击「刷新数据」按钮时，重新加载所有图表数据
  document.getElementById('refreshBtn').addEventListener('click', function () {
    var btn = this; btn.disabled = true; btn.textContent = '刷新中…';
    loadAll().then(function () { toast('数据已刷新', 'success'); btn.disabled = false; btn.textContent = '刷新数据'; });
  });

  /* ---------- 初始化 ---------- */
  // 如果用户已登录（checkAuth() 返回 true），加载所有图表数据
  // chenguang:update 事件：当其他页面修改了数据时，自动刷新本页图表
  if (checkAuth()) loadAll();
  window.addEventListener('chenguang:update', function () { loadAll(); });
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').catch(function (e) {
      console.warn('[SW] ע��ʧ��:', e);
    });
  });
}
