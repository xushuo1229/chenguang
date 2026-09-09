/**
 * 排行榜样板路由
 * GET /api/leaderboard — 获取今日 + 连续排行榜 (需 JWT 鉴权)
 */
const express = require('express');
const auth = require('../middleware/auth');
const leaderboardController = require('../controllers/leaderboardController');

const router = express.Router();

// 所有排行榜接口都需要 JWT 鉴权
router.use(auth());

router.get('/', leaderboardController.getLeaderboard);

module.exports = router;
