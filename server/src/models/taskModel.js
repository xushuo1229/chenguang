/**
 * 任务数据访问层 (Task Model) — MySQL 版
 * - 所有 tasks 表操作集中在此
 * - 强制带 user_id 隔离 (不同用户互不可见)
 */
const { query } = require('../db/pool');
const crypto = require('crypto');

// 对外字段
const COLUMNS = 'id, user_id, task_name, target_days, current_streak, created_at';

const taskModel = {
  /**
   * 创建任务
   * @param {Object} param
   * @param {string} param.user_id
   * @param {string} param.task_name
   * @param {number} param.target_days
   * @returns {Promise<Object>}
   */
  async create({ user_id, task_name, target_days }) {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO tasks (id, user_id, task_name, target_days)
       VALUES (?, ?, ?, ?)`,
      [id, user_id, task_name, target_days]
    );
    const [rows] = await query(
      `SELECT ${COLUMNS} FROM tasks WHERE id = ?`,
      [id]
    );
    return rows[0];
  },

  /**
   * 分页查询用户的所有任务
   * @param {Object} param
   * @param {string} param.user_id
   * @param {number} param.limit
   * @param {number} param.offset
   * @returns {Promise<{ rows: Object[], total: number }>}
   */
  async findAllByUser({ user_id, limit, offset }) {
    const [rows] = await query(
      `SELECT ${COLUMNS} FROM tasks
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [user_id, limit, offset]
    );
    const [countRows] = await query(
      'SELECT COUNT(*) AS total FROM tasks WHERE user_id = ?',
      [user_id]
    );
    return { rows, total: countRows[0].total };
  },

  /**
   * 根据 id 查询单个任务 (带用户隔离校验)
   * @param {string} id
   * @param {string} user_id
   * @returns {Promise<Object|null>}
   */
  async findByIdOwnedByUser(id, user_id) {
    const [rows] = await query(
      `SELECT ${COLUMNS} FROM tasks WHERE id = ? AND user_id = ?`,
      [id, user_id]
    );
    return rows[0] || null;
  },

  /**
   * 更新任务 (task_name / target_days)
   * @param {string} id
   * @param {string} user_id
   * @param {Object} param
   * @returns {Promise<Object|null>}
   */
  async update(id, user_id, { task_name, target_days }) {
    const fields = [];
    const values = [];

    if (task_name !== undefined) {
      fields.push('task_name = ?');
      values.push(task_name);
    }
    if (target_days !== undefined) {
      fields.push('target_days = ?');
      values.push(target_days);
    }

    if (fields.length === 0) {
      return this.findByIdOwnedByUser(id, user_id);
    }

    values.push(id, user_id);
    await query(
      `UPDATE tasks SET ${fields.join(', ')}
       WHERE id = ? AND user_id = ?`,
      values
    );
    const [rows] = await query(
      `SELECT ${COLUMNS} FROM tasks WHERE id = ? AND user_id = ?`,
      [id, user_id]
    );
    return rows[0] || null;
  },

  /**
   * 删除任务 (ON DELETE CASCADE 会自动删关联打卡)
   * @param {string} id
   * @param {string} user_id
   * @returns {Promise<boolean>} 是否删除成功
   */
  async remove(id, user_id) {
    const [result] = await query(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?',
      [id, user_id]
    );
    return result.affectedRows > 0;
  },

  /**
   * 更新任务的连续打卡天数
   * @param {string} id
   * @param {number} streak
   */
  async updateStreak(id, streak) {
    await query(
      'UPDATE tasks SET current_streak = ? WHERE id = ?',
      [streak, id]
    );
  },
};

module.exports = taskModel;
