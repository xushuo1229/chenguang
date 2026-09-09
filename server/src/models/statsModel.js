/**
 * 统计数据访问层 — MySQL 版
 * ------------------------------------------------------------
 * 跨表聚合查询, 用于数据可视化:
 *   - overview: 总览 (任务数 / 连续天数 / 打卡数 / 学习时长)
 *   - weekly:   近 7 天每日打卡 + 学习时长趋势
 *   - monthly:  近 30 天每日数据
 *   - heatmap:  近 365 天打卡热力图 (GitHub 风格)
 *
 * 说明: MySQL 无 generate_series, 日期序列改用 JS 生成 + 聚合结果合并,
 * 确保无数据日期也返回 0 (避免前端趋势图断层)。
 */
const { query } = require('../db/pool');

const statsModel = {
  /**
   * 总览数据
   * @param {string} user_id
   * @returns {Promise<Object>}
   */
  async getOverview(user_id) {
    // 并行查询 3 张表 (query 返回 [rows, fields], 多解构一层取 rows)
    const [[taskRows], [checkinRows], [studyRows]] = await Promise.all([
      // 任务统计
      query(
        `SELECT
           COUNT(*)                                          AS total_tasks,
           COUNT(CASE WHEN current_streak > 0 THEN 1 END)    AS active_tasks,
           COALESCE(MAX(current_streak), 0)                  AS longest_streak
         FROM tasks WHERE user_id = ?`,
        [user_id]
      ),
      // 打卡统计 (全部)
      query(
        `SELECT
           COUNT(*)                                          AS total_checkins,
           COUNT(CASE WHEN status = 'done' THEN 1 END)       AS done_checkins
         FROM checkins WHERE user_id = ?`,
        [user_id]
      ),
      // 学习统计 (全部)
      query(
        `SELECT
           CAST(COALESCE(SUM(duration_minutes), 0) AS SIGNED) AS total_minutes,
           COUNT(DISTINCT date)                              AS study_days
         FROM study_records WHERE user_id = ?`,
        [user_id]
      ),
    ]);

    const tasks = taskRows[0];
    const checkins = checkinRows[0];
    const study = studyRows[0];

    const totalCheckins = checkins.total_checkins || 0;
    const doneCheckins = checkins.done_checkins || 0;
    const completionRate = totalCheckins > 0
      ? Math.round((doneCheckins / totalCheckins) * 10000) / 100
      : 0;

    return {
      total_tasks: tasks.total_tasks,
      active_tasks: tasks.active_tasks,
      longest_streak: tasks.longest_streak,
      total_checkins: totalCheckins,
      done_checkins: doneCheckins,
      completion_rate: completionRate,
      total_study_minutes: study.total_minutes,
      study_days: study.study_days,
      // 学习时长换算
      study_hours: Math.round((study.total_minutes / 60) * 10) / 10,
    };
  },

  /**
   * 近 N 天每日趋势 (打卡数 + 学习时长)
   * JS 生成日期序列, 与两张表的分组聚合结果合并, 无数据日填 0
   * @param {string} user_id
   * @param {number} days - 天数 (7 或 30)
   * @returns {Promise<Array<{date, checkin_count, study_minutes}>>}
   */
  async getDailyTrend(user_id, days = 7) {
    // 用 UTC 日期 (与 leaderboard / heatmap 的 today 计算保持一致)
    const dates = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const startDate = dates[0];

    const [checkinRows] = await query(
      `SELECT DATE(checkin_date) AS d, COUNT(*) AS cnt
       FROM checkins
       WHERE user_id = ? AND status = 'done' AND checkin_date >= ?
       GROUP BY DATE(checkin_date)`,
      [user_id, startDate]
    );
    const [studyRows] = await query(
      `SELECT DATE(date) AS d, COALESCE(SUM(duration_minutes), 0) AS mins
       FROM study_records
       WHERE user_id = ? AND date >= ?
       GROUP BY DATE(date)`,
      [user_id, startDate]
    );

    const ciMap = {};
    for (const r of checkinRows) ciMap[r.d] = r.cnt;
    const stMap = {};
    for (const r of studyRows) stMap[r.d] = r.mins;

    return dates.map((date) => ({
      date,
      checkin_count: ciMap[date] || 0,
      study_minutes: stMap[date] || 0,
    }));
  },

  /**
   * 近 7 天趋势 (快捷方法)
   */
  async getWeekly(user_id) {
    return this.getDailyTrend(user_id, 7);
  },

  /**
   * 近 30 天趋势
   */
  async getMonthly(user_id) {
    return this.getDailyTrend(user_id, 30);
  },

  /**
   * 热力图数据 (近 365 天)
   * 仅返回有打卡的日期, 前端补 0
   * @param {string} user_id
   * @returns {Promise<Array<{date, count}>>}
   */
  async getHeatmap(user_id) {
    const [rows] = await query(
      `SELECT
         DATE(checkin_date) AS date,
         COUNT(*)           AS count
       FROM checkins
       WHERE user_id = ? AND status = 'done'
         AND checkin_date >= CURDATE() - INTERVAL 364 DAY
       GROUP BY DATE(checkin_date)
       ORDER BY DATE(checkin_date)`,
      [user_id]
    );
    return rows;
  },

  /**
   * 今日任务完成情况 (用于环形图)
   * @param {string} user_id
   * @returns {Promise<{total, done, pending}>}
   */
  async getTodayCompletion(user_id) {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await query(
      `SELECT
         COUNT(*)     AS total,
         COUNT(c.id)  AS done
       FROM tasks t
       LEFT JOIN checkins c
         ON c.task_id = t.id
         AND c.checkin_date = ?
         AND c.status = 'done'
       WHERE t.user_id = ?`,
      [today, user_id]
    );
    const r = rows[0];
    return {
      total: r.total || 0,
      done: r.done || 0,
      pending: (r.total || 0) - (r.done || 0),
    };
  },
};

module.exports = statsModel;
