/**
 * 分页查询参数解析
 * ----------------------------------------------------------
 * 从 req.query 解析 page 和 per_page, 返回 SQL 用的 limit/offset
 *
 * 约定:
 *   page     默认 1, 最小 1
 *   per_page 默认 20, 最大 100
 *
 * 用法:
 *   const { page, perPage, limit, offset } = parsePagination(req.query);
 *   const total = await taskModel.count(...);
 *   const rows = await taskModel.findAll({ ..., limit, offset });
 *   res.success(rows, 200, buildPaginationMeta(page, perPage, total));
 */

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

/**
 * 解析分页参数
 * @param {Object} query - req.query
 * @returns {{ page: number, perPage: number, limit: number, offset: number }}
 */
function parsePagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || DEFAULT_PAGE);

  let perPage = parseInt(query.per_page, 10) || DEFAULT_PER_PAGE;
  if (perPage < 1) perPage = DEFAULT_PER_PAGE;
  if (perPage > MAX_PER_PAGE) perPage = MAX_PER_PAGE;

  return {
    page,
    perPage,
    limit: perPage,
    offset: (page - 1) * perPage,
  };
}

/**
 * 构造响应中的分页 meta
 * @param {number} page
 * @param {number} perPage
 * @param {number} total
 * @returns {{ pagination: { page, per_page, total, total_pages } }}
 */
function buildPaginationMeta(page, perPage, total) {
  return {
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage) || 1,
    },
  };
}

module.exports = { parsePagination, buildPaginationMeta };
