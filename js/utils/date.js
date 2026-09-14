/**
 * 知行 · 日期工具函数 (ES Module)
 *
 * 本文件提供了一组日期处理工具函数，用于：
 * - 格式化日期显示（中文格式、短格式等）
 * - 计算日期偏移（昨天、明天）
 * - 格式化分钟数为"X小时X分钟"
 * - 计算连续签到天数（连续打卡）
 *
 * 为什么需要这些函数？
 * JavaScript 原生的 Date 对象操作比较繁琐，
 * 比如获取"2024-01-15"这样的字符串需要手动拼接。
 * 这些工具函数让日期操作变得简单。
 */
'use strict';

// ============================================================
// todayStr 函数 - 获取今天的日期字符串
// ============================================================
// 用法: todayStr()  → 返回 "2024-01-15"
//       todayStr(某个Date对象)  → 返回该日期的字符串
//
// 返回格式：YYYY-MM-DD（如 "2024-01-15"）
// 这种格式可以直接用于数据库存储、日期比较等。
//
// 参数：
//   d - 可选，Date 对象。如果不传，就使用当前时间
function todayStr(d) {
  d = d || new Date();
  // getMonth() 返回 0-11（0代表一月），所以要 +1
  // ('0' + 月份).slice(-2) 的作用是：如果月份是 1-9，前面补 0 变成 01-09
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  // 拼接成 YYYY-MM-DD 格式
  return d.getFullYear() + '-' + m + '-' + day;
}

// ============================================================
// formatDateCN 函数 - 格式化为中文日期
// ============================================================
// 用法: formatDateCN(new Date())  → 返回 "2024年1月15日"
//
// 适用于需要显示给用户看的中文日期格式。
//
// 参数：
//   date - Date 对象或日期字符串（如 "2024-01-15"）
function formatDateCN(date) {
  if (!date) return '';  // 防御性处理：空值直接返回空字符串
  // 如果传入的是字符串，先转成 Date 对象
  var d = typeof date === 'string' ? new Date(date) : date;
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// ============================================================
// fmtDate 函数 - 格式化为带星期的中文日期
// ============================================================
// 用法: fmtDate(new Date())  → 返回 "2024年1月15日 · 星期一"
//
// 比 formatDateCN 多了星期几的信息。
// weekdays 数组的索引与 getDay() 的返回值对应：
//   0 → '日'，1 → '一'，2 → '二'，...，6 → '六'
//
// 参数：
//   date - Date 对象或日期字符串
function fmtDate(date) {
  if (!date) return '';
  var d = typeof date === 'string' ? new Date(date) : date;
  // 星期数组，getDay() 返回 0(周日) 到 6(周六)
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 星期' + weekdays[d.getDay()];
}

// ============================================================
// formatDateShort 函数 - 格式化为简短日期
// ============================================================
// 用法: formatDateShort(new Date())  → 返回 "1月15日"
//
// 不显示年份，适用于日期较近时的简洁显示。
//
// 参数：
//   date - Date 对象或日期字符串
function formatDateShort(date) {
  if (!date) return '';
  var d = typeof date === 'string' ? new Date(date) : date;
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// ============================================================
// dateStr 函数 - 获取指定偏移量的日期字符串
// ============================================================
// 用法: dateStr()    → 今天的日期，如 "2024-01-15"
//       dateStr(1)   → 明天的日期，如 "2024-01-16"
//       dateStr(-1)  → 昨天的日期，如 "2024-01-14"
//
// 用于获取相对日期。比如显示"昨天"、"前天"的日期时很有用。
//
// 实现原理：
//   1. 获取当前日期
//   2. 用 setDate() 加上偏移天数
//   3. 把结果转成 YYYY-MM-DD 字符串
//
// 参数：
//   offset - 天数偏移量（正数=未来，负数=过去，默认 0=今天）
function dateStr(offset) {
  if (offset === undefined) offset = 0;
  var d = new Date();
  // setDate 会自动处理月份进位（比如 1月32日 → 2月1日）
  d.setDate(d.getDate() + offset);
  return todayStr(d);
}

// ============================================================
// formatMinutes 函数 - 将分钟数格式化为中文时间
// ============================================================
// 用法: formatMinutes(75)  → 返回 "1小时15分钟"
//       formatMinutes(120) → 返回 "2小时"
//       formatMinutes(30)  → 返回 "30分钟"
//
// 用于将任务耗时等以分钟为单位的数据，转换成人类易读的中文格式。
//
// 参数：
//   minutes - 分钟数（可以是字符串或数字）
function formatMinutes(minutes) {
  // Number() 转换确保是数字，|| 0 是默认值（如果转换失败就用 0）
  minutes = Number(minutes) || 0;
  // 不足 1 小时，直接显示分钟
  if (minutes < 60) return minutes + '分钟';
  // 计算小时数和剩余分钟数
  var h = Math.floor(minutes / 60);  // Math.floor 向下取整
  var m = minutes % 60;               // % 是取余运算符
  // 如果有剩余分钟，就同时显示小时和分钟
  return m > 0 ? h + '小时' + m + '分钟' : h + '小时';
}

// ============================================================
// formatNumber 函数 - 数字格式化（加千位分隔符）
// ============================================================
// 用法: formatNumber(1234567)  → 返回 "1,234,567"
//
// toLocaleString('zh-CN') 会按照中国数字格式添加千位分隔符，
// 让大数字更容易阅读。
//
// 参数：
//   n - 要格式化的数字
function formatNumber(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}

// ============================================================
// isToday 函数 - 判断某个日期字符串是否是今天
// ============================================================
// 用法: isToday('2024-01-15')  → 返回 true 或 false
//
// 原理：直接比较日期字符串是否相等。
// 因为 todayStr() 返回的格式是固定的 YYYY-MM-DD，所以可以直接用 === 比较。
//
// 参数：
//   dateStr - 日期字符串，格式为 YYYY-MM-DD
function isToday(dateStr) {
  return dateStr === todayStr();
}

// ============================================================
// calcStreak 函数 - 计算连续签到天数
// ============================================================
// 用法: calcStreak(['2024-01-15', '2024-01-14', '2024-01-13'])
//       → 返回 3（连续 3 天）
//
// 连续签到是"自律打卡"类应用的核心功能。
// 这个函数计算用户从今天开始，连续多少天都有签到记录。
//
// 计算逻辑（一步步解释）：
//   1. 先对日期去重（Set 自动去重）并按日期从大到小排序（最近的在前）
//   2. 检查最近一天是否是今天——如果不是，说明今天没签到，连续天数为 0
//   3. 从最近一天开始，逐个检查与前一天的间隔是否正好是 1 天
//      - 如果是 1 天，连续天数 +1
//      - 如果不是（比如中间断了一天），停止计算
//
// 举例：
//   输入 ['2024-01-15', '2024-01-14', '2024-01-13', '2024-01-11']
//   排序后：['2024-01-15', '2024-01-14', '2024-01-13', '2024-01-11']
//   从 15 日开始：15-14=1天 ✓，14-13=1天 ✓，13-11=2天 ✗
//   返回 3
//
// 参数：
//   dates - 日期字符串数组，如 ['2024-01-15', '2024-01-14', ...]
function calcStreak(dates) {
  // 没有签到记录，返回 0
  if (!dates || !dates.length) return 0;
  // 去重（Set）并排序（sort 默认按字符串升序），
  // 然后 reverse 反转为降序（最近的日期在前）
  var sorted = Array.from(new Set(dates)).sort().reverse();
  // 初始连续天数为 1（至少有今天这一天）
  var streak = 1;
  var today = todayStr();
  // 如果最近的签到日期不是今天，说明今天没签到，连续天数为 0
  if (sorted[0] !== today) return 0;
  // 从第 2 个日期开始，逐个检查是否与前一天连续
  for (var i = 1; i < sorted.length; i++) {
    // 创建日期对象，用于计算日期差
    var prev = new Date(sorted[i - 1]);
    var curr = new Date(sorted[i]);
    // 计算两个日期相差的天数
    // 除以 (1000*60*60*24) 是将毫秒转换为天数
    var diff = (prev - curr) / (1000 * 60 * 60 * 24);
    // 如果正好相差 1 天，说明是连续的，连续天数 +1
    if (diff === 1) { streak++; } else { break; }  // 不连续就停止
  }
  return streak;
}

// ============================================================
// Phase 9 —— 学期 / 周次 / 星期 / 节次 统一系统
// ============================================================
// 这是全项目「第几周 / 星期几 / 周次范围 / 节次时刻」唯一的事实来源。
// 前端解析器、课表编排、课程详情全部经过这里，避免各文件各自手写一套。
//
// 【约定】
//   - weekday 一律 0=周一 … 6=周日（与 scheduleTextParser、后端课表导入一致）。
//   - 周次使用 1 起始（第 1 周 … 第 N 周）。
//   - 空周次字符串表示「每周都上」。

/** WEEKDAY_NAMES —— 星期字面名（0=周一 … 6=周日） */
var WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** WEEKDAY_CN —— 中文星期字 → 0 起始序号（与解析器 WD_NUM 同源约定） */
var WEEKDAY_CN = { '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6 };

/** PERIOD_START_TIMES —— 常见上课节次 → 开始时刻（默认映射，可显示用） */
var PERIOD_START_TIMES = ['', '08:00', '08:50', '10:00', '10:50', '14:00', '14:50', '15:40', '16:30', '19:00', '19:50', '20:40', '21:30'];

/**
 * weekdayName(wd) —— 星期序号 → 中文名
 * 传 0-6（0=周一），返回 '周一'…'周日'；越界返回 ''。
 */
function weekdayName(wd) {
  wd = Number(wd);
  return (wd >= 0 && wd <= 6) ? WEEKDAY_NAMES[wd] : '';
}

/**
 * weekdayCN(s) —— 中文星期字 / 数字 → 0 起始序号
 * '一'→0 … '日'→6，'天'→6；单个数字按「数字-1」解释（'1'→周一=0）。
 * 解析失败返回 NaN。
 */
function weekdayCN(s) {
  s = String(s || '').trim();
  if (WEEKDAY_CN[s] !== undefined) return WEEKDAY_CN[s];
  if (/^\d$/.test(s)) {
    var n = parseInt(s, 10) - 1;
    return (n >= 0 && n <= 6) ? n : NaN;
  }
  return NaN;
}

/**
 * dateWeekday(dateStr) —— 日期 → 星期序号（0=周一 … 6=周日）
 * 用 YYYY-MM-DD + 'T00:00:00' 解析为本地时间，避免 UTC 解析造成跨日偏差。
 * 非法日期返回 -1。
 */
function dateWeekday(dateStr) {
  var d = new Date(String(dateStr || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return -1;
  return (d.getDay() + 6) % 7; // JS getDay(): 0=周日 → 转 6；周一 getDay()=1 → 0
}

/**
 * dateOffset(dateStr, days) —— 日期字符串加上偏移天数
 * '2026-09-11' + 5 → '2026-09-16'；非法输入回退为今天。
 */
function dateOffset(dateStr, days) {
  var d = new Date(String(dateStr || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) d = new Date();
  d.setDate(d.getDate() + (Number(days) || 0));
  return todayStr(d);
}

/**
 * weeksInfo(weeksStr) —— 把任意写法的周次字符串解析为区间 + 奇偶标记
 * 【支持】'1-16' / '1~16' / '1,3,5,7' / '1-8,10-16' / '1-16周' / '1-16周(单)'
 *        / '单' / '双' / '1-16(双)' / 全角数字与全角标点
 * 【返回】{ ranges:[[a,b],...], parity:0=全部|1=单周|2=双周 }
 */
function weeksInfo(weeksStr) {
  var s = String(weeksStr || '')
    .replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
    .replace(/,/g, ',')
    .replace(/[－—―–～~至到]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!s) return { ranges: [], parity: 0 };

  // 奇偶标记：[（(]单[)）] / 单周 / 行尾单/双
  var parity = 0;
  var pm = /[（(]([单双])[)）]|([单双])周|(?:周)?([单双])$/.exec(s);
  if (pm) parity = ((pm[1] || pm[2] || pm[3]) === '双') ? 2 : 1;
  if (parity) {
    s = s
      .replace(/[（(][单双][)）]/g, '')  // 去掉 (单)/(双)
      .replace(/[单双]周/g, '')           // 去掉 单周/双周
      .replace(/周$/g, '');
    if (!s) s = '1-53';                   // 纯「单/双周」→ 全区间
  } else {
    s = s.replace(/周/g, '').replace(/[（(][)）]/g, '');
  }

  var ranges = [];
  var parts = s.split(',');
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i].trim();
    if (!seg) continue;
    var segParts = seg.split('-');
    var a = parseInt(segParts[0], 10);
    var b = segParts.length > 1 ? parseInt(segParts[1], 10) : a;
    if (isNaN(a) || isNaN(b)) continue;
    ranges.push([a, b < a ? a : b]);
  }
  return { ranges: ranges, parity: parity };
}

/**
 * weeksContain(weeksStr, week) —— 某课程周次字符串是否覆盖第 week 周
 * 空字符串 → 每周都上；'1-16' 观察数是否在区间内；'单'/'双' 按奇偶判定。
 */
function weeksContain(weeksStr, week) {
  if (weeksStr === undefined || weeksStr === null || String(weeksStr).trim() === '') return true;
  week = Number(week);
  var info = weeksInfo(weeksStr);
  if (info.parity === 1 && week % 2 !== 1) return false;
  if (info.parity === 2 && week % 2 !== 0) return false;
  if (!info.ranges.length) return true; // 只有奇偶标记 → 全区间皆按奇偶
  for (var i = 0; i < info.ranges.length; i++) {
    if (week >= info.ranges[i][0] && week <= info.ranges[i][1]) return true;
  }
  return false;
}

/**
 * semesterWeekOf(dateStr, semesterStart) —— 某个日期在本学期是第几周
 * 以学期第 1 周为基准：第 1 周周一至周日 = 第 1 周，之后每 7 天 +1 周。
 * 【返回】正整数（1 起始）；未配置学期开始日 / 日期早于开始日 / 非法输入 → 0。
 */
function semesterWeekOf(dateStr, semesterStart) {
  if (!semesterStart) return 0;
  var start = new Date(String(semesterStart).slice(0, 10) + 'T00:00:00');
  var d = new Date(String(dateStr || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(d.getTime())) return 0;
  var diffDays = Math.floor((d.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7) + 1;
}

/**
 * periodStartTime(period) —— 节次 → 开始时刻（默认映射，用于展示）
 * 查表失败返回 ''。
 */
function periodStartTime(period) {
  period = Number(period);
  return PERIOD_START_TIMES[period] || '';
}

/**
 * periodTimeRange(first, last) —— 节次区间 → 'HH:MM–HH:MM' 显示串
 * [3,4] → '10:00–11:35'（末节持续 45 分钟）；单节 [3] → '10:00–10:45'；
 * 查表失败返回 ''。
 */
function periodTimeRange(first, last) {
  first = Number(first); if (!first) return '';
  last = Number(last) || first;
  var a = periodStartTime(first);
  if (!a) return '';
  var b = periodStartTime(last) || a;
  var hm = b.split(':');
  var mins = Number(hm[0]) * 60 + Number(hm[1]) + 45;
  var hh = ('0' + Math.floor(mins / 60)).slice(-2);
  var mm = ('0' + (mins % 60)).slice(-2);
  return a + '–' + hh + ':' + mm;
}

// ============================================================
// 将所有函数注册到全局对象
// ============================================================
globalThis.todayStr = todayStr;
globalThis.formatDateCN = formatDateCN;
globalThis.fmtDate = fmtDate;
globalThis.formatDateShort = formatDateShort;
globalThis.dateStr = dateStr;
globalThis.formatMinutes = formatMinutes;
globalThis.formatNumber = formatNumber;
globalThis.isToday = isToday;
globalThis.calcStreak = calcStreak;
globalThis.weekdayName = weekdayName;
globalThis.weekdayCN = weekdayCN;
globalThis.dateWeekday = dateWeekday;
globalThis.dateOffset = dateOffset;
globalThis.weeksInfo = weeksInfo;
globalThis.weeksContain = weeksContain;
globalThis.semesterWeekOf = semesterWeekOf;
globalThis.periodStartTime = periodStartTime;
globalThis.periodTimeRange = periodTimeRange;

// 同时挂载到 CGDate 命名空间下，避免全局变量污染
globalThis.CGDate = {
  todayStr: todayStr, formatDateCN: formatDateCN, fmtDate: fmtDate, formatDateShort: formatDateShort,
  dateStr: dateStr, formatMinutes: formatMinutes, formatNumber: formatNumber, isToday: isToday, calcStreak: calcStreak,
  weekdayName: weekdayName, weekdayCN: weekdayCN, dateWeekday: dateWeekday, dateOffset: dateOffset,
  weeksInfo: weeksInfo, weeksContain: weeksContain, semesterWeekOf: semesterWeekOf,
  periodStartTime: periodStartTime, periodTimeRange: periodTimeRange
};

// ES Module 导出
export {
  todayStr, formatDateCN, fmtDate, formatDateShort, dateStr, formatMinutes, formatNumber, isToday, calcStreak,
  weekdayName, weekdayCN, dateWeekday, dateOffset, weeksInfo, weeksContain, semesterWeekOf,
  periodStartTime, periodTimeRange
};

export default {
  todayStr: todayStr, formatDateCN: formatDateCN, fmtDate: fmtDate, formatDateShort: formatDateShort,
  dateStr: dateStr, formatMinutes: formatMinutes, formatNumber: formatNumber, isToday: isToday, calcStreak: calcStreak,
  weekdayName: weekdayName, weekdayCN: weekdayCN, dateWeekday: dateWeekday, dateOffset: dateOffset,
  weeksInfo: weeksInfo, weeksContain: weeksContain, semesterWeekOf: semesterWeekOf,
  periodStartTime: periodStartTime, periodTimeRange: periodTimeRange
};
