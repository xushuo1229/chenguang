/**
 * Zeno · 企业级能力配置（加法式独立配置）
 * ============================================================
 * 本模块只读取 process.env，不修改既有 config/env.js，避免影响旧链路。
 * dotenv 在 env.js 已加载；此处再加载一次是幂等的，独立脚本也能用。
 */
'use strict';

try { require('dotenv').config(); } catch (_) { /* dotenv 可选 */ }

function list(raw) {
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}
function bool(raw, def) {
  if (raw === undefined || raw === '') return def;
  return !/^(0|false|no|off)$/i.test(String(raw).trim());
}
function int(raw, def) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

const ent = {
  // 注册开关：ALLOW_REGISTRATION=false 时关闭公开注册（默认开启）
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, true),

  // 声明式管理员邮箱（逗号分隔），启动迁移时授予 is_admin
  adminEmails: list(process.env.ADMIN_EMAILS),

  // 对外可访问的站点基址，用于邮件里的重置/验证链接
  publicAppUrl: (process.env.PUBLIC_APP_URL || 'http://localhost:5174').replace(/\/+$/, ''),

  // 邮箱验证：默认不强制（避免无 SMTP 时锁死登录）；
  // 配置 SMTP 并置 REQUIRE_EMAIL_VERIFICATION=true 后才拦截未验证账号
  requireEmailVerification: bool(process.env.REQUIRE_EMAIL_VERIFICATION, false),

  // 令牌有效期（小时）
  resetTokenTtlHours: int(process.env.RESET_TOKEN_TTL_HOURS, 1),
  verifyTokenTtlHours: int(process.env.VERIFY_TOKEN_TTL_HOURS, 24 * 7),

  // SMTP 邮件（不配置则走开发控制台传输，链接只打印在服务端日志）
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Zeno <no-reply@zeno.local>',
  },

  // AI 备用凭据（主 key 429/401/5xx/网络故障时按序故障转移）
  aiFallback: {
    apiKey: process.env.AI_FALLBACK_API_KEY || '',
    baseUrl: process.env.AI_FALLBACK_BASE_URL || '',
    model: process.env.AI_FALLBACK_MODEL || '',
  },
  // 429 冷却毫秒（默认 60s）；认证类故障默认 5 分钟
  aiQuotaCooldownMs: int(process.env.AI_QUOTA_COOLDOWN_MS, 60 * 1000),

  // 可观测性：配置 DSN 且安装了 @sentry/node 时自动启用；否则仅结构化日志
  sentryDsn: process.env.SENTRY_DSN || '',
};

module.exports = ent;
