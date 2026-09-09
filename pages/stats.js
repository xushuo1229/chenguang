import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/ui/modal.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';

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

  /* ---------- 浅色主题颜色 ---------- */
  // 定义图表使用的颜色常量，统一视觉风格
  // 这些颜色在绘制图表时会用到，如折线颜色、背景色等
  var C = {
    amber: '#d68f2c', amberAlpha: 'rgba(245,176,66,.2)',
    teal: '#10b981', tealAlpha: 'rgba(16,185,129,.2)',
    sky: '#3b82f6', skyAlpha: 'rgba(59,130,246,.15)',
    text1: '#1e1e2a', text2: '#5a5a6e', text3: '#8a8a9a',
    cardBg: '#ffffff', border: '#e8e5e0',
    line: 'rgba(0,0,0,.06)', lineStrong: 'rgba(0,0,0,.12)',
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

  /* ---------- 数据计算 ---------- */
  // 以下函数从 CGStore 数据存储中读取原始数据，计算图表需要的统计值
  // 每个函数返回一个数组或对象，供对应的图表渲染函数使用
  function getWeeklyData() {
    // getWeeklyData() 获取近 7 天的数据：每天的打卡次数和学习时长
    // days 数组包含 7 个元素，每个元素格式如：{ date: "2026-09-08", checkin_count: 1, study_minutes: 30 }
    var days = [];
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var ds = dateStr(i);
      var cin = (Store.getCheckins ? Store.getCheckins() : []).filter(function (c) { return c.date === ds; }).length;
      var eng = Store.getEnglishByDate(ds).reduce(function (s, x) { return s + (Number(x.minutes)||0); }, 0);
      var foc = Store.getFocusByDate(ds).reduce(function (s, x) { return s + (Number(x.minutes)||0); }, 0);
      days.push({ date: ds, checkin_count: cin, study_minutes: eng + foc });
    }
    return days;
  }
  function getMonthlyData() {
    // getMonthlyData() 获取近 30 天的数据，用于绘制柱状图
    var days = [];
    var days = [];
    for (var i = 29; i >= 0; i--) {
      var ds = dateStr(i);
      var eng = Store.getEnglishByDate(ds).reduce(function (s, x) { return s + (Number(x.minutes)||0); }, 0);
      var foc = Store.getFocusByDate(ds).reduce(function (s, x) { return s + (Number(x.minutes)||0); }, 0);
      days.push({ date: ds, study_minutes: eng + foc });
    }
    return days;
  }
  function getHeatmapData() {
    // getHeatmapData() 获取全年活动数据，用于绘制热力图
    // 热力图类似 GitHub 的贡献图：每天一个格子，颜色越深表示活动越多
    // 活动包括：打卡、运动、阅读
    var map = {};
    var map = {};
    (Store.getCheckins ? Store.getCheckins() : []).forEach(function (c) { map[c.date] = (map[c.date]||0)+1; });
    Store.getSports().forEach(function (s) { map[s.date] = (map[s.date]||0)+1; });
    Store.getReadings().forEach(function (r) { map[r.date] = (map[r.date]||0)+1; });
    var result = []; for (var k in map) result.push({ date: k, count: map[k] }); return result;
  }
  function getOverview() {
    // getOverview() 计算页面顶部的 KPI 指标卡片数据：
    //   - longest_streak：最长连续打卡天数
    //   - done_checkins：累计打卡次数
    //   - completion_rate：课程平均完成率
    //   - study_hours：累计学习时长（小时）
    var cin = Store.getCheckins ? Store.getCheckins() : [];
    var cin = Store.getCheckins ? Store.getCheckins() : [];
    var eng = Store.getEnglish().reduce(function (s, x) { return s + (Number(x.minutes)||0); }, 0);
    var foc = Store.getFocus().reduce(function (s, x) { return s + (Number(x.minutes)||0); }, 0);
    var sorted = cin.map(function (c) { return c.date; }).filter(Boolean).sort();
    var max = 0, cur = 0, prev = null;
    sorted.forEach(function (d) {
      if (prev) { var diff = Math.round((new Date(d)-new Date(prev))/86400000); cur = diff === 1 ? cur+1 : 1; }
      else cur = 1;
      if (cur > max) max = cur; prev = d;
    });
    return {
      longest_streak: max,
      done_checkins: cin.length,
      completion_rate: Store.courseAvgProgress ? Store.courseAvgProgress() : 0,
      study_hours: Math.round((eng+foc)/60 * 10) / 10,
    };
  }
  function getCourseCompletion() {
    var cs = Store.getCourses();
    var done = cs.filter(function (c) { return (c.progress||0) >= 100 || c.status === 'done'; }).length;
    return { done: done, pending: cs.length - done };
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
    var labels = data.map(function (d) { return formatDate(d.date, true); });
    var ctx = canvas.getContext('2d');
    charts.weekly = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: [
        { label: '打卡数', data: data.map(function(d){return d.checkin_count;}), borderColor: C.amber, backgroundColor: gradient(ctx, C.amberAlpha, 'rgba(245,176,66,0)'), borderWidth: 2.5, fill: true, tension: .35, pointBackgroundColor: C.amber, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 7, yAxisID: 'y' },
        { label: '学习时长(分钟)', data: data.map(function(d){return d.study_minutes;}), borderColor: C.teal, backgroundColor: gradient(ctx, C.tealAlpha, 'rgba(16,185,129,0)'), borderWidth: 2.5, fill: true, tension: .35, pointBackgroundColor: C.teal, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 7, yAxisID: 'y1' },
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
      data: { labels: data.map(function(d){return formatDate(d.date);}), datasets: [{ label: '学习时长', data: data.map(function(d){return d.study_minutes;}), backgroundColor: g, borderColor: C.sky, borderWidth: 1, borderRadius: 4, barPercentage: .7, categoryPercentage: .8 }] },
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
      var ds = date.toISOString().slice(0,10);
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
    try { await loadChartJS(); } catch (e) { showToast('图表库加载失败，请检查网络', 'err'); return; }
    renderKPI(getOverview());
    renderWeekly(getWeeklyData());
    renderCompletion(getCourseCompletion());
    renderStudy(getMonthlyData());
    renderHeatmap(getHeatmapData());
  }

  /* ---------- 刷新 ---------- */
  // 点击「刷新数据」按钮时，重新加载所有图表数据
  document.getElementById('refreshBtn').addEventListener('click', function () {
    var btn = this; btn.disabled = true; btn.textContent = '刷新中…';
    loadAll().then(function () { showToast('数据已刷新', 'ok'); btn.disabled = false; btn.textContent = '刷新数据'; });
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
