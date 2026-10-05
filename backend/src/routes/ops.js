'use strict';

const router = require('express').Router();
const { authRequired, adminRequired } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { recordClientError, snapshot } = require('../middleware/metrics');
const failover = require('../services/providers/failover');

// 前端 ErrorBoundary 上报（不要求登录，但走严格限流；字段截断、绝不记录凭据）
router.post('/client-errors', authLimiter, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  recordClientError({
    message: body.message,
    source: body.source,
    url: body.url,
  });
  res.json({ ok: true });
});

// 管理员查看进程内指标与 AI 凭据健康状态
router.get('/metrics', authRequired, adminRequired, (_req, res) => {
  res.json({
    metrics: snapshot(),
    aiCredentials: failover.statusSnapshot(),
  });
});

module.exports = router;
