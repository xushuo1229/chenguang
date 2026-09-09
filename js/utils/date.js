/**
 * 晨光自律台 · 日期工具函数 (ES Module)
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

// 同时挂载到 CGDate 命名空间下，避免全局变量污染
globalThis.CGDate = {
  todayStr: todayStr, formatDateCN: formatDateCN, fmtDate: fmtDate, formatDateShort: formatDateShort,
  dateStr: dateStr, formatMinutes: formatMinutes, formatNumber: formatNumber, isToday: isToday, calcStreak: calcStreak
};

// ES Module 导出
export { todayStr, formatDateCN, fmtDate, formatDateShort, dateStr, formatMinutes, formatNumber, isToday, calcStreak };
export default { todayStr, formatDateCN, fmtDate, formatDateShort, dateStr, formatMinutes, formatNumber, isToday, calcStreak };
