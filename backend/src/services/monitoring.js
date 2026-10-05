/**
 * Zeno · 错误上报接缝
 * ============================================================
 * 默认输出结构化日志；当设置 SENTRY_DSN 且安装了 @sentry/node 时自动转发。
 * 未安装依赖也不影响运行（优雅降级）。
 */
'use strict';

const ent = require('../config/enterprise');

let sentry = null;
let tried = false;
async function getSentry() {
  if (tried) return sentry;
  tried = true;
  if (!ent.sentryDsn) return null;
  try {
    sentry = require('@sentry/node');
    sentry.init({ dsn: ent.sentryDsn, environment: process.env.NODE_ENV || 'development' });
  } catch (_) {
    sentry = null;
    console.warn('[monitoring] 设置了 SENTRY_DSN 但未安装 @sentry/node，仅记录本地日志');
  }
  return sentry;
}

function captureError(error, context = {}) {
  const payload = {
    at: new Date().toISOString(),
    level: context.level || 'error',
    code: error && error.code,
    status: error && error.status,
    message: error && error.message,
    path: context.path,
    method: context.method,
  };
  console.error('[monitoring]', JSON.stringify(payload));
  getSentry()
    .then((s) => {
      if (s) s.captureException(error, { tags: { path: context.path, method: context.method } });
    })
    .catch(() => {});
}

module.exports = { captureError };
