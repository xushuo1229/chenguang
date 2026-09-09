/**
 * 排行榜样板数据访问层 — MySQL 版
 * ------------------------------------------------------------
 * 跨用户查询 (非 user 隔离), 用于:
 *   - 今日打卡排行榜 (今日完成打卡数最多的用户)
 *   - 连续天数排行榜 (current_streak 最大的用户)
 *   - 用户公开信息 (用于 feed 动态展示)
 *
 * 注意: users 表字段为 nickname / avatar_url,
 *       这里用别名 username / avatar 保持对外 API 形状不变。
 */
const { query } = require('../db/pool');

const leaderboardModel = {
  /**
   * 今日打卡排行榜
   * @param {number} [limit=10]
   * @returns {Promise<Array<{user_id, username, avatar, done_count}>>}
   */
  async getTodayRanking(limit = 10) {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await query(
      `SELECT
         c.user_id,
         u.nickname AS username,
         u.avatar_url AS avatar,
         COUNT(*) AS done_count
       FROM checkins c
       JOIN users u ON u.id = c.user_id
       WHERE c.checkin_date = ? AND c.status = 'done'
       GROUP BY c.user_id, u.nickname, u.avatar_url
       ORDER BY done_count DESC
       LIMIT ?`,
      [today, limit]
    );
    return rows;
  },

  /**
   * 连续打卡天数排行榜
   * @param {number} [limit=10]
   * @returns {Promise<Array<{user_id, username, avatar, max_streak, task_name}>>}
   */
  async getStreakRanking(limit = 10) {
    const [rows] = await query(
      `SELECT
         t.user_id,
         u.nickname AS username,
         u.avatar_url AS avatar,
         MAX(t.current_streak) AS max_streak,
         (SELECT t2.task_name FROM tasks t2
          WHERE t2.user_id = t.user_id
          ORDER BY t2.current_streak DESC
          LIMIT 1) AS task_name
       FROM tasks t
       JOIN users u ON u.id = t.user_id
       WHERE t.current_streak > 0
       GROUP BY t.user_id, u.nickname, u.avatar_url
       ORDER BY max_streak DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  },

  /**
   * 获取用户公开信息 (用于 feed 动态)
   * @param {string} user_id
   * @returns {Promise<{username, avatar}|null>}
   */
  async getUserDisplayInfo(user_id) {
    const [rows] = await query(
      'SELECT nickname AS username, avatar_url AS avatar FROM users WHERE id = ?',
      [user_id]
    );
    return rows[0] || null;
  },

  /**
   * 获取任务名称 (用于 feed 动态)
   * @param {string} task_id
   * @returns {Promise<string|null>}
   */
  async getTaskName(task_id) {
    const [rows] = await query(
      'SELECT task_name FROM tasks WHERE id = ?',
      [task_id]
    );
    return rows[0]?.task_name || null;
  },

  /**
   * 获取完整排行榜数据 (今日 + 连续)
   * @returns {Promise<{today: Array, streak: Array}>}
   */
  async getLeaderboard() {
    const [today, streak] = await Promise.all([
      this.getTodayRanking(10),
      this.getStreakRanking(10),
    ]);
    return { today, streak };
  },
};

module.exports = leaderboardModel;
