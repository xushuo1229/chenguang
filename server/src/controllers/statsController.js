/**
 * 统计控制器
 * - overview: GET /api/stats/overview  总览数据
 * - weekly:   GET /api/stats/weekly    近 7 天趋势
 * - monthly:  GET /api/stats/monthly   近 30 天趋势
 * - heatmap:  GET /api/stats/heatmap   近 365 天热力图
 * - today:    GET /api/stats/today     今日任务完成情况 (环形图)
 */
const statsModel = require('../models/statsModel');

exports.overview = async (req, res) => {
  const data = await statsModel.getOverview(req.user.id);
  res.success(data);
};

exports.weekly = async (req, res) => {
  const rows = await statsModel.getWeekly(req.user.id);
  res.success(rows);
};

exports.monthly = async (req, res) => {
  const rows = await statsModel.getMonthly(req.user.id);
  res.success(rows);
};

exports.heatmap = async (req, res) => {
  const rows = await statsModel.getHeatmap(req.user.id);
  res.success(rows);
};

exports.today = async (req, res) => {
  const data = await statsModel.getTodayCompletion(req.user.id);
  res.success(data);
};
