/**
 * 学习记录控制器
 * - create: POST /api/study        添加学习记录
 * - list:   GET  /api/study        获取学习记录 (日期范围 + 学科筛选 + 分页)
 * - stats:  GET  /api/study/stats   学习统计 (总时长 / 按学科 / 按周)
 */
const studyModel = require('../models/studyModel');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const { parseDateRange } = require('../utils/dateRange');

/**
 * 添加学习记录
 * POST /api/study
 * body: { date, duration_minutes, subject, content? }
 */
exports.create = async (req, res) => {
  const { date, duration_minutes, subject, content } = req.body;

  const record = await studyModel.create({
    user_id: req.user.id,
    date,
    duration_minutes,
    subject,
    content,
  });

  res.success(record, 201);
};

/**
 * 获取学习记录
 * GET /api/study?from=&to=&subject=&page=&per_page=
 */
exports.list = async (req, res) => {
  const { from, to, errors } = parseDateRange(req.query);
  if (errors.length) {
    throw ApiError.badRequest('DATE_RANGE_INVALID', errors.join('; '));
  }

  const { page, perPage, limit, offset } = parsePagination(req.query);
  const subject = req.query.subject;

  const { rows, total } = await studyModel.findAllByUser({
    user_id: req.user.id,
    from,
    to,
    subject,
    limit,
    offset,
  });

  res.success(rows, 200, buildPaginationMeta(page, perPage, total));
};

/**
 * 获取学习统计
 * GET /api/study/stats?from=&to=
 * 返回:
 *   - total_minutes   总学习时长 (分钟)
 *   - total_sessions  总学习次数
 *   - avg_per_session 平均每次时长
 *   - by_subject      按学科分组
 *   - by_week         按周分组 (ISO 周, 趋势)
 */
exports.stats = async (req, res) => {
  const { from, to, errors } = parseDateRange(req.query);
  if (errors.length) {
    throw ApiError.badRequest('DATE_RANGE_INVALID', errors.join('; '));
  }

  const stats = await studyModel.getStats({
    user_id: req.user.id,
    from,
    to,
  });

  res.success(stats);
};
