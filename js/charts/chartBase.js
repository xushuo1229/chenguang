/**
 * ============================================================
 * Chart.js 暗色主题基础配置
 * ------------------------------------------------------------
 * Chart.js v4 通过 chartLoader.js 按需动态加载
 * 本模块提供统一的暗色主题配置 + 工具函数
 * ============================================================
 */
import { loadChartJS } from './chartLoader.js';

/** 暗色调色板 (与 app.css 设计系统一致) */
export const COLORS = {
  amber: '#f0b25c',
  amber2: '#f5c06a',
  coral: '#f07a5a',
  teal: '#5cc8b2',
  sky: '#7ba7d9',
  rose: '#f26d85',

  text1: '#f6f4ef',
  text2: '#b0b8c4',
  text3: '#7d8695',
  text4: '#565f6e',

  bg2: '#11151d',
  bg3: '#171c26',
  line: 'rgba(255,255,255,.06)',
  lineStrong: 'rgba(255,255,255,.12)',

  // 图表用半透明
  amberAlpha: 'rgba(240,178,92,.15)',
  tealAlpha: 'rgba(92,200,178,.15)',
  coralAlpha: 'rgba(240,122,90,.15)',
  skyAlpha: 'rgba(123,167,217,.15)',
};

/** Chart.js 全局默认配置 (暗色主题) */
export function setupChartDefaults() {
  if (!window.Chart) return;

  const C = window.Chart;
  C.defaults.color = COLORS.text2;
  C.defaults.font.family = '"HarmonyOS Sans SC", "MiSans", system-ui, sans-serif';
  C.defaults.font.size = 12;
  C.defaults.borderColor = COLORS.line;
  C.defaults.plugins.legend.labels.color = COLORS.text2;
  C.defaults.plugins.legend.labels.padding = 12;
  C.defaults.plugins.tooltip.backgroundColor = COLORS.bg3;
  C.defaults.plugins.tooltip.titleColor = COLORS.text1;
  C.defaults.plugins.tooltip.bodyColor = COLORS.text2;
  C.defaults.plugins.tooltip.borderColor = COLORS.lineStrong;
  C.defaults.plugins.tooltip.borderWidth = 1;
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.cornerRadius = 8;
  C.defaults.plugins.tooltip.displayColors = false;
}

/** 线性渐变填充 (用于折线图面积) */
export function createGradient(ctx, color1, color2) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

/**
 * 等待 Chart.js 全局加载 (按需加载, 超时 5s)
 */
export function waitForChart(timeout = 5000) {
  return Promise.race([
    loadChartJS(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Chart.js 加载超时')), timeout)
    ),
  ]);
}

/** 格式化分钟为 "Xh Ym" */
export function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** 格式化日期为 "MM/DD" 或 "周X" */
export function formatDate(dateStr, weekday = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (weekday) {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const date = new Date(y, m - 1, d);
    return `周${days[date.getDay()]}`;
  }
  return `${m}/${d}`;
}
