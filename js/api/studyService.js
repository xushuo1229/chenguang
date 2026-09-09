/**
 * ============================================================
 * 晨光自律台 · 学习记录服务 (studyService)
 * ------------------------------------------------------------
 * 对接后端 /api/study 接口:
 *   POST /study        → { date, duration_minutes, subject, content? } → { data: record }
 *   GET  /study        → ?from=&to=&subject=&page=&per_page=           → { data: [], meta }
 *   GET  /study/stats  → ?from=&to=                                    → { data: { total_minutes, total_sessions, avg_per_session, by_subject, by_week } }
 *
 * 变更操作后自动失效学习记录 + 统计缓存
 * ============================================================
 */
import http from './httpClient.js';

/** 缓存前缀 */
const CACHE_PREFIX = 'study';

/** 获取本地时区的 YYYY-MM-DD */
function todayLocalStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const studyService = {
  /**
   * 添加学习记录
   * @param {Object} data - { date?, duration_minutes, subject, content? }
   *                        date 默认今天; duration_minutes 单位分钟
   * @returns {Promise<Object>} 新建的学习记录
   */
  async addStudyRecord(data) {
    // date 默认为今天 (如果调用方未传)
    const body = {
      date: data.date || todayLocalStr(),
      duration_minutes: data.duration_minutes,
      subject: data.subject,
      content: data.content || undefined,
    };

    const res = await http.post('/study', body);
    // 变更后失效学习记录 + 统计缓存
    http.cache.invalidate(CACHE_PREFIX);
    return res.data;
  },

  /**
   * 获取学习记录 (支持日期范围 + 学科筛选 + 分页)
   * @param {Object} [dateRange] - { from?: string, to?: string }  YYYY-MM-DD
   * @param {Object} [options]   - { subject?, page?, per_page? }
   * @returns {Promise<{ rows: Object[], pagination: Object }>}
   */
  async getStudyRecords(dateRange = {}, options = {}) {
    const { from, to } = dateRange;
    const { subject, page = 1, per_page = 20 } = options;

    const cacheKey = [
      CACHE_PREFIX, 'list',
      `f:${from || '*'}`, `t:${to || '*'}`,
      `s:${subject || '*'}`, `p${page}`, `pp${per_page}`,
    ].join(':');

    const res = await http.get('/study', {
      params: { from, to, subject, page, per_page },
      cacheKey,
      cacheTTL: 15000, // 15s 缓存
    });

    return {
      rows: res.data,
      pagination: res.meta?.pagination,
    };
  },

  /**
   * 获取学习统计 (总时长 / 总次数 / 平均 / 按学科 / 按周趋势)
   * @param {Object} [dateRange] - { from?: string, to?: string }
   * @returns {Promise<Object>} { total_minutes, total_sessions, avg_per_session, by_subject, by_week }
   */
  async getStudyStats(dateRange = {}) {
    const { from, to } = dateRange;
    const cacheKey = `${CACHE_PREFIX}:stats:f:${from || '*'}:t:${to || '*'}`;

    const res = await http.get('/study/stats', {
      params: { from, to },
      cacheKey,
      cacheTTL: 30000, // 30s 缓存
    });

    return res.data;
  },
};

export { studyService, todayLocalStr };
export default studyService;
