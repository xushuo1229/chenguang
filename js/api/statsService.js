/**
 * ============================================================
 * 晨光自律台 · 统计数据服务
 * ------------------------------------------------------------
 * 封装 /api/stats/* 接口, 提供本地缓存优化:
 *   - overview: 总览数据 (TTL 60s)
 *   - weekly:   近 7 天趋势 (TTL 30s)
 *   - monthly:  近 30 天趋势 (TTL 30s)
 *   - heatmap:  热力图数据 (TTL 60s)
 *   - today:    今日完成情况 (TTL 15s)
 *
 * 缓存策略: 内存 Map + 过期时间, 手动可刷新
 * ============================================================
 */
import http from './httpClient.js';

const CACHE_TTL = {
  overview: 60000,
  weekly: 30000,
  monthly: 30000,
  heatmap: 60000,
  today: 15000,
};

// 内存缓存
const _cache = new Map();

/**
 * 带缓存的 GET 请求
 * @param {string} key - 缓存 key
 * @param {string} path - API 路径
 * @param {number} ttl - 缓存有效期 ms
 * @param {boolean} force - 强制刷新 (跳过缓存)
 * @returns {Promise<Object>}
 */
async function cachedGet(key, path, ttl, force = false) {
  // 检查缓存
  if (!force) {
    const entry = _cache.get(key);
    if (entry && Date.now() - entry.time < ttl) {
      return entry.data;
    }
  }

  // 请求
  const res = await http.get(path);
  const data = res.data !== undefined ? res.data : res;

  // 写入缓存
  _cache.set(key, { data, time: Date.now() });
  return data;
}

const statsService = {
  /** 总览数据 */
  getOverview(force = false) {
    return cachedGet('overview', '/stats/overview', CACHE_TTL.overview, force);
  },

  /** 近 7 天趋势 */
  getWeekly(force = false) {
    return cachedGet('weekly', '/stats/weekly', CACHE_TTL.weekly, force);
  },

  /** 近 30 天趋势 */
  getMonthly(force = false) {
    return cachedGet('monthly', '/stats/monthly', CACHE_TTL.monthly, force);
  },

  /** 热力图数据 (近 365 天) */
  getHeatmap(force = false) {
    return cachedGet('heatmap', '/stats/heatmap', CACHE_TTL.heatmap, force);
  },

  /** 今日任务完成情况 (环形图) */
  getTodayCompletion(force = false) {
    return cachedGet('today', '/stats/today', CACHE_TTL.today, force);
  },

  /** 清除所有缓存 */
  clearCache() {
    _cache.clear();
  },

  /** 刷新所有数据 (强制重新请求) */
  refreshAll() {
    return Promise.all([
      this.getOverview(true),
      this.getWeekly(true),
      this.getMonthly(true),
      this.getHeatmap(true),
      this.getTodayCompletion(true),
    ]);
  },
};

export default statsService;
