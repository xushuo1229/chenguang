/**
 * 统计路由
 * GET /api/stats/overview  - 总览
 * GET /api/stats/weekly    - 近 7 天趋势
 * GET /api/stats/monthly   - 近 30 天趋势
 * GET /api/stats/heatmap   - 近 365 天热力图
 * GET /api/stats/today     - 今日任务完成情况
 */
const express = require('express');
const auth = require('../middleware/auth');
const statsController = require('../controllers/statsController');

const router = express.Router();

router.use(auth());

router.get('/overview', statsController.overview);
router.get('/weekly', statsController.weekly);
router.get('/monthly', statsController.monthly);
router.get('/heatmap', statsController.heatmap);
router.get('/today', statsController.today);

module.exports = router;
