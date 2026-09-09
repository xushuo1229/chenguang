/**
 * ============================================================
 * 晨光自律台 · 4 个统计图表渲染器
 * ------------------------------------------------------------
 * 1. WeeklyTrendChart   — 折线图 (近 7 天打卡趋势)
 * 2. CompletionRateChart — 环形图 (今日任务完成率)
 * 3. StudyDurationChart  — 柱状图 (近 30 天学习时长)
 * 4. HeatmapChart        — CSS Grid 热力图 (近 365 天)
 *
 * 每个渲染器导出 render(canvas/data, ...) 方法
 * ============================================================
 */
import { COLORS, createGradient, formatDate, formatMinutes } from './chartBase.js';

/* ============================================================
   1. 折线图 — 近 7 天打卡趋势
   ============================================================ */
export function renderWeeklyTrend(canvas, data) {
  const Chart = window.Chart;
  if (!Chart) return null;

  const labels = data.map((d) => formatDate(d.date, true));
  const checkinCounts = data.map((d) => d.checkin_count);
  const studyMinutes = data.map((d) => d.study_minutes);

  const ctx = canvas.getContext('2d');

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '打卡数',
          data: checkinCounts,
          borderColor: COLORS.amber,
          backgroundColor: createGradient(ctx, COLORS.amberAlpha, 'rgba(240,178,92,0)'),
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: COLORS.amber,
          pointBorderColor: COLORS.bg2,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
          yAxisID: 'y',
        },
        {
          label: '学习时长(分钟)',
          data: studyMinutes,
          borderColor: COLORS.teal,
          backgroundColor: createGradient(ctx, COLORS.tealAlpha, 'rgba(92,200,178,0)'),
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: COLORS.teal,
          pointBorderColor: COLORS.bg2,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label.includes('学习')) {
                return ` 学习: ${formatMinutes(ctx.parsed.y)}`;
              }
              return ` 打卡: ${ctx.parsed.y} 次`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.text3 },
        },
        y: {
          position: 'left',
          beginAtZero: true,
          grid: { color: COLORS.line },
          ticks: { color: COLORS.text3, stepSize: 1, precision: 0 },
          title: { display: false },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: {
            color: COLORS.text3,
            callback: (v) => formatMinutes(v),
          },
        },
      },
    },
  });
}

/* ============================================================
   2. 环形图 — 今日任务完成率
   ============================================================ */
export function renderCompletionRate(canvas, data) {
  const Chart = window.Chart;
  if (!Chart) return null;

  const { done, pending } = data;
  const total = done + pending;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  const ctx = canvas.getContext('2d');

  // 无数据时显示灰色占位
  const chartData = total === 0 ? [1] : [done, pending];
  const chartColors = total === 0
    ? ['rgba(255,255,255,.06)']
    : [COLORS.teal, 'rgba(255,255,255,.08)'];

  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: total === 0 ? ['暂无任务'] : ['已完成', '未完成'],
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
        borderColor: COLORS.bg2,
        borderWidth: 3,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (total === 0) return ' 暂无任务';
              return ` ${ctx.label}: ${ctx.parsed} 个`;
            },
          },
        },
      },
    },
    plugins: [{
      // 中心文字: 完成率 %
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = COLORS.text1;
        ctx.font = 'bold 32px "SF Mono", "JetBrains Mono", sans-serif';
        ctx.fillText(total === 0 ? '—' : `${rate}%`, cx, cy - 4);
        ctx.fillStyle = COLORS.text3;
        ctx.font = '11px sans-serif';
        ctx.fillText(total === 0 ? '暂无任务' : `完成率`, cx, cy + 18);
        ctx.restore();
      },
    }],
  });
}

/* ============================================================
   3. 柱状图 — 近 30 天学习时长
   ============================================================ */
export function renderStudyDuration(canvas, data) {
  const Chart = window.Chart;
  if (!Chart) return null;

  const labels = data.map((d) => formatDate(d.date));
  const values = data.map((d) => d.study_minutes);

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, COLORS.sky);
  gradient.addColorStop(1, COLORS.skyAlpha);

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '学习时长',
        data: values,
        backgroundColor: gradient,
        borderColor: COLORS.sky,
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` 学习: ${formatMinutes(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: COLORS.text3,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.line },
          ticks: {
            color: COLORS.text3,
            callback: (v) => formatMinutes(v),
          },
        },
      },
    },
  });
}

/* ============================================================
   4. 热力图 — 近 365 天打卡 (CSS Grid, 不用 Chart.js)
   ============================================================ */

/** 热力图颜色等级 (0-4 级, 从浅到深) */
const HEATMAP_COLORS = [
  'rgba(255,255,255,.04)',  // 0: 无打卡
  'rgba(240,178,92,.20)',   // 1: 1 次
  'rgba(240,178,92,.40)',   // 2: 2 次
  'rgba(240,178,92,.65)',   // 3: 3 次
  'rgba(240,178,92,.90)',   // 4: 4+ 次
];

/** 根据打卡次数返回颜色等级 */
function getHeatLevel(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

/**
 * 渲染热力图 (GitHub 贡献图风格)
 * @param {HTMLElement} container - 容器元素
 * @param {Array<{date, count}>} data - 打卡数据
 */
export function renderHeatmap(container, data) {
  if (!container) return;

  // 构建 date → count 映射
  const countMap = {};
  data.forEach((d) => { countMap[d.date] = d.count; });

  // 生成近 365 天的日期数组 (按周分组)
  const today = new Date();
  const days = [];
  const totalDays = 365;

  // 从今天往前推 365 天, 然后反转
  for (let i = totalDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      count: countMap[dateStr] || 0,
      level: getHeatLevel(countMap[dateStr] || 0),
      dayOfWeek: date.getDay(), // 0=周日
    });
  }

  // 按周分组 (每列 = 1 周, 7 行)
  // 找到第一个周日, 对齐到周首
  const weeks = [];
  let currentWeek = [];

  // 前面补空格 (如果第一天不是周日)
  const firstDay = days[0].dayOfWeek;
  for (let i = 0; i < firstDay; i++) {
    currentWeek.push(null);
  }

  days.forEach((d) => {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  // 最后一周
  if (currentWeek.length > 0) weeks.push(currentWeek);

  // 渲染 HTML
  const monthLabels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const weekdayLabels = ['一','二','三','四','五','六','日'];

  let html = '<div class="hm-container">';
  html += '<div class="hm-months">';
  let lastMonth = -1;
  weeks.forEach((week, wIdx) => {
    const firstReal = week.find((d) => d);
    if (firstReal) {
      const month = parseInt(firstReal.date.split('-')[1], 10) - 1;
      if (month !== lastMonth) {
        html += `<span style="grid-column:${wIdx + 1}">${monthLabels[month]}</span>`;
        lastMonth = month;
      }
    }
  });
  html += '</div>';

  html += '<div class="hm-body">';
  // 左侧星期标签
  html += '<div class="hm-weekdays">';
  weekdayLabels.forEach((label, i) => {
    // 只显示 一/三/五 (奇数行)
    html += `<span>${i % 2 === 0 ? label : ''}</span>`;
  });
  html += '</div>';

  // 格子网格
  html += '<div class="hm-grid">';
  weeks.forEach((week) => {
    html += '<div class="hm-col">';
    week.forEach((d) => {
      if (!d) {
        html += '<div class="hm-cell hm-empty"></div>';
      } else {
        html += `<div class="hm-cell hm-level-${d.level}"
          title="${d.date}: ${d.count} 次打卡"
          data-date="${d.date}" data-count="${d.count}"></div>`;
      }
    });
    html += '</div>';
  });
  html += '</div>'; // hm-grid
  html += '</div>'; // hm-body

  // 图例
  html += '<div class="hm-legend"><span>少</span>';
  HEATMAP_COLORS.forEach((color, i) => {
    html += `<div class="hm-cell hm-level-${i}"></div>`;
  });
  html += '<span>多</span></div>';

  html += '</div>';

  container.innerHTML = html;
}
