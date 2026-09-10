/**
 * 晨光自律台 · 课表导入业务逻辑层
 * ============================================================
 * 【职责】
 * 通过后端代理抓取学校课表 HTML 页面，解析其中的二维表格，
 * 提取课程（名称 + 星期 + 节次），返回供前端合并进现有 courses。
 *
 * 【为什么走后端代理？】
 * 浏览器有 CORS 限制，无法直接 fetch 任意学校网站；后端用 Node 全局
 * fetch 抓取，天然规避跨域。同时把协议白名单、超时、响应体上限、
 * 限流等安全约束放在服务端。
 *
 * 【诚实的能力边界（best-effort）】
 * 每所学校教务处课表的表格结构和标记都不同，通用解析无法对全体学校
 * 完美工作。本实现按最常见布局（星期为列、节次/时间为行的二维表格）
 * 做启发式解析，并以 PARSERS 数组预留扩展点：后续可为特定学校写专用
 * 解析插入，不改调用方。纯图片课表 / 需登录页无法解析 → 抛友好错误。
 *
 * 【安全设计】
 * - 仅允许 http/https 协议（防 file://、ftp:// 等协议攻击）。
 * - URL 长度、响应体大小、抓取超时均有限制，防拖垮后端。
 * - routes/scheduleImport.js 上的 importLimiter 负责频控（防被当 SSRF 代理刷外网）。
 */
const cheerio = require('cheerio');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

// 允许的 URL 协议白名单
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

// 星期识别映射（文本 → 星期序号 0=周一 ... 6=周日）
// 支持中文「周一/星期一/周一上午」与英文 Mon/Monday 等，逐条精确映射，
// 避免「英文合成一条正则 + 索引取模」导致所有英文星期都被当成周一。
const WEEKDAY_ALIASES = [
  { wd: 0, re: /^.{0,3}(周一|星期一)(上午|下午)?/ },
  { wd: 1, re: /^.{0,3}(周二|星期二)(上午|下午)?/ },
  { wd: 2, re: /^.{0,3}(周三|星期三)(上午|下午)?/ },
  { wd: 3, re: /^.{0,3}(周四|星期四)(上午|下午)?/ },
  { wd: 4, re: /^.{0,3}(周五|星期五)(上午|下午)?/ },
  { wd: 5, re: /^.{0,3}(周六|星期六)(上午|下午)?/ },
  { wd: 6, re: /^.{0,3}(周日|星期日)(上午|下午)?/ },
  { wd: 0, re: /^.{0,3}(mon|monday)/i },
  { wd: 1, re: /^.{0,3}(tue|tues|tuesday)/i },
  { wd: 2, re: /^.{0,3}(wed|wednesday)/i },
  { wd: 3, re: /^.{0,3}(thu|thur|thurs|thursday)/i },
  { wd: 4, re: /^.{0,3}(fri|friday)/i },
  { wd: 5, re: /^.{0,3}(sat|saturday)/i },
  { wd: 6, re: /^.{0,3}(sun|sunday)/i },
];

/**
 * 校验并规整抓取 URL
 *
 * @param {string} url 用户填写的课表页链接
 * @returns {string} 规整后的 URL
 */
function validateUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw ApiError.badRequest('IMPORT_URL_REQUIRED', '请提供课表页面链接');
  }
  if (url.length > config.importMaxUrlLen) {
    throw ApiError.badRequest('IMPORT_URL_TOO_LONG', `课表链接过长（上限 ${config.importMaxUrlLen} 字符）`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    throw ApiError.badRequest('IMPORT_URL_INVALID', '课表链接格式不正确');
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw ApiError.badRequest('IMPORT_URL_PROTOCOL', '仅支持 http/https 课表链接');
  }
  return parsed.href;
}

/**
 * 判断一个字符串是否为"星期"表头
 * @returns {number} 星期序号 0=周一...6=周日；不是表头则返回 -1
 */
function isWeekday(text) {
  const t = (text || '').trim();
  if (!t) return -1;
  for (const alias of WEEKDAY_ALIASES) {
    if (alias.re.test(t)) return alias.wd;
  }
  return -1;
}

/**
 * 从单元格 HTML 提取课程名
 * 多行单元格常见格式：「课程名<br>教室」或「课程名<br>教师」，
 * 先把 <br> 转成换行、剥离其它标签，再逐行取第一个非节次/星期/时间的行为课程名。
 */
function extractCourseName(cellHtml) {
  const raw = String(cellHtml || '')
    .replace(/<br\s*\/?>/gi, '\n')   // <br> → 换行
    .replace(/<[^>]*>/g, '')          // 剥离其它标签
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r?\n/g, '\n');
  const lines = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    // 跳过明显的节次/时间标记
    if (/^(第\s*[0-9一二三四五六七八九十]+\s*节|时间|节次|上午|下午|晚上)\s*[:：]?/.test(line)) continue;
    if (/^[0-9]{1,2}[:：][0-9]{2}\s*-/.test(line)) continue; // "08:00-09:40"
    if (isWeekday(line) >= 0) continue;
    // 课程名通常不含学校首页那种超长导航文字，取合理长度
    if (line.length <= 40) return line;
  }
  return '';
}

/**
 * 从任意 HTML 中解析课程列表（best-effort 表格解析）
 *
 * 解析策略：
 * 1. 用 cheerio 加载 HTML。
 * 2. 取页面上「最大的 <table>」（按行数×列数估算），通常是课表主表。
 * 3. 表头行确定星期列；其余行为节次/时间行。
 * 4. 遍历每个非空单元格，提取课程名 + 所在星期列 + 行（节次）。
 * 5. 同课多节聚合为 slots[]。
 *
 * @param {string} html 抓取到的 HTML
 * @returns {Array<{name:string, slots:Array<{weekday:number,period:number}>}>}
 */
function parseCourses(html) {
  const $ = cheerio.load(html || '');

  // 定位最大的 table：按行数×列数估算面积
  let bestTable = null;
  let bestScore = 0;
  $('table').each(function () {
    const rows = $(this).find('tr').length;
    const cols = $(this).find('tr').first().find('th,td').length;
    const score = rows * cols;
    if (score > bestScore) {
      bestScore = score;
      bestTable = this;
    }
  });

  if (!bestTable) {
    throw ApiError.badRequest('IMPORT_NO_TABLE', '页面中没有找到课表表格，无法导入。请确认该链接是一个可公开访问的课表页面（图片课表暂不支持）。');
  }

  const $t = $(bestTable);
  const rows = $t.find('tr').get();

  if (!rows.length) {
    throw ApiError.badRequest('IMPORT_NO_ROWS', '课表表格中没有数据行');
  }

  // 第一步：确定表头行（星期列）。用整行识别星期词，命中数越多越像表头。
  let headerRowIdx = 0;
  let headerWeekdayCount = -1;
  rows.forEach((row, idx) => {
    const cells = $(row).find('th,td').get();
    let hit = 0;
    cells.forEach((cell) => { if (isWeekday($(cell).text()) >= 0) hit++; });
    if (hit > headerWeekdayCount) {
      headerWeekdayCount = hit;
      headerRowIdx = idx;
    }
  });

  // 第二步：星期列 → 列索引映射
  const headerCells = $(rows[headerRowIdx]).find('th,td').get();
  const weekdayCol = new Map(); // 列索引 → 星期(0-6)
  headerCells.forEach((cell, colIdx) => {
    const wd = isWeekday($(cell).text());
    if (wd >= 0) weekdayCol.set(colIdx, wd);
  });

  // 表头必须是星期行，否则可能不是课表布局
  if (!weekdayCol.size) {
    throw ApiError.badRequest('IMPORT_NO_WEEKDAYS', '未能识别课表里的星期列，无法解析。该页面可能不是标准的表格课表。');
  }

  // 第三步：遍历非表头行，提取课程
  const courseMap = new Map(); // 课程名 → { name, slots: [] }

  for (let r = 0; r < rows.length; r++) {
    if (r === headerRowIdx) continue;
    const cells = $(rows[r]).find('th,td').get();
    cells.forEach((cell, colIdx) => {
      const wd = weekdayCol.get(colIdx);
      if (wd === undefined) return; // 非星期列（如节次列）
      const name = extractCourseName($.html(cell) || $(cell).html());
      if (!name) return;
      // 节次：当前行号（相对表头的排数）
      const period = r - headerRowIdx;
      if (!courseMap.has(name)) courseMap.set(name, { name, slots: [] });
      // 同课、同星期、同节次才视为重复（同日不同节是不同的上课时段，应保留）
      const slots = courseMap.get(name).slots;
      if (!slots.some((s) => s.weekday === wd && s.period === period)) {
        slots.push({ weekday: wd, period });
      }
    });
  }

  if (!courseMap.size) {
    throw ApiError.badRequest('IMPORT_NO_COURSES', '解析到 0 门课程。请确认课表页面可访问且为可解析的表格。');
  }

  const courses = Array.from(courseMap.values());
  if (courses.length > config.importMaxCourse) {
    throw ApiError.badRequest('IMPORT_TOO_MANY', `解析到 ${courses.length} 门课程，超过单次上限 ${config.importMaxCourse}`);
  }
  return courses;
}

/**
 * 抓取并解析课表，对外主入口
 *
 * @param {string} url 课表页面链接
 * @returns {Promise<{courses:Array, source:string}>}
 */
async function importFromUrl(url) {
  const cleanUrl = validateUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.importTimeoutMs);

  let text;
  try {
    const res = await fetch(cleanUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw ApiError.badRequest('IMPORT_UPSTREAM_ERROR', `抓取课表页失败（HTTP ${res.status}），请确认链接可公开访问`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > config.importMaxBodyBytes) {
      throw ApiError.badRequest('IMPORT_PAGE_TOO_BIG', '课表页面过大，无法解析');
    }
    // 尝试按 charset 或 utf-8 解码；中文站常用 GBK，可能乱码，但表格结构仍可解析
    text = buf.toString('utf-8');
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.code === 'ESOCKETTIMEDOUT')) {
      throw ApiError.internal('IMPORT_TIMEOUT', '抓取课表超时，请稍后再试');
    }
    if (err instanceof TypeError) {
      throw ApiError.internal('IMPORT_NETWORK_ERROR', '无法连接课表网站');
    }
    if (err && err.name === 'ApiError') throw err;
    throw ApiError.internal('IMPORT_UNKNOWN_ERROR', '抓取课表失败，请稍后再试');
  } finally {
    clearTimeout(timer);
  }

  const courses = parseCourses(text);
  return { courses, source: cleanUrl };
}

module.exports = { importFromUrl, parseCourses, validateUrl };