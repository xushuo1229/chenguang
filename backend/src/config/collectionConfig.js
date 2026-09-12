/**
 * 晨光自律台 · Payload 配置（统一配置）
 * ------------------------------------------------------------
 * 定义整份 chenguangData 快照的默认结构与允许字段（白名单）。
 * 供 syncService（/api/data 推拉）与前端 store.js 保持一致。
 *
 * 说明：早期版本曾在此维护 7 张业务明细表的集合 CRUD 配置
 * （COLLECTIONS / VALID_NAMES / mapIn）。后端精简为单快照表后，
 * 明细表与 /api/:name 通用 CRUD 已移除，本文件仅保留 payload 相关配置。
 */

/**
 * 默认空数据结构（与前端 store.js 完全一致）
 * 新用户首次拉取时返回此结构
 */
function emptyPayload() {
  return {
    user: { name: '', startDate: '', totalDays: 0, continuousDays: 0 },
    checkins: [],
    sports: [],
    readings: [],
    courses: [],
    english: [],
    todos: [],
    focus: [],
    goals: [],
  };
}

// 允许的字段白名单（防止脏写注入未知字段）
// 注意：必须包含 goals（Phase 12）——漏掉会导致前端推送的目标被静默丢弃，
// 用户换设备/重装浏览器后目标全部丢失（V2 冒烟发现的 P0，与前端 sync.js 白名单保持一致）
const PAYLOAD_KEYS = [
  'user', 'checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus', 'goals',
];

module.exports = {
  emptyPayload,
  PAYLOAD_KEYS,
};