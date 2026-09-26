/**
 * Zeno · Phase 9 课程系统 2.0 测试
 * ============================================================
 * 覆盖：
 *   1. 周次系统（js/utils/date.js）：semesterWeekOf / weeksContain / weekdayCN /
 *      dateWeekday / periodTimeRange / dateOffset
 *   2. 课程编排（js/courseSchedule.js）：normalizeCourse（含旧数据兼容）/
 *      getTodayCourses / getWeeklyCourses / planImport（去重匹配）/
 *      mergeIntoCourse（补空不覆盖）
 *   3. 配置与同步兼容：setSemester revision 恰 +1；user.semesterStart 能穿越
 *      mergeState（Phase 8 防线式合并），不会破坏 revision/墓碑。
 * 运行：npm test（Vitest，jsdom 环境）
 */
import { describe, test, expect, beforeEach } from 'vitest';
import CGStore from '../js/store.js';
import CGCourseSchedule from '../js/courseSchedule.js';
import * as CGDate from '../js/utils/date.js';
import CGSync from '../js/sync.js';

// 每个测试前重置本地存储与内存缓存，避免相互污染
beforeEach(() => {
  localStorage.clear();
  CGStore.resetData();
  CGStore.clearDirtyCategories();
});

/* ====================================================================
 * 1. 周次系统（js/utils/date.js）
 * ==================================================================== */

describe('周次系统：semesterWeekOf', () => {
  test('学期第 1 周周一 = 第 1 周，第 2 周周一 = 第 2 周', () => {
    const start = '2026-09-07'; // 周一
    expect(CGDate.semesterWeekOf('2026-09-07', start)).toBe(1);
    expect(CGDate.semesterWeekOf('2026-09-13', start)).toBe(1); // 周日仍第 1 周
    expect(CGDate.semesterWeekOf('2026-09-14', start)).toBe(2);
    expect(CGDate.semesterWeekOf('2026-11-09', start)).toBe(10);
  });

  test('未配置开始日 / 早于开始日 / 非法日期 → 0', () => {
    expect(CGDate.semesterWeekOf('2026-09-14', '')).toBe(0);
    expect(CGDate.semesterWeekOf('2026-09-06', '2026-09-07')).toBe(0);
    expect(CGDate.semesterWeekOf('not-a-date', '2026-09-07')).toBe(0);
    expect(CGDate.semesterWeekOf('2026-09-14', 'bad-date')).toBe(0);
  });
});

describe('周次系统：weeksContain', () => {
  test('空字符串 = 每周都上', () => {
    expect(CGDate.weeksContain('', 1)).toBe(true);
    expect(CGDate.weeksContain('  ', 8)).toBe(true);
    expect(CGDate.weeksContain(undefined, 3)).toBe(true);
  });

  test('区间写法 1-16', () => {
    expect(CGDate.weeksContain('1-16', 1)).toBe(true);
    expect(CGDate.weeksContain('1-16', 16)).toBe(true);
    expect(CGDate.weeksContain('1-16', 17)).toBe(false);
  });

  test('带「周」字后缀与波浪线', () => {
    expect(CGDate.weeksContain('1-16周', 12)).toBe(true);
    expect(CGDate.weeksContain('1~16周', 12)).toBe(true);
    expect(CGDate.weeksContain('1-16周', 20)).toBe(false);
  });

  test('逗号列表 1,3,5', () => {
    expect(CGDate.weeksContain('1,3,5,7', 1)).toBe(true);
    expect(CGDate.weeksContain('1,3,5,7', 4)).toBe(false);
  });

  test('多个区间 1-8,10-16', () => {
    expect(CGDate.weeksContain('1-8,10-16', 10)).toBe(true);
    expect(CGDate.weeksContain('1-8,10-16', 9)).toBe(false);
  });

  test('单双周', () => {
    expect(CGDate.weeksContain('单', 1)).toBe(true);
    expect(CGDate.weeksContain('单', 2)).toBe(false);
    expect(CGDate.weeksContain('双', 2)).toBe(true);
    expect(CGDate.weeksContain('双', 3)).toBe(false);
    expect(CGDate.weeksContain('单周', 5)).toBe(true);
    expect(CGDate.weeksContain('双周', 6)).toBe(true);
  });

  test('单双限定区间 1-16(单) 与 1-16周(双)', () => {
    expect(CGDate.weeksContain('1-16(单)', 3)).toBe(true);
    expect(CGDate.weeksContain('1-16(单)', 4)).toBe(false);
    expect(CGDate.weeksContain('1-16周(双)', 4)).toBe(true);
    expect(CGDate.weeksContain('1-16周(双)', 3)).toBe(false);
  });

  test('全角数字与全角区间符', () => {
    expect(CGDate.weeksContain('１－１６周', 8)).toBe(true);
    expect(CGDate.weeksContain('1到16周', 8)).toBe(true);
  });
});

describe('周次系统：weekday 与节次', () => {
  test('dateWeekday：0=周一 … 6=周日', () => {
    expect(CGDate.dateWeekday('2026-09-07')).toBe(0); // 周一
    expect(CGDate.dateWeekday('2026-09-13')).toBe(6); // 周日
    expect(CGDate.dateWeekday('bad')).toBe(-1);
  });

  test('weekdayName / weekdayCN 往返', () => {
    expect(CGDate.weekdayName(0)).toBe('周一');
    expect(CGDate.weekdayName(6)).toBe('周日');
    expect(CGDate.weekdayName(7)).toBe('');
    expect(CGDate.weekdayCN('一')).toBe(0);
    expect(CGDate.weekdayCN('日')).toBe(6);
    expect(CGDate.weekdayCN('天')).toBe(6);
    expect(CGDate.weekdayCN('3')).toBe(2); // 数字按「数字-1」解释
    expect(CGDate.weekdayCN('X')).toBeNaN();
  });

  test('dateOffset 跨月进位', () => {
    expect(CGDate.dateOffset('2026-09-30', 1)).toBe('2026-10-01');
    expect(CGDate.dateOffset('2026-09-07', -1)).toBe('2026-09-06');
  });

  test('periodTimeRange 显示第 3-4 节', () => {
    expect(CGDate.periodTimeRange(3, 4)).toBe('10:00–11:35');
    expect(CGDate.periodTimeRange(1)).toBe('08:00–08:45');
    expect(CGDate.periodTimeRange(99)).toBe('');
  });
});

/* ====================================================================
 * 2. 课程编排（js/courseSchedule.js）
 * ==================================================================== */

describe('normalizeCourse：旧数据兼容与默认值', () => {
  test('旧进度课程无 slots → 空 slots，进度字段保留', () => {
    const c = CGCourseSchedule.normalizeCourse({ id: 'x', name: '高数', progress: 40, status: 'doing' });
    expect(c.name).toBe('高数');
    expect(c.slots).toEqual([]);
    expect(c.progress).toBe(40);
    expect(c.classroom).toBe('');
  });

  test('旧字段 time:"周一1-2节" → 解析进 slots', () => {
    const c = CGCourseSchedule.normalizeCourse({ name: '英语', time: '周一1-2节' });
    expect(c.slots).toHaveLength(1);
    expect(c.slots[0].weekday).toBe(0);
    expect(c.slots[0].periods).toEqual([1, 2]);
  });

  test('旧字段 schedule（文本导入旧版）→ 归一进 slots', () => {
    const c = CGCourseSchedule.normalizeCourse({
      name: '数据结构',
      schedule: [{ weekday: 3, periods: [3, 4], weeks: '1-16' }]
    });
    expect(c.slots).toHaveLength(1);
    expect(c.slots[0].weekday).toBe(3);
    expect(c.slots[0].weeks).toBe('1-16');
  });

  test('课程级 weeks/location 落到无周次的 slot', () => {
    const c = CGCourseSchedule.normalizeCourse({
      name: '体育', slots: [{ weekday: 2, periods: [9, 10] }], weeks: '1-16', location: '体育馆'
    });
    expect(c.slots[0].weeks).toBe('1-16');
    expect(c.classroom).toBe('体育馆');
  });

  test('节次越界 / 非法星期被过滤', () => {
    const c = CGCourseSchedule.normalizeCourse({
      name: 'X', slots: [{ weekday: 9, periods: [0, 1, 2, 99] }]
    });
    expect(c.slots).toHaveLength(1);
    expect(c.slots[0].weekday).toBe(-1); // 非法星期保留 -1，编排时跳过
    expect(c.slots[0].periods).toEqual([1, 2]);
  });

  test('normalize 不修改入参', () => {
    const raw = { name: 'A', time: '周三3,4节' };
    CGCourseSchedule.normalizeCourse(raw);
    expect(raw.slots).toBeUndefined();
    expect(raw.time).toBe('周三3,4节');
  });
});

describe('getTodayCourses：今日课程', () => {
  const courses = [
    { name: '体育', slots: [{ weekday: 2, periods: [9, 10] }] },
    { name: '高数', slots: [{ weekday: 0, periods: [1, 2], weeks: '1-16' }] },
    { name: '英语', slots: [{ weekday: 0, periods: [5, 6], weeks: '1-16' }] },
    { name: '仅进度', progress: 30, status: 'doing' }, // 无排课不参与
  ];

  test('按节次升序、只返回匹配星期与周次', () => {
    const hits = CGCourseSchedule.getTodayCourses(courses, '2026-09-07', 5); // 周一，第 5 周
    expect(hits.map((h) => h.course.name)).toEqual(['高数', '英语']); // 1,2 节在前
    expect(hits[0].slot.periods).toEqual([1, 2]);
  });

  test('周次不匹配 → 不返回该课', () => {
    const hits = CGCourseSchedule.getTodayCourses(courses, '2026-09-07', 20); // 第 20 周已过 1-16
    expect(hits.some((h) => h.course.name === '高数')).toBe(false);
  });

  test('week ≤ 0（未配置学期）→ 不按周次过滤，仍显示今日课程', () => {
    const hits = CGCourseSchedule.getTodayCourses(courses, '2026-09-07', 0);
    expect(hits.map((h) => h.course.name)).toEqual(['高数', '英语']);
  });

  test('无课程 → []', () => {
    expect(CGCourseSchedule.getTodayCourses([], '2026-09-07', 1)).toEqual([]);
  });

  test('单周课在双周不出现', () => {
    const odd = [{ name: '双周课', slots: [{ weekday: 0, periods: [3], weeks: '单' }] }];
    expect(CGCourseSchedule.getTodayCourses(odd, '2026-09-07', 1)).toHaveLength(1);
    expect(CGCourseSchedule.getTodayCourses(odd, '2026-09-07', 2)).toHaveLength(0);
  });
});

describe('getWeeklyCourses：本周课表', () => {
  test('返回周一至周日 7 天，每天按节次升序', () => {
    const courses = [
      { name: '高数', slots: [{ weekday: 0, periods: [3, 4], weeks: '1-16' }] },
      { name: '体育', slots: [{ weekday: 0, periods: [1, 2], weeks: '1-16' }] },
      { name: '英语', slots: [{ weekday: 2, periods: [5, 6], weeks: '' }] },
    ];
    const days = CGCourseSchedule.getWeeklyCourses(courses, 3);
    expect(days).toHaveLength(7);
    expect(days[0].weekday).toBe(0);
    expect(days[0].items.map((h) => h.course.name)).toEqual(['体育', '高数']); // 1,2 节在前
    expect(days[2].items.map((h) => h.course.name)).toEqual(['英语']);
    expect(days[1].items).toEqual([]);
  });

  test('多时段课程展开到对应星期', () => {
    const c = [{ name: '实验', slots: [{ weekday: 1, periods: [7] }, { weekday: 4, periods: [7] }] }];
    const days = CGCourseSchedule.getWeeklyCourses(c, 4);
    expect(days[1].items).toHaveLength(1);
    expect(days[4].items).toHaveLength(1);
  });

  test('课程级 weeks 旧形态：非覆盖周返回空', () => {
    const legacy = [{
      name: '英语', slots: [{ weekday: 2, periods: [3] }], weeks: '1-8'
    }];
    const inWeek = CGCourseSchedule.getWeeklyCourses(legacy, 5);
    expect(inWeek[2].items).toHaveLength(1);
    const outWeek = CGCourseSchedule.getWeeklyCourses(legacy, 12);
    expect(outWeek[2].items).toHaveLength(0);
  });
});

describe('planImport：多字段去重匹配', () => {
  const existing = [
    { id: 'e1', name: '高数', progress: 60, status: 'doing' },                          // 旧进度课程（无 slots）
    { id: 'e2', name: '大学英语', progress: 10, status: 'doing', slots: [{ weekday: 2, periods: [3, 4], weeks: '1-16' }] }, // 已有课表
    { id: 'e3', name: '线性代数', progress: 0, status: 'todo', slots: [{ weekday: 0, periods: [5, 6] }] },
  ];

  test('同名 + 旧进度课程（无 slots）→ attach 挂上课表', () => {
    const plan = CGCourseSchedule.planImport(
      [{ name: '高数', slots: [{ weekday: 0, periods: [1, 2], weeks: '1-16' }] }],
      existing
    );
    expect(plan[0].action).toBe('attach');
    expect(plan[0].target.id).toBe('e1');
  });

  test('同名 + 时段完全一致（签名+周次）且无可补字段 → dup 跳过', () => {
    const plan = CGCourseSchedule.planImport(
      [{ name: '大学英语', slots: [{ weekday: 2, periods: [3, 4], weeks: '1-16' }] }],
      existing
    );
    expect(plan[0].action).toBe('dup');
    expect(plan[0].target.id).toBe('e2');
  });

  test('同名 + 时段重叠但有待补字段 → merge（补空不覆盖）', () => {
    const plan = CGCourseSchedule.planImport(
      [{ name: '大学英语', slots: [{ weekday: 2, periods: [3, 4], weeks: '1-16' }], classroom: '教四302' }],
      existing
    );
    expect(plan[0].action).toBe('merge');
    expect(plan[0].target.id).toBe('e2');
  });

  test('同名 + 旧进度课程（无 slots）即便带教师 → attach（不一课两名）', () => {
    const existingWithMeta = [
      { id: 'e9', name: '数据结构', progress: 30, status: 'doing', teacher: '钱老师' },
      ...existing
    ];
    const plan = CGCourseSchedule.planImport(
      [{ name: '数据结构', slots: [{ weekday: 1, periods: [3, 4], weeks: '1-16' }] }],
      existingWithMeta
    );
    const hit = plan[0];
    expect(hit.action).toBe('attach');
    expect(hit.target.id).toBe('e9');
  });

  test('同名 + 时段完全不同 → new（同一门课的不同班级/时段）', () => {
    const plan = CGCourseSchedule.planImport(
      [{ name: '线性代数', slots: [{ weekday: 4, periods: [3, 4] }] }],
      existing
    );
    expect(plan[0].action).toBe('new');
  });

  test('不同名 → new', () => {
    const plan = CGCourseSchedule.planImport(
      [{ name: '数据分析', slots: [] }],
      existing
    );
    expect(plan[0].action).toBe('new');
  });

  test('空名 → skip', () => {
    const plan = CGCourseSchedule.planImport([{ name: '   ', slots: [] }], existing);
    expect(plan[0].action).toBe('skip');
  });
});

describe('mergeIntoCourse：补空不覆盖', () => {
  test('只补空字段与缺失时段，绝不触碰进度', () => {
    const product = {
      name: '大学英语',
      slots: [{ weekday: 2, periods: [3, 4], weeks: '1-16' }, { weekday: 4, periods: [1, 2] }],
      teacher: '李四', classroom: '教四302'
    };
    const target = {
      id: 't1', name: '大学英语', progress: 42, status: 'doing',
      slots: [{ weekday: 2, periods: [3, 4], weeks: '1-8' }],
      teacher: '王五' // 已有教师，不能被导入覆盖
    };
    const patch = CGCourseSchedule.mergeIntoCourse(product, target);
    expect(patch.teacher).toBeUndefined();            // 已有教师 → 不覆盖
    expect(patch.progress).toBeUndefined();           // 进度绝不写入
    // 已有时段保留，新增周四时段
    expect(patch.slots).toBeDefined();
    expect(patch.slots.map((s) => s.weekday + ':' + s.periods.join(','))).toEqual(['2:3,4', '4:1,2']);
    expect(patch.classroom).toBe('教四302');          // 教室为空 → 可补
  });

  test('完全一致 → 空 patch（不产生无谓写入）', () => {
    const product = { name: '高数', slots: [{ weekday: 0, periods: [1, 2] }], classroom: 'A101' };
    const target = { id: 't', name: '高数', progress: 0, slots: [{ weekday: 0, periods: [1, 2] }], classroom: 'A101' };
    const patch = CGCourseSchedule.mergeIntoCourse(product, target);
    expect(Object.keys(patch)).not.toContain('slots');
    expect(patch.classroom).toBeUndefined();
  });
});

/* ====================================================================
 * 3. Store 学期配置 + 同步兼容（Phase 8 不变量）
 * ==================================================================== */

describe('Store.setSemester：revision 恰 +1', () => {
  test('setSemester 一次写 revision 只 +1', () => {
    expect(CGStore.getRevision()).toBe(0);
    const r = CGStore.setSemester({ semesterStart: '2026-09-07' });
    expect(r.semesterStart).toBe('2026-09-07');
    expect(CGStore.getRevision()).toBe(1);            // 不能 +2
    CGStore.setSemester({ currentWeek: 3 });
    expect(CGStore.getRevision()).toBe(2);
    expect(CGStore.getSemester().currentWeek).toBe(3);
  });

  test('semesterStart 存进 user，跨 导出/恢复 往返', () => {
    CGStore.setSemester({ semesterStart: '2026-09-07', currentWeek: 5 });
    expect(CGStore.getUser().semesterStart).toBe('2026-09-07');
    const json = JSON.stringify(CGStore.get());
    CGStore.resetData();
    CGStore.set(JSON.parse(json));
    expect(CGStore.getSemester().semesterStart).toBe('2026-09-07');
    expect(CGStore.getSemester().currentWeek).toBe(5);
  });
});

describe('同步兼容：user 配置穿过 mergeState', () => {
  test('本地配置在 409 防线式合并后保留', () => {
    CGStore.setSemester({ semesterStart: '2026-09-07' });
    CGStore.addCourse({ name: '本地课' });
    const local = CGStore.get();
    const remote = {
      user: { name: '云' },
      courses: [{ id: 'r', name: '云课', progress: 0 }],
      checkins: [], sports: [], readings: [], english: [], todos: [], focus: [],
    };
    const merged = CGSync.mergeState(local, remote, {});
    expect(merged.user.semesterStart).toBe('2026-09-07'); // 本地字段保留
    expect(merged.courses.some((c) => c.name === '本地课')).toBe(true); // 本地课程保留
    expect(merged.courses.some((c) => c.name === '云课')).toBe(true); // 云端课程不丢
  });

  test('REMOTE 采纳不 bump；之后一次本机写才 +1', () => {
    CGStore.set(
      { user: { name: '云', semesterStart: '2026-09-07' }, courses: [] },
      { kind: 'REMOTE', revision: 9, deviceId: 'srv' }
    );
    expect(CGStore.getRevision()).toBe(9);
    expect(CGStore.getSemester().semesterStart).toBe('2026-09-07');
    const c = CGStore.addCourse({ name: '新课' });
    expect(CGStore.getRevision()).toBe(10);
    expect(CGStore.getTombstones('courses')).not.toContain(c.id);
  });
});
