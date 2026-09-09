/**
 * ============================================================
 * Chart.js 按需加载器
 * ------------------------------------------------------------
 * 替代 <script src="chart.js"> 同步加载 (会阻塞渲染)
 * 仅在用户访问 stats.html 时动态注入 script 标签
 * 加载完成后缓存 Promise, 避免重复加载
 *
 * 节省: ~200KB (非统计页面完全不加载)
 * ============================================================ */

const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4';

let _promise = null;

/**
 * 动态加载 Chart.js (单例, 返回 Promise<Chart>)
 * @returns {Promise<typeof import('chart.js').Chart>}
 */
export function loadChartJS() {
  // 已加载, 直接返回
  if (window.Chart) return Promise.resolve(window.Chart);

  // 正在加载, 返回同一个 Promise
  if (_promise) return _promise;

  _promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHART_CDN;
    script.async = true;
    script.onload = () => {
      if (window.Chart) {
        resolve(window.Chart);
      } else {
        reject(new Error('Chart.js 加载完成但未找到全局对象'));
      }
    };
    script.onerror = () => {
      _promise = null; // 允许重试
      reject(new Error('Chart.js CDN 加载失败, 请检查网络'));
    };
    document.head.appendChild(script);
  });

  return _promise;
}

export default loadChartJS;
