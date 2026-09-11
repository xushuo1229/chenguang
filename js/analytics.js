/**
 * 晨光自律台 · 统一数据分析引擎（Unified Analytics）(ES Module)
 * --------------------------------------------------------------------------
 * 【职责】
 *   Phase 10：让所有统计由一个 Analytics Engine 产生，而不是由各页面各自重复计算。
 *   stats / index / workbench（以及未来的 AI 2.0）只负责「读取结果 + 展示」，
 *   所有「算」都收敛到这里，遵循：
 *     CGStore → snapshot → Analytics → result
 *
 * 【设计契约】
 *   1. 纯计算层：read-only + deterministic + side-effect free。
 *      - 不修改 CGStore / localStorage / 任何数据
 *      - 不触发 sync / 不修改 revision / 不创建 tombstone
 *      - 同一份数据 + 同一范围 ⇒ 同一输出
 *   2. 幂等安全：重复调用 100 次对数据零影响（本模块自身不写任何东西）。
 *   3. 输出全部是新对象（map / reduce 新建），绝不回传 Store 内部引用，
 *      调用方怎么改结果都不会污染源数据。
 *   4. 防御式解析：null / undefined / 坏日期 / 缺字段 / 旧数据一律跳过或归零，
 *      单条坏记录不会导致整个统计崩溃。
 *   5. 日期范围约定：全项目统一「含首尾」闭区间 [startDate, endDate]，
 *      均使用 'YYYY-MM-DD' 本地日期字符串。weekday 沿用 0=周一 … 6=周日。
 *
 * 【复用】
 *   - 日期 / 周次 / 星期：复用 js/utils/date.js（CGDate）。
 *   - 课程周次编排：复用 js/courseSchedule.js（CGCourseSchedule），
 *     课程统计绝不自己重写周次算法。
 *
 * 【数据字典（真实结构见 js/store.js emptyData / *_add 默认值）】
 *   checkins : date + status('done')                       → 打卡天数 / streak
 *   sports   : date + duration + calories + type + name    → 运动次数 / 时长 / 卡路里
 *   readings : date + pages + totalPages + bookName        → 阅读条目 / 页数 / 读完判定
 *   english  : date + words + minutes                      → 英语学习分钟 / 词数
 *   todos    : date + done + text + priority               → 待办 总/完/过期 与完成率
 *   focus    : date + minutes + task                       → 专注 次数 / 分钟 / 均值
 *   courses  : name + progress/status + slots[] + credits  → 课程库概览 + 排课周次
 *   user     : semesterStart + currentWeek（学期配置）
 * --------------------------------------------------------------------------
 */
'use strict';

import CourseSchedule from './courseSchedule.js';

/* ===== 复用 date.js 的纯函数 ===== */
import {
  todayStr, dateStr, dateOffset, calcStreak,
  weekdayName, dateWeekday, semesterWeekOf
} from './utils/date.js';

/* ===== 常量 ===== */

var DAY_MS = 86400000;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ===== 内部工具（纯函数） ===== */

/** 安全取数组 */
function _arr(v) { return Array.isArray(v) ? v : []; }

/** 安全取数字，坏值归 0 */
function _num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

/** 非负补齐（时长/字数/页数等不允许负数污染聚合） */
function _p(v) { return Math.max(0, _num(v)); }

/** 安全取字符串 */
function _str(v) { return v == null ? '' : String(v); }

/** 是否为合法 'YYYY-MM-DD' 且真实存在的日期 */
function isValidDateStr(s) {
  if (!DATE_RE.test(s)) return false;
  var parts = s.split('-'), y = +parts[0], m = +parts[1], d = +parts[2];
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  var dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 日期字符串 → 本地 Date（避免 UTC 星期漂移） */
function parseDate(s) { return new Date(s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }

/** 两个日期字符串相差的整天数（b - a） */
function dayDiff(a, b) { return Math.round((parseDate(b) - parseDate(a)) / DAY_MS); }

/** 在闭区间内补全每一天，输出 'YYYY-MM-DD' 数组 */
function eachDay(start, end) {
  var out = [], a = start, e = end;
  if (a > e) { var t = a; a = e; e = t; }
  var cur = a, guard = 0;
  while (cur <= e && guard <= 3660) {
    out.push(cur);
    cur = dateOffset(cur, 1);
    guard++;
  }
  return out;
}

/** 该日期所在周的周一（周一为一周起点） */
function mondayOf(dateStrValue) {
  var wd = dateWeekday(dateStrValue); // 0=周一
  return dateOffset(dateStrValue, -wd);
}

/** `today`（stateless 版本，测试可注入） */
function _today(opts) { return opts && opts.today ? opts.today : todayStr(); }

/** 学期周次解析：手动 currentWeek 优先，未配置返回 0（= 不按周过滤） */
function semesterWeek(data, date) {
  var u = data && data.user ? data.user : {};
  if (_num(u.currentWeek) > 0) return _num(u.currentWeek);
  if (u.semesterStart && isValidDateStr(u.semesterStart)) return semesterWeekOf(date, u.semesterStart);
  return 0;
}

/** 从数据构建 date → 聚合值的映射（只关心 [start,end] 内记录） */
function buildDayData(data, start, end) {
  var map = {};
  var inRange = makeRangeFilter(start, end);

  _arr(data.checkins).forEach(function (c) {
    var d = _str(c.date);
    if (!isValidDateStr(d) || !inRange(d)) return;
    if (!map[d]) map[d] = blankDay();
    if (c.status === 'done' || c.status === 'completed') map[d].checkin = 1;
  });
  _arr(data.english).forEach(function (r) {
    var d = _str(r.date);
    if (!isValidDateStr(d) || !inRange(d)) return;
    if (!map[d]) map[d] = blankDay();
    map[d].english += _p(r.minutes);
    map[d].words += _p(r.words);
  });
  _arr(data.focus).forEach(function (r) {
    var d = _str(r.date);
    if (!isValidDateStr(d) || !inRange(d)) return;
    if (!map[d]) map[d] = blankDay();
    map[d].focus += _p(r.minutes);
    map[d].focusSessions++;
  });
  _arr(data.sports).forEach(function (r) {
    var d = _str(r.date);
    if (!isValidDateStr(d) || !inRange(d)) return;
    if (!map[d]) map[d] = blankDay();
    map[d].sports++;
    map[d].sportMinutes += _p(r.duration);
    map[d].calories += _p(r.calories);
  });
  _arr(data.readings).forEach(function (r) {
    var d = _str(r.date);
    if (!isValidDateStr(d) || !inRange(d)) return;
    if (!map[d]) map[d] = blankDay();
    map[d].readings++;
    map[d].readingPages += _p(r.pages);
  });
  _arr(data.todos).forEach(function (r) {
    var d = _str(r.date);
    if (!isValidDateStr(d) || !inRange(d)) return;
    if (!map[d]) map[d] = blankDay();
    map[d].todoTotal++;
    if (r.done) map[d].todoDone++;
  });
  return map;
}

/** 空的一天聚合值 */
function blankDay() {
  return { checkin: 0, english: 0, words: 0, focus: 0, focusSessions: 0, sports: 0, sportMinutes: 0, calories: 0, readings: 0, readingPages: 0, todoTotal: 0, todoDone: 0, activity: 0 };
}

/** 返回日期是否在闭区间内的判断函数 */
function makeRangeFilter(start, end) {
  var a = start, e = end;
  if (a > e) { var t = a; a = e; e = t; }
  return function (d) { return d >= a && d <= e; };
}

/** 一天的活跃度分类（可解释、无权重拍脑袋）：计数「有动作」的类别数 */
function activityOf(day, courseOn) {
  var n = 0;
  if (day.checkin) n++;
  if (day.sports > 0) n++;
  if (day.readings > 0) n++;
  if (day.english > 0) n++;
  if (day.focus > 0) n++;
  if (day.todoDone > 0) n++;
  if (courseOn) n++;
  return n;
}

/** 把 rating 范围内的每日 map 补全为连续日期数组（含空天 0 值） */
function fillRange(map, start, end) {
  return eachDay(start, end).map(function (d) {
    var b = map[d] || blankDay();
    b._date = d;
    return b;
  });
}

/** 计算 todo 完成率：done / total（total=0 时 rate=0） */
function rateOf(done, total) {
  return total > 0 ? Math.round((done / total) * 1000) / 10 : 0;
}

/** 该数据快照内某天排了课吗（复用 CourseSchedule，不重写周次） */
function courseOnDay(data, date, courses) {
  var cs = _arr(courses || data.courses);
  if (!cs.length) return false;
  var week = semesterWeek(data, date);
  var wd = dateWeekday(date);
  if (wd < 0) return false;
  var days = CourseSchedule.getWeeklyCourses(cs, week);
  if (!days || !days[wd]) return false;
  return days[wd].items.length > 0;
}

/**
 * 排课统计：返回 { sessions, distinctCourses }；week≤0 不按周过滤。
 * 【必须逐日取周次】范围可能跨越多个周/学期边界，只用起点那一周的课表会
 * 高估月/自定义区间的节次（Review M1）；故对每一天按 `semesterWeek(data, d)`
 * 取对应周次，并按「周次 → 一周课表」缓存复用，避免逐日重建整周课表。
 */
function scheduleStats(data, start, end, courses) {
  var cs = _arr(courses || data.courses);
  if (!cs.length) return { sessions: 0, distinctCourses: 0 };
  var weekTable = {};
  var out = { sessions: 0 };
  var names = {};
  eachDay(start, end).forEach(function (d) {
    var wd = dateWeekday(d);
    if (wd < 0) return;
    var w = semesterWeek(data, d);
    if (!(w in weekTable)) weekTable[w] = CourseSchedule.getWeeklyCourses(cs, w);
    var days = weekTable[w];
    if (!days || !days[wd]) return;
    var items = days[wd].items;
    if (items.length) out.sessions += items.length;
    items.forEach(function (it) { if (it.course && it.course.name) names[it.course.name] = 1; });
  });
  out.distinctCourses = Object.keys(names).length;
  return out;
}

/** 判断传入参数是否是「数据快照」而非选项对象 */
function isSnapshotLike(v) {
  return !!(v && typeof v === 'object' && (v.checkins || v.todos || v.focus || v.user));
}

/** 浅拷贝一条记录（避免调用方拿到 Store 内部对象引用后改坏源数据） */
function cloneRecord(r) { return (r && typeof r === 'object') ? Object.assign({}, r) : r; }

/** 用户数据快照（新对象 + 各集合各记录拷贝；绝不写回、绝不泄漏内部引用） */
function snapshot(data) {
  var src;
  if (data && typeof data === 'object') {
    src = data;
  } else {
    try {
      src = (globalThis.CGStore && typeof globalThis.CGStore.get === 'function') ? globalThis.CGStore.get() : null;
    } catch (_) { src = null; }
  }
  var user = (src && src.user && typeof src.user === 'object') ? src.user : {};
  return {
    user: Object.assign({}, user),
    checkins: _arr(src && src.checkins).map(cloneRecord),
    sports: _arr(src && src.sports).map(cloneRecord),
    readings: _arr(src && src.readings).map(cloneRecord),
    courses: _arr(src && src.courses).map(cloneRecord),
    english: _arr(src && src.english).map(cloneRecord),
    todos: _arr(src && src.todos).map(cloneRecord),
    focus: _arr(src && src.focus).map(cloneRecord)
  };
}

/* ===== 范围窗口（复用 date.js，stats/index/workbench 统一从这里取） ===== */

/** 今天 / 昨天 / 近 N 天 / 本周 / 上周 / 本月 / 上月 → 闭区间 [start, end] */
function windowThisWeek(dateOpts) {
  var d = dateOpts || todayStr();
  var m = mondayOf(d);
  return [m, dateOffset(m, 6)];
}
function windowLastWeek(dateOpts) {
  var m = mondayOf(dateOpts || todayStr());
  return [dateOffset(m, -7), dateOffset(m, -1)];
}
function windowThisMonth(dateOpts) {
  var d = (dateOpts && isValidDateStr(dateOpts)) ? dateOpts : todayStr();
  var y = parseInt(d.slice(0, 4), 10), m = parseInt(d.slice(5, 7), 10);
  return [d.slice(0, 7) + '-01', lastDayOfMonth(y, m)];
}
function windowLastMonth(dateOpts) {
  var d = (dateOpts && isValidDateStr(dateOpts)) ? dateOpts : todayStr();
  var y = parseInt(d.slice(0, 4), 10), m = parseInt(d.slice(5, 7), 10);
  var ny = m === 1 ? y - 1 : y, nm = m === 1 ? 12 : m - 1;
  return [ny + '-' + pad2(nm) + '-01', lastDayOfMonth(ny, nm)];
}
function windowLastNDays(n, dateOpts) {
  var end = (dateOpts && isValidDateStr(dateOpts)) ? dateOpts : todayStr();
  return [dateOffset(end, -(Math.max(1, _num(n)) - 1)), end];
}
function pad2(x) { return (x < 10 ? '0' : '') + x; }
function lastDayOfMonth(y, m) { return y + '-' + pad2(m) + '-' + pad2(new Date(y, m, 0).getDate()); }

/** 校验并顺位 [start,end]；坏日期返回 null */
function normalizeRange(start, end) {
  if (!isValidDateStr(start) || !isValidDateStr(end)) return null;
  return start <= end ? [start, end] : [end, start];
}

/* ===== 待办统计 ===== */

function todoStatsIn(todos, range, today) {
  var filter = makeRangeFilter(range[0], range[1]);
  today = today || todayStr(); // 逾期判断的参考日，测试可注入
  var total = 0, done = 0, overdue = 0;
  _arr(todos).forEach(function (t) {
    var d = _str(t.date);
    if (!isValidDateStr(d) || !filter(d)) return;
    total++;
    if (t.done) { done++; return; }
    if (d < today) overdue++;
  });
  return { total: total, done: done, pending: total - done, overdue: overdue, completionRate: rateOf(done, total) };
}

/* ===== 成绩统计 ===== */

function courseLibrarySummary(courses) {
  var cs = _arr(courses);
  var done = 0, progressSum = 0, creditsSum = 0;
  var types = {};
  cs.forEach(function (c) {
    if (!c) return;
    if (_num(c.progress) >= 100 || c.status === 'done' || c.status === 'completed') done++;
    progressSum += Math.max(0, Math.min(100, _num(c.progress)));
    creditsSum += Math.max(0, _num(c.credits));
    var t = _str(c.courseType) || '未分类';
    types[t] = (types[t] || 0) + 1;
  });
  var total = cs.length;
  return {
    count: total,
    done: done,
    pending: total - done,
    avgProgress: total > 0 ? Math.round(progressSum / total) : 0,
    totalCredits: creditsSum,
    typeDistribution: types,
    completionRate: rateOf(done, total)
  };
}

/* ===== 公开 API ===== */

var Analytics = {
  /* ---- 数据接入 ---- */
  snapshot: snapshot,

  /* ---- 范围窗口 ---- */
  today: function () { return todayStr(); },
  thisWeek: windowThisWeek,
  lastWeek: windowLastWeek,
  thisMonth: windowThisMonth,
  lastMonth: windowLastMonth,
  lastNDays: windowLastNDays,

  /* ---- 单日 ---- */
  getDailySummary: function (date, data) {
    var d = _str(date);
    if (!isValidDateStr(d)) return null;
    var snap = data && typeof data === 'object' ? data : snapshot();
    var day = buildDayData(snap, d, d)[d] || blankDay();
    var cs = _arr(snap.courses);
    var onDay = cs.length > 0 && courseOnDay(snap, d, cs);
    day.activity = activityOf(day, onDay);

    return {
      date: d,
      checkin: { done: day.checkin > 0, count: day.checkin },
      study: {
        englishMinutes: day.english,
        focusMinutes: day.focus,
        minutes: day.english + day.focus,
        words: day.words
      },
      sports: { count: day.sports, durationMinutes: day.sportMinutes, calories: day.calories },
      readings: { count: day.readings, pages: day.readingPages },
      focus: { sessions: day.focusSessions, minutes: day.focus },
      todos: todoStatsIn(snap.todos, [d, d]),
      courses: { scheduled: onDay ? 1 : 0, onDay: onDay },
      activity: { score: day.activity }
    };
  },

  /* ---- 周 ---- */
  getWeeklySummary: function (opts, data) {
    // 兼容两种调用：getWeeklySummary(data) / getWeeklySummary({ date }, data)
    if (opts && typeof opts === 'object' && !('date' in opts) && isSnapshotLike(opts)) { data = opts; opts = undefined; }
    var snap = data && typeof data === 'object' ? data : snapshot();
    var range = windowThisWeek(opts && opts.date);
    var dayData = buildDayData(snap, range[0], range[1]);
    var days = fillRange(dayData, range[0], range[1]);
    var sch = scheduleStats(snap, range[0], range[1], snap.courses);

    days.forEach(function (day) {
      day.activity = activityOf(day, courseOnDay(snap, day._date, snap.courses));
    });
    var activeDays = days.filter(function (day) { return day.activity > 0; }).length;
    var doneDays = days.filter(function (day) { return day.checkin > 0; }).length;
    var study = days.reduce(function (s, day) { s.englishMinutes += day.english; s.focusMinutes += day.focus; s.minutes += day.english + day.focus; s.words += day.words; return s; }, { englishMinutes: 0, focusMinutes: 0, minutes: 0, words: 0 });
    var totalTodos = days.reduce(function (s, day) { s.total += day.todoTotal; s.done += day.todoDone; return s; }, { total: 0, done: 0 });
    var focus = days.reduce(function (s, day) { s.sessions += day.focusSessions; s.minutes += day.focus; return s; }, { sessions: 0, minutes: 0 });

    return {
      range: { start: range[0], end: range[1] },
      checkins: { doneDays: doneDays, days: days.length },
      todos: Object.assign(totalTodos, { pending: totalTodos.total - totalTodos.done, completionRate: rateOf(totalTodos.done, totalTodos.total) }),
      study: study,
      focus: Object.assign(focus, { avgMinutes: focus.sessions > 0 ? Math.round((focus.minutes / focus.sessions) * 10) / 10 : 0 }),
      sports: days.reduce(function (s, day) { s.count += day.sports; s.minutes += day.sportMinutes; s.calories += day.calories; return s; }, { count: 0, minutes: 0, calories: 0 }),
      readings: days.reduce(function (s, day) { s.entries += day.readings; s.pages += day.readingPages; return s; }, { entries: 0, pages: 0 }),
      courses: { sessions: sch.sessions, distinctCourses: sch.distinctCourses },
      activity: { activeDays: activeDays },
      completion: {
        todoCompletionRate: rateOf(totalTodos.done, totalTodos.total),
        activeDayCompletionRate: rateOf(activeDays, days.length)
      }
    };
  },

  /* ---- 月 ---- */
  getMonthlySummary: function (year, month, data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    if (!_num(year) || !_num(month)) return null;
    var y = _num(year), m = _num(month);
    if (m < 1 || m > 12) return null;
    var range = [y + '-' + pad2(m) + '-01', lastDayOfMonth(y, m)];
    var dayData = buildDayData(snap, range[0], range[1]);
    var days = fillRange(dayData, range[0], range[1]);
    var sch = scheduleStats(snap, range[0], range[1], snap.courses);

    days.forEach(function (day) {
      day.activity = activityOf(day, courseOnDay(snap, day._date, snap.courses));
    });
    var activeDays = days.filter(function (day) { return day.activity > 0; }).length;
    var doneDays = days.filter(function (day) { return day.checkin > 0; }).length;
    var study = days.reduce(function (s, day) { s.englishMinutes += day.english; s.focusMinutes += day.focus; s.minutes += day.english + day.focus; s.words += day.words; return s; }, { englishMinutes: 0, focusMinutes: 0, minutes: 0, words: 0 });
    var todosSum = days.reduce(function (s, day) { s.total += day.todoTotal; s.done += day.todoDone; return s; }, { total: 0, done: 0 });
    var focus = days.reduce(function (s, day) { s.sessions += day.focusSessions; s.minutes += day.focus; return s; }, { sessions: 0, minutes: 0 });

    function trendOf(key) {
      return days.map(function (day) { return { date: day._date, value: day[key] }; });
    }

    return {
      range: { start: range[0], end: range[1], year: y, month: m },
      checkins: { doneDays: doneDays, days: days.length },
      activity: { activeDays: activeDays },
      study: study,
      focus: Object.assign(focus, { avgMinutes: focus.sessions > 0 ? Math.round((focus.minutes / focus.sessions) * 10) / 10 : 0 }),
      sports: days.reduce(function (s, day) { s.count += day.sports; s.minutes += day.sportMinutes; s.calories += day.calories; return s; }, { count: 0, minutes: 0, calories: 0 }),
      readings: days.reduce(function (s, day) { s.entries += day.readings; s.pages += day.readingPages; return s; }, { entries: 0, pages: 0 }),
      todos: Object.assign(todosSum, { pending: todosSum.total - todosSum.done, completionRate: rateOf(todosSum.done, todosSum.total) }),
      courses: Object.assign(scheduleStats(snap, range[0], range[1], snap.courses), { library: courseLibrarySummary(snap.courses) }),
      completion: {
        todoCompletionRate: rateOf(todosSum.done, todosSum.total),
        activeDayCompletionRate: rateOf(activeDays, days.length)
      },
      trends: {
        study: trendOfStudy(days),
        checkin: trendOf('checkin'),
        focus: trendOf('focus'),
        sports: trendOf('sports'),
        reading: trendOf('readings')
      }
    };
  },

  /* ---- 自定义范围 ---- */
  getDateRangeSummary: function (startDate, endDate, data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    var range = normalizeRange(startDate, endDate);
    if (!range) return null;
    var dayData = buildDayData(snap, range[0], range[1]);
    var days = fillRange(dayData, range[0], range[1]);
    var sch = scheduleStats(snap, range[0], range[1], snap.courses);

    days.forEach(function (day) {
      day.activity = activityOf(day, courseOnDay(snap, day._date, snap.courses));
    });
    var activeDays = days.filter(function (day) { return day.activity > 0; }).length;
    var doneDays = days.filter(function (day) { return day.checkin > 0; }).length;
    var study = days.reduce(function (s, day) { s.englishMinutes += day.english; s.focusMinutes += day.focus; s.minutes += day.english + day.focus; return s; }, { englishMinutes: 0, focusMinutes: 0, minutes: 0 });
    var todosSum = days.reduce(function (s, day) { s.total += day.todoTotal; s.done += day.todoDone; return s; }, { total: 0, done: 0 });
    var focus = days.reduce(function (s, day) { s.sessions += day.focusSessions; s.minutes += day.focus; return s; }, { sessions: 0, minutes: 0 });

    return {
      range: { start: range[0], end: range[1], days: days.length },
      checkins: { doneDays: doneDays },
      activity: { activeDays: activeDays, activeDayCompletionRate: rateOf(activeDays, days.length) },
      study: study,
      focus: Object.assign(focus, { avgMinutes: focus.sessions > 0 ? Math.round((focus.minutes / focus.sessions) * 10) / 10 : 0 }),
      sports: days.reduce(function (s, day) { s.count += day.sports; s.minutes += day.sportMinutes; s.calories += day.calories; return s; }, { count: 0, minutes: 0, calories: 0 }),
      readings: days.reduce(function (s, day) { s.entries += day.readings; s.pages += day.readingPages; return s; }, { entries: 0, pages: 0 }),
      todos: Object.assign(todosSum, { pending: todosSum.total - todosSum.done, completionRate: rateOf(todosSum.done, todosSum.total) }),
      courses: { sessions: sch.sessions, distinctCourses: sch.distinctCourses }
    };
  },

  /* ---- 趋势 ---- */
  getTrend: function (metric, startDate, endDate, mode, data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    var range = normalizeRange(startDate, endDate);
    if (!range || !metric) return [];
    var key = String(metric).toLowerCase();
    var read = TREND_READERS[key];
    if (!read) return [];

    var days = fillRange(buildDayData(snap, range[0], range[1]), range[0], range[1]);
    // activity 指标：逐日活跃度需调用一次排课判断（默认只记录原始量，不含活跃度）
    if (key === 'activity') days.forEach(function (d) { d.activity = activityOf(d, courseOnDay(snap, d._date, snap.courses)); });
    var step = mode === 'weekly' ? 'weekly' : (mode === 'monthly' ? 'monthly' : 'daily');

    if (step === 'daily') {
      return days.map(function (day) { return { date: day._date, value: _num(read(day)) }; });
    }

    // 周 / 月桶：date 用桶起点（周一 / 当月 1 日），value 为桶内合计
    var buckets = {};
    var order = [];
    days.forEach(function (day) {
      var keyOfBucket = step === 'weekly' ? mondayOf(day._date) : day._date.slice(0, 7) + '-01';
      // 用「键曾否出现」去重，不能用 falsy——bucket 值累计到 0 时会被重复入列
      if (!(keyOfBucket in buckets)) { buckets[keyOfBucket] = 0; order.push(keyOfBucket); }
      buckets[keyOfBucket] += _num(read(day));
    });
    return order.map(function (b) { return { date: b, value: Math.round(buckets[b] * 100) / 100 }; });
  },

  /* ---- 完成率 ---- */
  getCompletionRate: function (scope, startDate, endDate, data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    if (scope === 'todo') {
      var range = normalizeRange(startDate, endDate);
      if (!range) return null;
      return todoStatsIn(snap.todos, range);
    }
    if (scope === 'course') {
      return courseLibrarySummary(snap.courses);
    }
    if (scope === 'active') {
      var r2 = normalizeRange(startDate, endDate);
      if (!r2) return null;
      var days = fillRange(buildDayData(snap, r2[0], r2[1]), r2[0], r2[1]);
      days.forEach(function (day) { day.activity = activityOf(day, courseOnDay(snap, day._date, snap.courses)); });
      var active = days.filter(function (day) { return day.activity > 0; }).length;
      return { activeDays: active, days: days.length, completionRate: rateOf(active, days.length) };
    }
    return null;
  },

  /* ---- 连续打卡 ---- */
  getStreaks: function (data, opts) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    var today = _today(opts);
    var dates = _arr(snap.checkins)
      .filter(function (c) { return c.status === 'done' || c.status === 'completed'; })
      .map(function (c) { return _str(c.date); })
      .filter(function (d) { return isValidDateStr(d) && d <= today; });
    var set = {};
    dates.forEach(function (d) { set[d] = 1; });
    var uniq = Object.keys(set).sort(); // 升序

    var longest = 0, cur = 0, prev = null;
    uniq.forEach(function (d) {
      cur = (prev && dayDiff(prev, d) === 1) ? cur + 1 : 1;
      if (cur > longest) longest = cur;
      prev = d;
    });

    // 当前连续：从最近一个已打卡日往回数；最近打卡日距今 >1 天则视为 0
    var last = uniq[uniq.length - 1] || null;
    var lastDiff = last ? dayDiff(last, today) : -1;
    var current = 0;
    if (last && lastDiff <= 1) {
      current = 1;
      for (var i = uniq.length - 2; i >= 0; i--) {
        if (dayDiff(uniq[i], uniq[i + 1]) === 1) current++;
        else break;
      }
    }

    return {
      currentStreak: current,
      longestStreak: longest,
      lastDate: last,
      todayDone: lastDiff === 0
    };
  },

  /* ---- 活跃度分布 ---- */
  getActivityDistribution: function (startDate, endDate, data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    var range = normalizeRange(startDate, endDate);
    if (!range) return [];
    var days = fillRange(buildDayData(snap, range[0], range[1]), range[0], range[1]);
    return days.map(function (day) {
      var onDay = courseOnDay(snap, day._date, snap.courses);
      return {
        date: day._date,
        score: activityOf(day, onDay),
        categories: {
          checkin: day.checkin > 0 ? 1 : 0,
          sports: day.sports > 0 ? 1 : 0,
          reading: day.readings > 0 ? 1 : 0,
          english: day.english > 0 ? 1 : 0,
          focus: day.focus > 0 ? 1 : 0,
          todo: day.todoDone > 0 ? 1 : 0,
          course: onDay ? 1 : 0
        }
      };
    });
  },

  /* ---- 全量活跃地图（热力图用） ---- */
  getActivityMap: function (data, opts) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    // 从数据实际最早日期开始扫（避免无意义空扫 20+ 年）
    var min = null;
    var today = (opts && opts.today) || todayStr();
    ['checkins', 'english', 'focus', 'sports', 'readings', 'todos'].forEach(function (key) {
      _arr(snap[key]).forEach(function (r) {
        var d = _str(r.date);
        if (isValidDateStr(d) && d <= today && (!min || d < min)) min = d;
      });
    });
    if (!min) return [];
    var range = normalizeRange(min, today);
    var days = fillRange(buildDayData(snap, min, today), min, today);
    var out = [];
    days.forEach(function (day) {
      var onDay = courseOnDay(snap, day._date, snap.courses);
      var act = activityOf(day, onDay);
      if (act > 0) out.push({ date: day._date, count: act });
    });
    return out;
  },

  /* ---- 分主题摘要（未来 AI 2.0 可直接序列化） ---- */
  getStudySummary: function (startDate, endDate, data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    var range = normalizeRange(startDate, endDate);
    if (!range) return null;
    var dayData = buildDayData(snap, range[0], range[1]);
    var days = fillRange(dayData, range[0], range[1]);
    return days.reduce(function (s, day) {
      s.englishMinutes += day.english;
      s.focusMinutes += day.focus;
      s.minutes += day.english + day.focus;
      s.words += day.words;
      s.readingPages += day.readingPages;
      return s;
    }, { englishMinutes: 0, focusMinutes: 0, minutes: 0, words: 0, readingPages: 0 });
  },
  getExerciseSummary: function (startDate, endDate, data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    var range = normalizeRange(startDate, endDate);
    if (!range) return null;
    var dayData = buildDayData(snap, range[0], range[1]);
    var days = fillRange(dayData, range[0], range[1]);
    var out = days.reduce(function (s, day) { s.count += day.sports; s.minutes += day.sportMinutes; s.calories += day.calories; return s; }, { count: 0, minutes: 0, calories: 0, types: {} });
    _arr(snap.sports).forEach(function (r) {
      var d = _str(r.date);
      if (!isValidDateStr(d) || d < range[0] || d > range[1]) return;
      var t = _str(r.type) || 'general';
      out.types[t] = (out.types[t] || 0) + 1;
    });
    return out;
  },
  getFocusSummary: function (startDate, endDate, data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    var range = normalizeRange(startDate, endDate);
    if (!range) return null;
    var dayData = buildDayData(snap, range[0], range[1]);
    var days = fillRange(dayData, range[0], range[1]);
    var s = days.reduce(function (acc, day) { acc.sessions += day.focusSessions; acc.minutes += day.focus; return acc; }, { sessions: 0, minutes: 0 });
    s.avgMinutes = s.sessions > 0 ? Math.round((s.minutes / s.sessions) * 10) / 10 : 0;
    return s;
  },
  getTodoSummary: function (startDate, endDate, data, today) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    var range = normalizeRange(startDate, endDate);
    if (!range) return null;
    return todoStatsIn(snap.todos, range, today);
  },
  getCourseSummary: function (data) {
    var snap = data && typeof data === 'object' ? data : snapshot();
    // 课程库概览（数量 / 完成 / 平均进度 / 学分 / 类型分布）
    var lib = courseLibrarySummary(snap.courses);
    // 今日 / 本周排课（复用 CourseSchedule，不重写周次）
    var today = todayStr();
    var week = semesterWeek(snap, today);
    var wd = dateWeekday(today);
    var days = CourseSchedule.getWeeklyCourses(snap.courses, week);
    var todayItems = (days && days[wd]) ? days[wd].items : [];
    lib.todayScheduleCount = todayItems.length;
    lib.weekly = scheduleStats(snap, windowThisWeek()[0], windowThisWeek()[1], snap.courses);
    return lib;
  }
};

/** 趋势读取器注册表（metric → 每日聚合读取） */
var TREND_READERS = {
  study: function (d) { return d.english + d.focus; },
  english: function (d) { return d.english; },
  focus: function (d) { return d.focus; },
  words: function (d) { return d.words; },
  checkin: function (d) { return d.checkin; },
  sports: function (d) { return d.sports; },
  exercise: function (d) { return d.sports; },
  exerciseMinutes: function (d) { return d.sportMinutes; },
  calories: function (d) { return d.calories; },
  reading: function (d) { return d.readings; },
  pages: function (d) { return d.readingPages; },
  todo: function (d) { return d.todoTotal; },
  todoDone: function (d) { return d.todoDone; },
  activity: function (d) { return d.activity; }
};

/** 月度趋势中的「学习分钟」专用（含 focus） */
function trendOfStudy(days) {
  return days.map(function (day) { return { date: day._date, value: day.english + day.focus }; });
}

globalThis.CGAnalytics = Analytics;

export default Analytics;
export { snapshot, isValidDateStr };