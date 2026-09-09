/**
 * 打卡控制器
 * - create: POST /api/checkins        打卡 (status='done' 时重算 streak)
 * - list:   GET  /api/checkins        打卡记录 (支持日期范围 + 任务筛选 + 分页)
 * - stats:  GET  /api/checkins/stats   统计 (连续天数 / 完成率 / 按任务)
 */
const checkinModel = require('../models/checkinModel');
const taskModel = require('../models/taskModel');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const { parseDateRange } = require('../utils/dateRange');
const { broadcastCheckin } = require('../services/realtimeService');

/**
 * 打卡
 * POST /api/checkins
 * body: { task_id, checkin_date, status?, note? }
 */
exports.create = async (req, res) => {
  const { task_id, checkin_date, status = 'done', note } = req.body;

  // 校验目标日期不能晚于今天 (不允许提前打卡)
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  if (checkin_date > todayStr) {
    throw ApiError.badRequest('FUTURE_DATE_NOT_ALLOWED', '不能为未来日期打卡');
  }

  const checkin = await checkinModel.create({
    user_id: req.user.id,
    task_id,
    checkin_date,
    status,
    note,
  });

  // 广播打卡动态到 Realtime (异步, 不阻塞响应)
  // 仅 status='done' 时广播 (skip 状态不打扰)
  if (status === 'done') {
    broadcastCheckin({ ...checkin, user_id: req.user.id });
  }

  res.success(checkin, 201);
};

/**
 * 获取打卡记录
 * GET /api/checkins?from=&to=&task_id=&page=&per_page=
 */
exports.list = async (req, res) => {
  const { from, to, errors } = parseDateRange(req.query);
  if (errors.length) {
    throw ApiError.badRequest('DATE_RANGE_INVALID', errors.join('; '));
  }

  const { page, perPage, limit, offset } = parsePagination(req.query);
  const task_id = req.query.task_id;

  const { rows, total } = await checkinModel.findAllByUser({
    user_id: req.user.id,
    from,
    to,
    task_id,
    limit,
    offset,
  });

  res.success(rows, 200, buildPaginationMeta(page, perPage, total));
};

/**
 * 获取打卡统计
 * GET /api/checkins/stats?from=&to=
 * 返回:
 *   - total_checkins  总打卡数
 *   - done_checkins   完成打卡数
 *   - completion_rate 完成率 (0-100, 保留 2 位小数)
 *   - longest_streak   当前最长连续天数 (跨所有任务)
 *   - by_task          按任务分组明细
 */
exports.stats = async (req, res) => {
  const { from, to, errors } = parseDateRange(req.query);
  if (errors.length) {
    throw ApiError.badRequest('DATE_RANGE_INVALID', errors.join('; '));
  }

  const stats = await checkinModel.getStats({
    user_id: req.user.id,
    from,
    to,
  });

  res.success(stats);
};
