/**
 * 学习记录数据访问层 (Study Model) — MySQL 版
 * - 所有 study_records 表操作集中在此
 * - 强制带 user_id 隔离
 */
const { query } = require('../db/pool');
const crypto = require('crypto');

const COLUMNS =
  'id, user_id, date, duration_minutes, subject, content, created_at';

const studyModel = {
  /**
   * 创建学习记录
   * @param {Object} param
   * @returns {Promise<Object>}
   */
  async create({ user_id, date, duration_minutes, subject, content }) {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO study_records (id, user_id, date, duration_minutes, subject, content)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, user_id, date, duration_minutes, subject, content]
    );
    const [rows] = await query(
      `SELECT ${COLUMNS} FROM study_records WHERE id = ?`,
      [id]
    );
    return rows[0];
  },

  /**
   * 分页查询学习记录 (支持日期范围 + 学科筛选)
   * @param {Object} param
   * @returns {Promise<{ rows: Object[], total: number }>}
   */
  async findAllByUser({
    user_id, from, to, subject, limit, offset,
  }) {
    const where = ['user_id = ?'];
    const values = [user_id];

    if (from) {
      where.push('date >= ?');
      values.push(from);
    }
    if (to) {
      where.push('date <= ?');
      values.push(to);
    }
    if (subject) {
      where.push('subject = ?');
      values.push(subject);
    }

    values.push(limit, offset);
    const [rows] = await query(
      `SELECT ${COLUMNS} FROM study_records
       WHERE ${where.join(' AND ')}
       ORDER BY date DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      values
    );

    const countValues = values.slice(0, values.length - 2);
    const [countRows] = await query(
      `SELECT COUNT(*) AS total FROM study_records WHERE ${where.join(' AND ')}`,
      countValues
    );
    return { rows, total: countRows[0].total };
  },

  /**
   * 学习统计
   * - 总时长 / 总次数 / 平均每次时长
   * - 按学科分组
   * - 按周分组 (ISO 周, 趋势)
   *
   * @param {Object} param
   * @returns {Promise<Object>}
   */
  async getStats({ user_id, from, to }) {
    const where = ['user_id = ?'];
    const values = [user_id];

    if (from) {
      where.push('date >= ?');
      values.push(from);
    }
    if (to) {
      where.push('date <= ?');
      values.push(to);
    }
    const whereClause = where.join(' AND ');

    // 1. 总体汇总
    const [aggRows] = await query(
      `SELECT
         CAST(COALESCE(SUM(duration_minutes), 0) AS SIGNED) AS total_minutes,
         COUNT(*)                           AS total_sessions
       FROM study_records
       WHERE ${whereClause}`,
      values
    );
    const totalMinutes = aggRows[0].total_minutes || 0;
    const totalSessions = aggRows[0].total_sessions || 0;
    const avgPerSession = totalSessions > 0
      ? Math.round((totalMinutes / totalSessions) * 100) / 100
      : 0;

    // 2. 按学科分组
    const [bySubjectRows] = await query(
      `SELECT
         subject,
         CAST(SUM(duration_minutes) AS SIGNED) AS total_minutes,
         COUNT(*)              AS sessions
       FROM study_records
       WHERE ${whereClause}
       GROUP BY subject
       ORDER BY total_minutes DESC`,
      values
    );

    // 3. 按周分组 (ISO 周: %x-W%v 格式, 如 2026-W34, 等价于 PG 的 IYYY-"W"IW)
    const [byWeekRows] = await query(
      `SELECT
         DATE_FORMAT(date, '%x-W%v') AS week,
         CAST(SUM(duration_minutes) AS SIGNED)  AS total_minutes,
         COUNT(*)               AS sessions
       FROM study_records
       WHERE ${whereClause}
       GROUP BY week
       ORDER BY week`,
      values
    );

    return {
      total_minutes: totalMinutes,
      total_sessions: totalSessions,
      avg_per_session: avgPerSession,
      by_subject: bySubjectRows,
      by_week: byWeekRows,
    };
  },
};

module.exports = studyModel;
