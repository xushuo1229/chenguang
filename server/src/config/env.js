/**
 * 环境变量加载与校验
 * - 通过 dotenv 注入 .env 文件
 * - 启动时校验必填项, 缺失则抛错并停止
 *
 * 使用方式: const config = require('./config/env')
 */
require('dotenv').config();

// 必填环境变量校验
const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'CORS_ORIGIN'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(`[env] 缺少必填环境变量: ${missing.join(', ')}。请参考 .env.example 配置 .env`);
}

const config = {
  // 运行环境
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT, 10) || 3000,

  // 数据库
  databaseUrl: process.env.DATABASE_URL,
  dbPoolMax: parseInt(process.env.DB_POOL_MAX, 10) || 10,

  // JWT
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // CORS (逗号分隔的来源数组)
  corsOrigin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),

  // 限流
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,

  // BCrypt
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,

  // 请求体大小限制 (默认 1mb, 生产可调小)
  bodyLimit: process.env.BODY_LIMIT || '1mb',

  // Supabase (Realtime 广播 + 可选直连)
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
};

module.exports = config;
