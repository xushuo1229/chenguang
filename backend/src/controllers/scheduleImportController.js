/**
 * 晨光自律台 · 课表导入控制器
 * ============================================================
 * 接收前端 POST /api/course/import 请求，请求体中携带课表页面 url，
 * 调用 scheduleImportService 抓取并解析，返回课程列表。
 */
const scheduleImportService = require('../services/scheduleImportService');

/**
 * POST /api/course/import
 * body: { url: string }
 * 成功响应: res.success({ courses: [...], source: url })
 */
async function importFromUrl(req, res, next) {
  try {
    const { url } = req.body || {};
    const result = await scheduleImportService.importFromUrl(url);
    res.success(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { importFromUrl };