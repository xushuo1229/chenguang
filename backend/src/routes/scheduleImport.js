/**
 * 知行 · 课表导入路由
 * ============================================================
 * POST /api/course/import —— 通过课表页面链接抓取并解析课程
 * 需要登录 + 限流（抓外部 URL 有 SSRF 风险，必须限流）。
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/scheduleImportController');
const { authRequired } = require('../middleware/auth');
const { importLimiter } = require('../middleware/rateLimit');

router.post('/import', authRequired, importLimiter, ctrl.importFromUrl);

module.exports = router;
