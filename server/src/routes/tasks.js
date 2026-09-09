/**
 * 任务路由 /api/tasks
 * - POST   /         创建任务          (需登录)
 * - GET    /         获取任务列表 (分页) (需登录)
 * - PUT    /:id      更新任务          (需登录)
 * - DELETE /:id      删除任务          (需登录)
 *
 * 所有路由均需 auth() 中间件 (强制 JWT 鉴权)
 */
const express = require('express');
const { z } = require('zod');
const taskController = require('../controllers/taskController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const wrapAsync = require('../utils/wrapAsync');

const router = express.Router();

// 所有任务路由都需要登录
router.use(auth());

// 入参 schema
const createSchema = z.object({
  task_name: z.string().min(1, '任务名不能为空').max(50, '任务名最多 50 字'),
  target_days: z.number().int().positive('目标天数必须为正整数').max(365, '目标天数最多 365'),
});

const updateSchema = z.object({
  task_name: z.string().min(1, '任务名不能为空').max(50, '任务名最多 50 字').optional(),
  target_days: z.number().int().positive('目标天数必须为正整数').max(365, '目标天数最多 365').optional(),
}).refine(
  (data) => data.task_name !== undefined || data.target_days !== undefined,
  { message: '至少提供 task_name 或 target_days 中的一个' }
);

// 创建任务
router.post('/', validate({ body: createSchema }), wrapAsync(taskController.create));

// 获取任务列表 (分页)
router.get('/', wrapAsync(taskController.list));

// 更新任务
router.put('/:id', validate({ body: updateSchema }), wrapAsync(taskController.update));

// 删除任务
router.delete('/:id', wrapAsync(taskController.remove));

module.exports = router;
