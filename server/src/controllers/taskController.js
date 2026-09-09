/**
 * 任务控制器
 * - create:   POST /api/tasks         创建任务
 * - list:     GET  /api/tasks         获取任务列表 (分页)
 * - update:   PUT  /api/tasks/:id     更新任务
 * - remove:   DELETE /api/tasks/:id   删除任务
 *
 * 所有操作基于 req.user.id (auth 中间件注入)
 */
const taskModel = require('../models/taskModel');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

/**
 * 创建任务
 * POST /api/tasks
 * body: { task_name, target_days }
 */
exports.create = async (req, res) => {
  const { task_name, target_days } = req.body;

  const task = await taskModel.create({
    user_id: req.user.id,
    task_name,
    target_days,
  });

  res.success(task, 201);
};

/**
 * 获取任务列表 (分页)
 * GET /api/tasks?page=1&per_page=20
 */
exports.list = async (req, res) => {
  const { page, perPage, limit, offset } = parsePagination(req.query);

  const { rows, total } = await taskModel.findAllByUser({
    user_id: req.user.id,
    limit,
    offset,
  });

  res.success(rows, 200, buildPaginationMeta(page, perPage, total));
};

/**
 * 更新任务
 * PUT /api/tasks/:id
 * body: { task_name?, target_days? }
 */
exports.update = async (req, res) => {
  const { id } = req.params;
  const { task_name, target_days } = req.body;

  const task = await taskModel.update(id, req.user.id, { task_name, target_days });
  if (!task) {
    throw ApiError.notFound('TASK_NOT_FOUND', '任务不存在或不属于当前用户');
  }

  res.success(task);
};

/**
 * 删除任务
 * DELETE /api/tasks/:id
 */
exports.remove = async (req, res) => {
  const { id } = req.params;

  const ok = await taskModel.remove(id, req.user.id);
  if (!ok) {
    throw ApiError.notFound('TASK_NOT_FOUND', '任务不存在或不属于当前用户');
  }

  res.status(204).end(); // 204 无响应体
};
