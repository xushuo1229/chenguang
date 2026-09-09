/**
 * ============================================================
 * 晨光自律台 · 任务服务 (taskService)
 * ------------------------------------------------------------
 * 对接后端 /api/tasks 接口:
 *   POST   /tasks        → { task_name, target_days }               → { data: task }
 *   GET    /tasks        → ?page=&per_page=                          → { data: [], meta: { pagination } }
 *   PUT    /tasks/:id    → { task_name?, target_days? }              → { data: task }
 *   DELETE /tasks/:id                                               → 204
 *
 * 变更操作后自动失效相关缓存 (tasks / checkins:stats)
 * ============================================================
 */
import http from './httpClient.js';

/** 缓存前缀 */
const CACHE_PREFIX = 'tasks';

const taskService = {
  /**
   * 创建任务
   * @param {Object} taskData - { task_name: string, target_days: number }
   * @returns {Promise<Object>} 新建的任务对象 { id, user_id, task_name, target_days, current_streak, created_at }
   */
  async createTask(taskData) {
    const res = await http.post('/tasks', taskData);
    // 变更后失效任务列表缓存
    http.cache.invalidate(CACHE_PREFIX);
    return res.data;
  },

  /**
   * 获取任务列表 (分页)
   * @param {Object} [options] - { page?, per_page? }
   * @returns {Promise<{ rows: Object[], pagination: Object }>}
   */
  async getTasks(options = {}) {
    const { page = 1, per_page = 20 } = options;
    const cacheKey = `${CACHE_PREFIX}:list:p${page}:pp${per_page}`;

    const res = await http.get('/tasks', {
      params: { page, per_page },
      cacheKey,
      cacheTTL: 30000, // 30s 缓存
    });

    return {
      rows: res.data,
      pagination: res.meta?.pagination,
    };
  },

  /**
   * 更新任务
   * @param {string} id       - 任务 UUID
   * @param {Object} taskData - { task_name?, target_days? }
   * @returns {Promise<Object>} 更新后的任务对象
   */
  async updateTask(id, taskData) {
    const res = await http.put(`/tasks/${id}`, taskData);
    // 失效任务相关缓存
    http.cache.invalidate(CACHE_PREFIX);
    return res.data;
  },

  /**
   * 删除任务 (关联打卡记录级联删除)
   * @param {string} id - 任务 UUID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteTask(id) {
    await http.delete(`/tasks/${id}`);
    // 失效任务 + 打卡统计缓存 (级联删除影响统计)
    http.cache.invalidate(CACHE_PREFIX);
    http.cache.invalidate('checkins');
    return true;
  },
};

export { taskService };
export default taskService;
