/**
 * ============================================================
 * 晨光自律台 · 打卡服务 (checkinService)
 * ------------------------------------------------------------
 * 对接后端 /api/checkins 接口:
 *   POST /checkins        → { task_id, checkin_date, status?, note? } → { data: checkin }
 *   GET  /checkins        → ?from=&to=&task_id=&page=&per_page=       → { data: [], meta }
 *   GET  /checkins/stats  → ?from=&to=                               → { data: { total_checkins, done_checkins, completion_rate, longest_streak, by_task } }
 *
 * 变更操作后自动失效打卡记录 + 统计缓存
 * ============================================================
 */
import http from './httpClient.js';

/** 缓存前缀 */
const CACHE_PREFIX = 'checkins';

/** 获取本地时区的 YYYY-MM-DD (用于默认打卡日期) */
function todayLocalStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const checkinService = {
  /**
   * 打卡 (默认当天, status='done')
   * @param {string} taskId   - 任务 UUID
   * @param {string} [note]   - 打卡备注
   * @param {Object} [opts]   - { date?: string, status?: 'done'|'skipped'|'pending' }
   * @returns {Promise<Object>} 打卡记录 (附带 current_streak)
   */
  async checkIn(taskId, note, opts = {}) {
    const { date, status = 'done' } = opts;
    const checkin_date = date || todayLocalStr(); // 默认今天

    const res = await http.post('/checkins', {
      task_id: taskId,
      checkin_date,
      status,
      note: note || undefined,
    });

    // 打卡后失效打卡记录 + 统计缓存
    http.cache.invalidate(CACHE_PREFIX);
    return res.data;
  },

  /**
   * 获取打卡记录 (支持日期范围 + 任务筛选 + 分页)
   * @param {Object} [dateRange] - { from?: string, to?: string }  YYYY-MM-DD
   * @param {Object} [options]   - { task_id?, page?, per_page? }
   * @returns {Promise<{ rows: Object[], pagination: Object }>}
   */
  async getCheckins(dateRange = {}, options = {}) {
    const { from, to } = dateRange;
    const { task_id, page = 1, per_page = 20 } = options;

    // 缓存 key 包含全部筛选维度
    const cacheKey = [
      CACHE_PREFIX, 'list',
      `f:${from || '*'}`, `t:${to || '*'}`,
      `tk:${task_id || '*'}`, `p${page}`, `pp${per_page}`,
    ].join(':');

    const res = await http.get('/checkins', {
      params: { from, to, task_id, page, per_page },
      cacheKey,
      cacheTTL: 15000, // 15s 缓存 (打卡记录变化频繁, TTL 较短)
    });

    return {
      rows: res.data,
      pagination: res.meta?.pagination,
    };
  },

  /**
   * 获取打卡统计 (连续天数 / 完成率 / 按任务)
   * @param {Object} [dateRange] - { from?: string, to?: string }
   * @returns {Promise<Object>} { total_checkins, done_checkins, completion_rate, longest_streak, by_task }
   */
  async getStats(dateRange = {}) {
    const { from, to } = dateRange;
    const cacheKey = `${CACHE_PREFIX}:stats:f:${from || '*'}:t:${to || '*'}`;

    const res = await http.get('/checkins/stats', {
      params: { from, to },
      cacheKey,
      cacheTTL: 30000, // 30s 缓存
    });

    return res.data;
  },
};

export { checkinService, todayLocalStr };
export default checkinService;
