/**
 * 路由聚合
 * - 所有子路由统一挂载到 /api 前缀下 (在 app.js 中挂载)
 * - 后续新增模块 (tasks/habits/study/stats) 在此挂载
 */
const express = require('express');
const authRouter = require('./auth');
const tasksRouter = require('./tasks');
const checkinsRouter = require('./checkins');
const studyRouter = require('./study');
const leaderboardRouter = require('./leaderboard');
const statsRouter = require('./stats');

const router = express.Router();

// 健康检查 (无需鉴权, 用于监控/部署检查)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'chenguang-platform-api' });
});

// 认证模块
router.use('/auth', authRouter);

// 业务模块 (均需 JWT 鉴权, 在各自路由内挂载 auth() 中间件)
router.use('/tasks', tasksRouter);
router.use('/checkins', checkinsRouter);
router.use('/study', studyRouter);
router.use('/leaderboard', leaderboardRouter);
router.use('/stats', statsRouter);

module.exports = router;
