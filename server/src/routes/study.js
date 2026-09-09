/**
 * 学习记录路由 /api/study
 * - POST /         添加学习记录           (需登录)
 * - GET  /         获取学习记录 (分页+筛选) (需登录)
 * - GET  /stats    获取学习统计            (需登录)
 */
const express = require('express');
const { z } = require('zod');
const studyController = require('../controllers/studyController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const wrapAsync = require('../utils/wrapAsync');

const router = express.Router();

// 所有学习记录路由都需要登录
router.use(auth());

// 入参 schema
const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 必须为 YYYY-MM-DD'),
  duration_minutes: z.number().int('时长必须为整数').nonnegative('时长不能为负').max(1440, '单次最长 24 小时 (1440 分钟)'),
  subject: z.string().min(1, '学科不能为空').max(50, '学科最多 50 字'),
  content: z.string().max(2000, '内容最多 2000 字').optional(),
});

// 统计 (必须在 / 之前定义)
router.get('/stats', wrapAsync(studyController.stats));

// 添加学习记录
router.post('/', validate({ body: createSchema }), wrapAsync(studyController.create));

// 获取学习记录 (支持日期范围 + 学科筛选 + 分页)
router.get('/', wrapAsync(studyController.list));

module.exports = router;
