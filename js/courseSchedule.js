/**
 * Zeno · 课程编排层（Phase 9 课程系统 2.0）(ES Module)
 * --------------------------------------------------------------------------
 * 【职责】
 *   在既有「学习进度课程」记录之上，增加"上课编排"能力：
 *     - 归一化：把旧版/导入产生的各种课程形态统一成一种结构
 *     - 今日课程 / 本周课表：由「课程定义 + 当前周次」计算上课实例
 *     - 导入匹配：按 课程名+星期+节次 判定 新增/合并/重复，绝不静默覆盖
 *
 * 【设计原则】
 *   1. 课程定义（一份记录）与上课实例（某天某节要上的课）分离：
 *      一份课程记录通过 slots[]（每周上课时段）+ 周次 计算出每一天的实例，
 *      不为每天复制一份记录。
 *   2. weekday 全项目统一 0=周一 … 6=周日（见 js/utils/date.js）。
 *   3. 本模块是纯函数（不碰 Store），Data 层仅经 CGStore 读写。
 *
 * 【归一后的课程结构】
 *   {
 *     id, name,
 *     progress, status, totalChapters?, learnedChapters?,      ← 既有进度字段（保留）
 *     slots: [{ weekday:0-6, periods:[1,2], weeks:'1-16'|'单'|'', startTime?, endTime? }],
 *     teacher:'', classroom:'', credits:0, courseType:'', semester:'', notes:''
 *   }
 *
 * 【兼容旧数据】
 *   - 旧 progress 课程：无 slots → 视为"不上课排程"，进度照常显示。
 *   - 文本导入旧字段 `schedule`（slots 旧名）、`weeks`/`location` 课程级 → 归一进 slots。
 *   - 更早的 `time:"周一1-2节"` → best-effort 解析进 slots（不破坏其它字段）。
 * --------------------------------------------------------------------------
 */
'use strict';

import {
  weekdayName, weekdayCN, dateWeekday, dateOffset,
  weeksInfo, weeksContain, semesterWeekOf, periodTimeRange
} from './utils/date.js';

/* ===== 常量 ===== */

/** 单节/连堂统一后的节次上限 */
var MAX_PERIOD = 20;

/**
 * parseLegacyTime(timeStr) —— 解析旧字段 `"周一1-2节"` / `"周三 3,4节"` 这类字符串
 * 解析成功返回 { weekday, periods }（weekday 0-6）；失败返回 null。
 */
function parseLegacyTime(timeStr) {
  var s = String(timeStr || '').trim();
  if (!s) return null;
  var m = /(?:星期|礼拜|周)\s*(?:第)?\s*([一二三四五六日天\d])/.exec(s);
  if (!m) return null;
  var wd = weekdayCN(m[1]);
  if (isNaN(wd)) return null;
  var periods = [];
  var pm = /第?\s*([0-9一二三四五六七八九十]+(?:[-~,，、]|[-\s])\s*[0-9一二三四五六七八九十]+|[0-9一二三四五六七八九十]+)\s*(?:[大]?节)?/.exec(s.replace(/(?:星期|礼拜|周)\s*[一二三四五六日天\d]/g, ' '));
  if (!pm) return { weekday: wd, periods: [] };
  // 逐段展开数字/区间
  var seg = pm[1].replace(/[～~至]/g, '-').replace(/,/g, ',');
  var items = seg.split(/[,\s]+/);
  var nums = [];
  items.forEach(function (it) {
    it = it.replace(/[^0-9-/]/g, '');
    var r = it.split('-');
    var a = parseInt(r[0], 10) || 0;
    if (!a) return;
    var b = r.length > 1 ? (parseInt(r[1], 10) || a) : a;
    if (b < a) b = a;
    if (b - a > 15) b = a; // 防御异常区间
    for (var k = a; k <= b; k++) if (k >= 1 && k <= MAX_PERIOD && nums.indexOf(k) < 0) nums.push(k);
  });
  nums.sort(function (x, y) { return x - y; });
  return { weekday: wd, periods: nums };
}

/**
 * normalizeSlot(slot) —— 归一化单个上课时段
 * 保障 fields 数组总是存在且为 1~20 的升序去重数字数组。
 */
function normalizeSlot(slot) {
  slot = slot && typeof slot === 'object' ? slot : {};
  var wd = Number(slot.weekday);
  if (isNaN(wd) || wd < 0 || wd > 6) wd = -1;
  var periods = (Array.isArray(slot.periods) ? slot.periods : (slot.period ? [slot.period] : []))
    .map(function (p) { return Number(p); })
    .filter(function (p) { return p >= 1 && p <= MAX_PERIOD; });
  periods = Array.from(new Set(periods)).sort(function (a, b) { return a - b; });
  return {
    weekday: wd,
    periods: periods,
    weeks: slot.weeks != null ? String(slot.weeks) : '',
    startTime: slot.startTime != null ? String(slot.startTime) : '',
    endTime: slot.endTime != null ? String(slot.endTime) : ''
  };
}

/**
 * normalizeCourse(c) —— 归一化一条课程记录（读时进行，不写回 Store）
 * 兼容三种旧形态：旧 progress-only、`schedule` 字段（文本导入旧版）、
 * `time:"周一1-2节"`。返回一份归一化副本，绝不修改入参。
 */
function normalizeCourse(c) {
  c = c && typeof c === 'object' ? c : {};
  var out = Object.assign({}, c);
  out.name = String(out.name || '').trim();
  out.slots = Array.isArray(out.slots) ? out.slots.slice() : null;

  // 旧字段 `schedule`（文本导入旧版写的是 schedule，不是 slots）
  if ((!out.slots || !out.slots.length) && Array.isArray(c.schedule) && c.schedule.length) {
    out.slots = c.schedule.slice();
  }
  // 更早的 `time:"周一1-2节"`
  if ((!out.slots || !out.slots.length) && c.time) {
    var legacy = parseLegacyTime(c.time);
    if (legacy && legacy.weekday >= 0 && legacy.periods.length) {
      out.slots = [{
        weekday: legacy.weekday,
        periods: legacy.periods,
        weeks: out.weeks || ''
      }];
    }
  }

  out.slots = (out.slots || []).map(normalizeSlot);
  // 课程级 weeks/location（文本导入旧版写在课程级）落到每个无周次的 slot
  if (out.weeks || out.location) {
    out.slots = out.slots.map(function (s) {
      var ns = Object.assign({}, s);
      if (!ns.weeks && out.weeks) ns.weeks = out.weeks;
      return ns;
    });
  }
  out.weeks = out.weeks || '';
  out.location = out.location || '';

  // 进度相关默认值（既有行为）
  out.progress = Number(out.progress) || 0;
  out.status = out.status || 'todo';
  // 元数据默认值
  out.teacher = out.teacher || '';
  out.classroom = out.classroom || out.location || '';
  out.credits = Number(out.credits) || 0;
  out.courseType = out.courseType || '';
  out.semester = out.semester || '';
  out.notes = out.notes || '';
  return out;
}

/**
 * slotLabel(slot) —— 单个上课时段的显示文案
 * 如 '周一 第1,2节 1-16周'；periods 为空只显示星期。
 */
function slotLabel(slot) {
  var parts = [weekdayName(slot.weekday)];
  if (slot.periods && slot.periods.length) {
    parts.push('第' + slot.periods.join(',') + '节');
    var t = periodTimeRange(slot.periods[0], slot.periods[slot.periods.length - 1]);
    if (t) parts.push(t);
  }
  if (slot.weeks) parts.push(slot.weeks + '周');
  return parts.filter(Boolean).join(' ');
}

/**
 * courseTimeLabel(course) —— 课程的整体上课时间文案
 * 去重后的 slotLabel 用 '；' 连接。
 */
function courseTimeLabel(course) {
  var labels = [];
  (course.slots || []).forEach(function (s) {
    var l = slotLabel(s);
    if (l && labels.indexOf(l) < 0) labels.push(l);
  });
  return labels.join('；');
}

/**
 * courseOnDate(course, dateStr, week) —— 某课程在指定日期是否有课
 * 【匹配】日期星期 × 周次范围 × 节次均命中才返回上课实例 { course, slot }；
 * 课程没有任何 slots → 不参与课表（返回 null）。
 * week ≤ 0（未配置学期开始日）时不做周次过滤，保证首开也能看到今日课程。
 */
function courseOnDate(course, dateStr, week) {
  var c = normalizeCourse(course);
  if (!c.slots.length) return null;
  var wd = dateWeekday(dateStr);
  if (wd < 0) return null;
  var w = Number(week);
  for (var i = 0; i < c.slots.length; i++) {
    var s = c.slots[i];
    if (s.weekday !== wd) continue;
    if (w > 0 && !weeksContain(s.weeks, w)) continue;
    return { course: c, slot: s };
  }
  return null;
}

/**
 * getTodayCourses(courses, dateStr, week) —— 今天的课程
 * 按开始节次升序排序。
 * 【返回】[{ course, slot }]；无课程或没有上课排程 → []。
 */
function getTodayCourses(courses, dateStr, week) {
  if (!Array.isArray(courses)) return [];
  return courses
    .map(function (c) { return courseOnDate(c, dateStr, week); })
    .filter(Boolean)
    .sort(function (a, b) {
      var pa = a.slot.periods.length ? a.slot.periods[0] : 99;
      var pb = b.slot.periods.length ? b.slot.periods[0] : 99;
      return pa - pb;
    });
}

/**
 * getWeeklyCourses(courses, week) —— 本周课表（周一至周日）
 * 【返回】[{ weekday:0-6, items:[{ course, slot }] }]，每天按开始节次升序；
 * 该天没有课 → items 为空数组。week ≤ 0 时不按周次过滤。
 */
function getWeeklyCourses(courses, week) {
  var weekNum = Number(week) || 0;
  var days = [];
  for (var d = 0; d < 7; d++) days.push({ weekday: d, items: [] });
  if (!Array.isArray(courses)) return days;
  courses.forEach(function (raw) {
    var c = normalizeCourse(raw);
    if (!c.slots.length) return;
    c.slots.forEach(function (s) {
      if (s.weekday < 0 || s.weekday > 6) return;
      if (weekNum > 0 && !weeksContain(s.weeks, weekNum)) return;
      days[s.weekday].items.push({ course: c, slot: s });
    });
  });
  days.forEach(function (day) {
    day.items.sort(function (a, b) {
      var pa = a.slot.periods.length ? a.slot.periods[0] : 99;
      var pb = b.slot.periods.length ? b.slot.periods[0] : 99;
      return pa - pb;
    });
  });
  return days;
}

/* ===== 导入匹配（去重） ===== */

/**
 * normalizeNameKey(name) —— 名称匹配键（去空白，小写，去特殊符号）
 * '高等数学 ' 与 '高等数学' 视为同名。
 */
function normalizeNameKey(name) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * slotSignature(slot) —— 单个时段的签名（用于判定"同一堂时"）
 * 星期 + 节次区间起点：'0:1-2' 表示周一 1,2 节。
 */
function slotSignature(slot) {
  if (!slot || slot.weekday < 0 || slot.weekday > 6) return '';
  var periods = (slot.periods || []).slice().sort(function (a, b) { return a - b; });
  return slot.weekday + ':' + (periods[0] || '') + '-' + (periods[periods.length - 1] || '');
}

/**
 * slotsOverlap(a, b) —— 两个时段是否在"同一星期 + 节次有交集"
 */
function slotsOverlap(a, b) {
  if (!a || !b) return false;
  if (a.weekday !== b.weekday) return false;
  if (!(a.periods && a.periods.length) || !(b.periods && b.periods.length)) return false;
  return a.periods.some(function (p) { return b.periods.indexOf(p) >= 0; });
}

/**
 * planImport(candidates, existingCourses) —— 规划一批拟导入课程如何并入现有课程
 * 【判据（按优先级）】
 *   1. 同名 + 已有课程没有 slots（旧进度课程）→ attach：课程级补上课表
 *   2. 同名 + 时段有交集 → merge：合并缺失的字段/时段（绝不覆盖已有值）
 *   3. 同名 + 完全不同的时段 → new：当作另一门同名课程新增
 *   4. 不同名 → new
 * 【绝不静默覆盖手动编辑】merge 只补空字段；已有非空字段一律保留。
 *
 * 【返回】[{ candidate, action:'new'|'attach'|'merge'|'dup', target? }]
 *   - new    → 直接 addCourse
 *   - attach → updateCourse 填入 slots/teacher/classroom/weeks
 *   - merge  → updateCourse 合并 slots（去重）+ 补空字段
 *   - dup    → 完全重复（同名且所有时段已在目标中），跳过
 */
function planImport(candidates, existingCourses) {
  if (!Array.isArray(candidates)) return [];
  var existing = (existingCourses || []).map(normalizeCourse);
  return candidates.map(function (raw) {
    var c = normalizeCourse(raw);
    if (!c.name) return { candidate: c, action: 'skip' };

    var sameName = existing.filter(function (e) { return normalizeNameKey(e.name) === normalizeNameKey(c.name); });
    if (sameName.length === 0) return { candidate: c, action: 'new' };

    // 1. 同名进度课程（无 slots）→ 直接挂上课表（即便已填教师/教室，
    //    也只是补上课表，进度与已有元数据一律保留，不会「一课两名」）
    var slotless = sameName.find(function (e) {
      return !(e.slots && e.slots.length);
    });
    if (slotless) return { candidate: c, action: 'attach', target: slotless };

    // 2. 同名 + 时段交集 → merge / dup（完全重复不产生写入，避免无意义的 revision 递增）
    for (var i = 0; i < sameName.length; i++) {
      var e = sameName[i];
      var overlap = c.slots.some(function (cs) {
        return e.slots.some(function (es) { return slotsOverlap(cs, es); });
      });
      if (!overlap) continue;

      // dup 判定：候选的每一个时段（签名 + 周次完全一致）都已存在于目标，
      // 且没有任何「可补空字段」→ 纯重复，跳过（不写 Store、不 bump revision）。
      var allCovered = c.slots.length > 0 && c.slots.every(function (cs) {
        return e.slots.some(function (es) {
          return slotSignature(cs) === slotSignature(es) && normalizeSlot(es).weeks === normalizeSlot(cs).weeks;
        });
      });
      var fillable = [
        ['teacher', 'teacher'], ['classroom', 'classroom'], ['credits', 'credits'],
        ['courseType', 'courseType'], ['semester', 'semester'], ['notes', 'notes']
      ].some(function (pair) {
        return (e[pair[0]] === undefined || e[pair[0]] === '' || e[pair[0]] === 0) && c[pair[1]];
      });
      if (allCovered && !fillable) return { candidate: c, action: 'dup', target: e };
      return { candidate: c, action: 'merge', target: e };
    }

    // 3. 同名 + 无交集 → 新课程（同一门课的不同班级/时段）
    return { candidate: c, action: 'new' };
  });
}

/**
 * mergeIntoCourse(product, target) —— 把候选课程并入目标课程，返回合并 patch
 * 【规则】
 *   - slots：目标已有同签名/重叠的时段保留，追加新的并去重
 *   - 元数据：只补目标为空的字段（teacher/classroom/weeks/credits/courseType/semester）
 *   - 进度字段（progress/totalChapters/learnedChapters）绝不触碰
 */
function mergeIntoCourse(product, target) {
  var patch = {};
  // 合并 slots
  var mergedSlots = (target.slots || []).map(normalizeSlot);
  var sigs = {};
  mergedSlots.forEach(function (s) { sigs[slotSignature(s)] = true; });
  (product.slots || []).forEach(function (s) {
    var sig = slotSignature(s);
    var dup = sigs[sig];
    var overlap = mergedSlots.some(function (es) { return slotsOverlap(normalizeSlot(s), es); });
    if (!dup && !overlap) {
      mergedSlots.push(normalizeSlot(s));
      sigs[sig] = true;
    }
  });
  // 相等性判断在共同归一化后做（避免空白 weeks/startTime 造成「伪差异」）
  var baseNorm = (target.slots || []).map(normalizeSlot);
  if (JSON.stringify(mergedSlots) !== JSON.stringify(baseNorm)) patch.slots = mergedSlots;

  // 补空字段
  [['teacher', 'teacher'], ['classroom', 'classroom'], ['credits', 'credits'],
   ['courseType', 'courseType'], ['semester', 'semester'], ['notes', 'notes']].forEach(function (pair) {
    if ((target[pair[0]] === undefined || target[pair[0]] === '' || target[pair[0]] === 0) && product[pair[1]]) {
      patch[pair[0]] = product[pair[1]];
    }
  });
  if (target.location !== product.location && product.location) patch.location = product.location;
  return patch;
}

/* ===== 导出 ===== */

var CourseSchedule = {
  normalizeCourse: normalizeCourse,
  normalizeSlot: normalizeSlot,
  parseLegacyTime: parseLegacyTime,
  slotLabel: slotLabel,
  courseTimeLabel: courseTimeLabel,
  courseOnDate: courseOnDate,
  getTodayCourses: getTodayCourses,
  getWeeklyCourses: getWeeklyCourses,
  planImport: planImport,
  mergeIntoCourse: mergeIntoCourse,
  normalizeNameKey: normalizeNameKey,
  slotSignature: slotSignature,
  slotsOverlap: slotsOverlap
};

globalThis.CGCourseSchedule = CourseSchedule;

export default CourseSchedule;
export {
  normalizeCourse, slotLabel, courseTimeLabel, courseOnDate,
  getTodayCourses, getWeeklyCourses, planImport, mergeIntoCourse
};
