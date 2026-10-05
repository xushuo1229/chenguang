/**
 * Zeno · 轻量进程内指标（无外部依赖）
 * ============================================================
 * 仅保存在内存中，单实例足够；将来接 Prometheus/Sentry 时可替换实现。
 */
'use strict';

const startedAt = Date.now();
let total = 0;
let totalDurationMs = 0;
const byStatus = {};
const byRoute = {};
const recentClientErrors = [];
const CLIENT_ERROR_CAP = 50;

function normalize(path) {
  return String(path || '/')
    .split('?')[0]
    .replace(/\/\d+/g, '/:id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
    .slice(0, 120);
}

function observe(method, path, status, durationMs) {
  total += 1;
  totalDurationMs += durationMs;
  const s = String(status || 0);
  byStatus[s] = (byStatus[s] || 0) + 1;
  const key = `${method} ${normalize(path)}`;
  if (!byRoute[key]) byRoute[key] = { count: 0, errors: 0, totalMs: 0 };
  byRoute[key].count += 1;
  byRoute[key].totalMs += Math.round(durationMs);
  if (status >= 400) byRoute[key].errors += 1;
}

function recordClientError(entry) {
  recentClientErrors.unshift({
    at: new Date().toISOString(),
    message: String(entry.message || '').slice(0, 300),
    source: String(entry.source || 'web').slice(0, 40),
    url: String(entry.url || '').slice(0, 200),
  });
  if (recentClientErrors.length > CLIENT_ERROR_CAP) recentClientErrors.length = CLIENT_ERROR_CAP;
}

function snapshot() {
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requests: {
      total,
      avgDurationMs: total ? Math.round(totalDurationMs / total) : 0,
      byStatus,
      topRoutes: Object.entries(byRoute)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([route, v]) => ({ route, ...v })),
    },
    memoryMb: Object.fromEntries(
      Object.entries(process.memoryUsage()).map(([k, v]) => [k, Math.round(v / 1048576)])
    ),
    recentClientErrors,
  };
}

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    observe(req.method, req.originalUrl || req.url, res.statusCode, durationMs);
  });
  next();
}

module.exports = { metricsMiddleware, recordClientError, snapshot, _reset: () => {
  total = 0; totalDurationMs = 0;
  for (const k of Object.keys(byStatus)) delete byStatus[k];
  for (const k of Object.keys(byRoute)) delete byRoute[k];
  recentClientErrors.length = 0;
} };
