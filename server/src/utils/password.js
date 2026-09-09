/**
 * 密码哈希工具 (BCrypt)
 * - hash:    注册时哈希明文密码
 * - compare: 登录时比对明文与哈希
 *
 * 安全要点:
 *   1. 永远不要在数据库存储明文密码
 *   2. BCrypt 自带 salt, 同一密码每次哈希结果不同
 *   3. compare 时会从哈希中提取 salt, 无需手动保存
 */
const bcrypt = require('bcryptjs');
const config = require('../config/env');

/**
 * 哈希密码
 * @param {string} plain - 明文密码
 * @returns {Promise<string>} BCrypt 哈希 (含 salt)
 */
function hash(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

/**
 * 比对密码
 * @param {string} plain - 用户输入的明文
 * @param {string} hashed - 数据库存储的哈希
 * @returns {Promise<boolean>} 是否匹配
 */
function compare(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

module.exports = { hash, compare };
