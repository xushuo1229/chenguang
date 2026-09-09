/**
 * 用户数据访问层 (User Model) — MySQL 版
 * - 所有数据库操作集中在此
 * - 返回原始数据, 不包含业务逻辑
 *
 * 安全约定:
 *   1. 对外返回的字段绝不包含 password_hash
 *   2. 仅 findByEmailWithPassword 读取哈希, 仅供登录比对
 */
const { query } = require('../db/pool');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

// 对外安全字段 (排除 password_hash)
const SAFE_COLUMNS =
  'id, email, nickname, avatar_url, created_at, updated_at, last_login_at';

const userModel = {
  /**
   * 根据 email 查询用户 (含 password_hash, 仅用于登录)
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  async findByEmailWithPassword(email) {
    const [rows] = await query(
      `SELECT id, email, password_hash, nickname, avatar_url, created_at
       FROM users WHERE email = ?`,
      [email]
    );
    return rows[0] || null;
  },

  /**
   * 根据 id 查询用户 (安全字段)
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const [rows] = await query(
      `SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * 创建新用户
   * @param {Object} param
   * @param {string} param.email
   * @param {string} param.passwordHash - 已 BCrypt 哈希的密码
   * @param {string} param.nickname
   * @returns {Promise<Object>} 新用户记录 (安全字段)
   */
  async create({ email, passwordHash, nickname }) {
    const id = crypto.randomUUID();
    try {
      await query(
        `INSERT INTO users (id, email, password_hash, nickname)
         VALUES (?, ?, ?, ?)`,
        [id, email, passwordHash, nickname]
      );
      // MySQL 无 RETURNING, 插入后回填安全字段
      const [rows] = await query(
        `SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`,
        [id]
      );
      return rows[0];
    } catch (err) {
      // 唯一约束冲突 (ER_DUP_ENTRY / errno 1062 = 邮箱重复)
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        throw ApiError.conflict('EMAIL_TAKEN', '该邮箱已被注册');
      }
      throw err;
    }
  },

  /**
   * 更新用户资料 (nickname / avatar_url)
   * 动态构建 UPDATE 语句, 只更新传入的字段
   * @param {string} id
   * @param {Object} param
   * @returns {Promise<Object|null>}
   */
  async updateProfile(id, { nickname, avatar_url }) {
    const fields = [];
    const values = [];

    if (nickname !== undefined) {
      fields.push('nickname = ?');
      values.push(nickname);
    }
    if (avatar_url !== undefined) {
      fields.push('avatar_url = ?');
      values.push(avatar_url);
    }

    // 没有可更新字段 - 直接返回当前用户
    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id); // WHERE 条件参数
    await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    const [rows] = await query(
      `SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * 更新最后登录时间
   * @param {string} id
   */
  async touchLastLogin(id) {
    await query(
      `UPDATE users SET last_login_at = NOW() WHERE id = ?`,
      [id]
    );
  },
};

module.exports = userModel;
