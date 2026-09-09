/**
 * 打卡路由 /api/checkins
 * - POST /           打卡                    (需登录)
 * - GET  /           获取打卡记录 (分页+筛选)  (需登录)
 * - GET  /stats      获取统计数据              (需登录)
 *
 * 注意: /stats 必须在 /:id 之前匹配, 否则会被当作 id
 *        (本路由用 GET / 不带参数, GET /stats 不冲突, 但顺序仍优先 stats)
 */
const express = require('express');
const { z } = require('zod');
const checkinController = require('../controllers/checkinController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const wrapAsync = require('../utils/wrapAsync');

const router = express.Router();

// 所有打卡路由都需要登录
router.use(auth());

// 入参 schema
const createSchema = z.object({
  task_id: z.string().uuid('task_id 必须为 UUID'),
  checkin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkin_date 必须为 YYYY-MM-DD'),
  status: z.enum(['done', 'skipped', 'pending']).optional().default('done'),
  note: z.string().max(500, '备注最多 500 字').optional(),
});

// 统计 (必须在 / 之前定义, 避免歧义)
router.get('/stats', wrapAsync(checkinController.stats));

// 打卡
router.post('/', validate({ body: createSchema }), wrapAsync(checkinController.create));

// 获取打卡记录 (支持日期范围 + 任务筛选 + 分页)
router.get('/', wrapAsync(checkinController.list));

module.exports = router;
