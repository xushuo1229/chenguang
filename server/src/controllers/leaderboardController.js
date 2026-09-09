/**
 * 排行榜样板控制器
 * - getLeaderboard: GET /api/leaderboard  获取今日 + 连续排行榜 (初始数据)
 */
const leaderboardModel = require('../models/leaderboardModel');

/**
 * 获取排行榜数据
 * GET /api/leaderboard
 * 返回: { today: [...], streak: [...] }
 */
exports.getLeaderboard = async (req, res) => {
  const data = await leaderboardModel.getLeaderboard();
  res.success(data);
};
