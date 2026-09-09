/**
 * 打卡数据访问层 (Checkin Model) — MySQL 版
 * - 所有 checkins 表操作集中在此
 * - 强制带 user_id 隔离
 * - 包含连续打卡天数 (streak) 重算逻辑
 */
const { pool, query } = require('../db/pool');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const COLUMNS =
  'id, user_id, task_id, checkin_date, status, note, created_at';

/**
 * YYYY-MM-DD 字符串减一天 (UTC, 避免时区问题)
 * @param {string} yyyymmdd
 * @returns {string}
 */
function subtractDay(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const checkinModel = {
  /**
   * 创建打卡记录 (事务)
   * - 校验任务属于当前用户
   * - 处理一天一次的唯一约束冲突
   * - status='done' 时重算任务的 current_streak
   *
   * @param {Object} param
   * @returns {Promise<Object>} 新打卡记录 (附带 current_streak 字段)
   */
  async create({ user_id, task_id, checkin_date, status, note }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. 校验任务归属 + 锁定该行
      const [taskRows] = await conn.query(
        'SELECT id FROM tasks WHERE id = ? AND user_id = ? FOR UPDATE',
        [task_id, user_id]
      );
      if (!taskRows[0]) {
        throw ApiError.notFound('TASK_NOT_FOUND', '任务不存在或不属于当前用户');
      }

      // 2. 插入打卡 (唯一约束: task_id + checkin_date)
      const id = crypto.randomUUID();
      try {
        await conn.query(
          `INSERT INTO checkins (id, user_id, task_id, checkin_date, status, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, user_id, task_id, checkin_date, status, note]
        );
      } catch (err) {
        // ER_DUP_ENTRY / errno 1062 = 一天重复打卡
        if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
          throw ApiError.conflict('CHECKIN_EXISTS', '该任务此日期已打卡');
        }
        throw err;
      }

      // 3. status='done' 时重算并更新 current_streak
      let checkin;
      if (status === 'done') {
        const newStreak = await this._recomputeStreak(conn, task_id, checkin_date);
        await conn.query(
          'UPDATE tasks SET current_streak = ? WHERE id = ?',
          [newStreak, task_id]
        );
        const [rows] = await conn.query(
          `SELECT ${COLUMNS} FROM checkins WHERE id = ?`,
          [id]
        );
        checkin = rows[0];
        checkin.current_streak = newStreak;
      } else {
        const [rows] = await conn.query(
          `SELECT ${COLUMNS} FROM checkins WHERE id = ?`,
          [id]
        );
        checkin = rows[0];
      }

      await conn.commit();
      return checkin;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * 重算任务的连续打卡天数 (从 anchorDate 向前数连续的 done 记录)
   * @param {import('mysql2/promise').PoolConnection} conn - 复用事务连接
   * @param {string} task_id
   * @param {string} anchorDateStr - YYYY-MM-DD (通常是新打卡的日期)
   * @returns {Promise<number>}
   */
  async _recomputeStreak(conn, task_id, anchorDateStr) {
    const [rows] = await conn.query(
      `SELECT DATE_FORMAT(checkin_date, '%Y-%m-%d') AS d
       FROM checkins
       WHERE task_id = ? AND status = 'done' AND checkin_date <= ?
       ORDER BY checkin_date DESC`,
      [task_id, anchorDateStr]
    );
    if (rows.length === 0) return 0;

    let streak = 0;
    let expected = anchorDateStr; // 从锚点日向前数

    for (const row of rows) {
      if (row.d === expected) {
        streak++;
        expected = subtractDay(expected);
      } else if (row.d < expected) {
        // 出现缺口, 连续中断
        break;
      }
      // row.d > expected 不应出现 (DESC 排序)
    }
    return streak;
  },

  /**
   * 分页查询打卡记录 (支持日期范围 + 任务筛选)
   * @param {Object} param
   * @returns {Promise<{ rows: Object[], total: number }>}
   */
  async findAllByUser({
    user_id,
    from,
    to,
    task_id,
    limit,
    offset,
  }) {
    // 明确指定表别名 c, 避免 JOIN 时 user_id 列名歧义 (checkins/tasks 均含 user_id)
    const where = ['c.user_id = ?'];
    const values = [user_id];

    if (from) {
      where.push('c.checkin_date >= ?');
      values.push(from);
    }
    if (to) {
      where.push('c.checkin_date <= ?');
      values.push(to);
    }
    if (task_id) {
      where.push('c.task_id = ?');
      values.push(task_id);
    }

    // 主查询 (JOIN tasks 拿任务名, 方便前端展示)
    values.push(limit, offset);
    const [rows] = await query(
      `SELECT c.id, c.user_id, c.task_id, c.checkin_date, c.status, c.note, c.created_at,
              t.task_name
       FROM checkins c
       JOIN tasks t ON t.id = c.task_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.checkin_date DESC, c.created_at DESC
       LIMIT ? OFFSET ?`,
      values
    );

    // 计数 (不带 limit/offset, 使用别名 c 保持 where 子句兼容)
    const countValues = values.slice(0, values.length - 2); // 去掉 limit/offset
    const [countRows] = await query(
      `SELECT COUNT(*) AS total FROM checkins c WHERE ${where.join(' AND ')}`,
      countValues
    );
    return { rows, total: countRows[0].total };
  },

  /**
   * 获取统计数据
   * - 总打卡数 / 完成数 / 完成率
   * - 当前最长连续天数
   * - 按任务分组的明细
   *
   * @param {Object} param
   * @returns {Promise<Object>}
   */
  async getStats({ user_id, from, to }) {
    const where = ['c.user_id = ?'];
    const values = [user_id];

    if (from) {
      where.push('c.checkin_date >= ?');
      values.push(from);
    }
    if (to) {
      where.push('c.checkin_date <= ?');
      values.push(to);
    }

    // 1. 总体汇总
    const [aggRows] = await query(
      `SELECT
         COUNT(*)                              AS total_checkins,
         COUNT(CASE WHEN c.status = 'done' THEN 1 END) AS done_checkins
       FROM checkins c
       WHERE ${where.join(' AND ')}`,
      values
    );
    const agg = aggRows[0];
    const done = agg.done_checkins || 0;
    const total = agg.total_checkins || 0;
    const completionRate = total > 0 ? Math.round((done / total) * 10000) / 100 : 0;

    // 2. 当前最长连续天数 (取所有任务 current_streak 的最大值)
    const [streakRows] = await query(
      `SELECT COALESCE(MAX(current_streak), 0) AS longest FROM tasks WHERE user_id = ?`,
      [user_id]
    );
    const longestStreak = streakRows[0].longest || 0;

    // 3. 按任务分组 (LEFT JOIN 包含无打卡的任务)
    const taskWhere = ['t.user_id = ?'];
    const taskValues = [user_id];
    let tIdxFrom = null;
    let tIdxTo = null;
    if (from) {
      tIdxFrom = true;
      taskWhere.push('c.checkin_date >= ? OR c.checkin_date IS NULL');
      taskValues.push(from);
    }
    if (to) {
      tIdxTo = true;
      taskWhere.push('c.checkin_date <= ? OR c.checkin_date IS NULL');
      taskValues.push(to);
    }

    const [byTaskRows] = await query(
      `SELECT
         t.id                 AS task_id,
         t.task_name,
         t.target_days,
         t.current_streak,
         COUNT(c.id)          AS total_checkins,
         COUNT(CASE WHEN c.status = 'done' THEN 1 END) AS done_checkins
       FROM tasks t
       LEFT JOIN checkins c
         ON c.task_id = t.id
         ${from ? `AND c.checkin_date >= ?` : ''}
         ${to ? `AND c.checkin_date <= ?` : ''}
       WHERE t.user_id = ?
       GROUP BY t.id, t.task_name, t.target_days, t.current_streak
       ORDER BY t.created_at`,
      taskValues
    );

    return {
      total_checkins: total,
      done_checkins: done,
      completion_rate: completionRate,
      longest_streak: longestStreak,
      by_task: byTaskRows,
    };
  },
};

module.exports = checkinModel;
