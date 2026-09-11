/**
 * Phase 10 · Unified Analytics Engine —— 单元测试
 * 覆盖：Daily / Weekly / Monthly / Completion / Streak / Trend /
 *       分主题摘要 / Defensive / 不变量（不修改数据、revision 不变）。
 */
import { test, expect } from 'vitest';
import Analytics from '../js/analytics.js';

/** 标准测试数据（围绕 2026-09-07 周一开学的学期） */
function fixture() {
  return {
    user: { name: '测', semesterStart: '2026-09-07' },
    checkins: [
      { id: 'a1', date: '2026-09-08', status: 'done' },
      { id: 'a2', date: '2026-09-09', status: 'done' },
      { id: 'a3', date: '2026-09-10', status: 'done' },
      { id: 'a4', date: '2026-09-11', status: 'done' },
      { id: 'a5', date: '2026-09-12', status: 'done' }, // 未来（>今日）不应计入 streak
      { id: 'a6', date: '2026-09-13', status: 'done' }
    ],
    english: [
      { id: 'e1', date: '2026-09-10', words: 50, minutes: 30 },
      { id: 'e2', date: '2026-09-10', words: 20, minutes: 15 } // 同日多条应合计
    ],
    focus: [
      { id: 'f1', date: '2026-09-10', minutes: 25 },
      { id: 'f2', date: '2026-09-11', minutes: 45 },
      { id: 'f3', date: '2026-09-12', minutes: 50 }
    ],
    sports: [
      { id: 's1', date: '2026-09-10', name: '跑步', calories: 200, duration: 30, type: 'run' }
    ],
    readings: [
      { id: 'r1', date: '2026-09-11', bookName: '书A', pages: 50, totalPages: 300 }
    ],
    todos: [
      { id: 't1', date: '2026-09-10', text: '复习', done: true },
      { id: 't2', date: '2026-09-10', text: '练字', done: false },
      { id: 't3', date: '2026-09-09', text: '早睡', done: true },
      { id: 't4', date: '2026-09-05', text: '过期未做', done: false } // 相对今日已过期
    ],
    courses: [
      { id: 'c1', name: '高数', progress: 40, status: 'doing', credits: 4, courseType: '必修', slots: [{ weekday: 0, periods: [1, 2], weeks: '1-16' }] }, // 周一
      { id: 'c2', name: '线代', progress: 100, status: 'done', credits: 3, courseType: '必修', slots: [{ weekday: 1, periods: [3, 4], weeks: '1-16' }] },  // 周二
      { id: 'c3', name: '英语', progress: 0, status: 'todo', credits: 2, courseType: '选修', slots: [{ weekday: 3, periods: [5, 6], weeks: '1-16' }] }   // 周四
    ]
  };
}

const TODAY = '2026-09-11';

/* ==================== Daily ==================== */

test('Daily：空数据 → 全零且不抛错', () => {
  const d = Analytics.getDailySummary('2026-09-11', { user: {}, checkins: [], english: [], focus: [], sports: [], readings: [], todos: [], courses: [] });
  expect(d.checkin.done).toBe(false);
  expect(d.study.minutes).toBe(0);
  expect(d.todos.total).toBe(0);
  expect(d.courses.scheduled).toBe(0);
  expect(d.activity.score).toBe(0);
});

test('Daily：单日多类型数据聚合', () => {
  const d = Analytics.getDailySummary('2026-09-10', fixture());
  expect(d.checkin.done).toBe(true);
  // 英语 30+15=45，专注 25 → 学习 70
  expect(d.study.englishMinutes).toBe(45);
  expect(d.study.focusMinutes).toBe(25);
  expect(d.study.minutes).toBe(70);
  expect(d.study.words).toBe(70);
  expect(d.sports.count).toBe(1);
  expect(d.sports.durationMinutes).toBe(30);
  expect(d.sports.calories).toBe(200);
  // Todo：t1 done / t2 pending
  expect(d.todos.total).toBe(2);
  expect(d.todos.done).toBe(1);
  expect(d.todos.pending).toBe(1);
  expect(d.todos.completionRate).toBe(50);
  // 课程：09-10 周四 → c3 有课
  expect(d.courses.scheduled).toBe(1);
  expect(d.courses.onDay).toBe(true);
  // 活跃度：打卡/运动/英语/专注/todo/课程 = 6 类
  expect(d.activity.score).toBe(6);
});

test('Daily：坏日期返回 null', () => {
  expect(Analytics.getDailySummary('not-a-date', fixture())).toBeNull();
  expect(Analytics.getDailySummary('', fixture())).toBeNull();
});

/* ==================== Weekly ==================== */

test('Weekly：本周（周一 09-07 ~ 周日 09-13）聚合', () => {
  const w = Analytics.getWeeklySummary({ date: '2026-09-10' }, fixture());
  expect(w.range.start).toBe('2026-09-07');
  expect(w.range.end).toBe('2026-09-13');
  expect(w.checkins.doneDays).toBe(6); // 08~13 六天打卡
  expect(w.study.minutes).toBe(165);   // english45 + focus120
  expect(w.study.englishMinutes).toBe(45);
  expect(w.study.focusMinutes).toBe(120);
  expect(w.focus.sessions).toBe(3);
  expect(w.focus.avgMinutes).toBe(40);
  // todo：t1/t2/t3 在周内，t4 在 09-05 不在
  expect(w.todos.total).toBe(3);
  expect(w.todos.done).toBe(2);
  expect(w.todos.completionRate).toBeCloseTo(66.7, 0);
  expect(w.sports.count).toBe(1);
  expect(w.sports.calories).toBe(200);
  expect(w.readings.entries).toBe(1);
  expect(w.readings.pages).toBe(50);
  expect(w.courses.sessions).toBe(3);     // 周一高数+周二线代+周四英语
  expect(w.courses.distinctCourses).toBe(3);
  expect(w.activity.activeDays).toBe(7);
  expect(w.completion.activeDayCompletionRate).toBe(100);
});

test('Weekly：周界（周日、周一）取同一周', () => {
  const mon = Analytics.getWeeklySummary({ date: '2026-09-07' }, fixture());
  const sun = Analytics.getWeeklySummary({ date: '2026-09-13' }, fixture());
  const mid = Analytics.getWeeklySummary({ date: '2026-09-10' }, fixture());
  expect(mon.range.start).toBe(mid.range.start);
  expect(sun.range.start).toBe(mid.range.start);
});

test('Weekly：跨月（月末周一）', () => {
  // 2026-08-31 是周一 → 本周 08-31~09-06
  const w = Analytics.getWeeklySummary({ date: '2026-08-31' }, fixture());
  expect(w.range.start).toBe('2026-08-31');
  expect(w.range.end).toBe('2026-09-06');
});

/* ==================== Monthly ==================== */

test('Monthly：2026-09 聚合', () => {
  const m = Analytics.getMonthlySummary(2026, 9, fixture());
  expect(m.range.start).toBe('2026-09-01');
  expect(m.range.end).toBe('2026-09-30');
  expect(m.checkins.doneDays).toBe(6);
  expect(m.study.minutes).toBe(165);
  expect(m.study.englishMinutes).toBe(45);
  expect(m.todos.total).toBe(4);       // 含 09-05 的 t4
  expect(m.todos.done).toBe(2);        // t1 + t3
  expect(m.todos.completionRate).toBe(50);
  expect(m.courses.library.count).toBe(3);
  expect(m.courses.library.done).toBe(1);
  expect(m.courses.library.pending).toBe(2);
  expect(m.courses.library.avgProgress).toBe(47); // (40+100+0)/3 → 46.67 → 47
  expect(m.courses.library.totalCredits).toBe(9);
  expect(m.trends.study.length).toBe(30);
  expect(m.trends.study.reduce((s, t) => s + t.value, 0)).toBe(165);
});

test('Monthly：2 月天数与跨年（2026-02 平年28天）', () => {
  const f = { user: {}, checkins: [], english: [{ date: '2026-02-28', minutes: 10 }], focus: [], sports: [], readings: [], todos: [], courses: [] };
  const m = Analytics.getMonthlySummary(2026, 2, f);
  expect(m.range.end).toBe('2026-02-28');
  expect(m.trends.study.length).toBe(28);
});

test('Monthly：跨年（2025-12-31 才打卡）', () => {
  const f = { user: {}, checkins: [{ date: '2025-12-31', status: 'done' }], english: [], focus: [], sports: [], readings: [], todos: [], courses: [] };
  const m = Analytics.getMonthlySummary(2025, 12, f);
  expect(m.checkins.doneDays).toBe(1);
  expect(m.range.end).toBe('2025-12-31');
});

test('Monthly：非法月份返回 null', () => {
  expect(Analytics.getMonthlySummary(2026, 13, fixture())).toBeNull();
});

test('CourseSessions：跨周次范围按「每天所在周」计（Review M1 回归）', () => {
  // 课程 weeks=1-16，学期 09-07(第1周)。12 月第 17 周(12-28 起)不再排课。
  // 逐日核算：12 月周一 3(28 为 17 周不计) + 周二 4 + 周四 4 = 11；
  // 区间 12-07..12-31：周一 3 + 周二 3 + 周四 3 = 9。
  // （旧实现整月用起点周次 → 会把第 17 周日期也计进 sessions，造成虚增 3）
  const dec = Analytics.getMonthlySummary(2026, 12, fixture());
  expect(dec.courses.sessions).toBe(11);
  const r = Analytics.getDateRangeSummary('2026-12-07', '2026-12-31', fixture());
  expect(r.courses.sessions).toBe(9);
});

for (const mode of ['daily', 'weekly']) {
  test(`Trend('activity', ${mode})：按活跃类别数统计（Review M4 回归）`, () => {
    if (mode === 'daily') {
      const t = Analytics.getTrend('activity', '2026-09-10', '2026-09-10', mode, fixture());
      expect(t).toEqual([{ date: '2026-09-10', value: 6 }]);
    } else {
      // 逐日活跃度合计：(09-07:课)1 + (09-08:卡+课)2 + (09-09:卡+完成todo)2 +
      // 6 + (09-11)3 + (09-12)2 + (09-13)1 = 17
      const t = Analytics.getTrend('activity', '2026-09-07', '2026-09-13', mode, fixture());
      expect(t).toEqual([{ date: '2026-09-07', value: 17 }]);
    }
  });
}

test('Defensive：坏日期不会污染范围运算（H1 页侧源头）', () => {
  // 数据里带一条非 YYYY-MM-DD 的日期且字典序小于今天：范围型摘要须正常返回非 null
  const dirty = fixture();
  dirty.checkins.push({ date: '2026-9-1', status: 'done' }); // 坏格式，字典序 < '2026-09-...'
  dirty.english.push({ date: '2026-02-30', minutes: 99 });   // 不存在的一天
  const s = Analytics.getStudySummary('2026-09-01', '2026-09-11', dirty);
  expect(s).not.toBeNull();
  expect(s.minutes).toBe(115); // 45 英语 + 70 专注(25+45)，坏记录不影响合法聚合
  const r = Analytics.getDateRangeSummary('2026-09-01', '2026-09-11', dirty);
  expect(r).not.toBeNull();
});

/* ==================== DateRange ==================== */

test('DateRange：闭区间聚合 09-08~09-11', () => {
  const r = Analytics.getDateRangeSummary('2026-09-08', '2026-09-11', fixture());
  expect(r.range.days).toBe(4);
  expect(r.checkins.doneDays).toBe(4);
  expect(r.study.minutes).toBe(115); // 英语45 + 专注(25+45)
  expect(r.todos.total).toBe(3);     // t1/t2/t3
  expect(r.todos.completionRate).toBeCloseTo(66.7, 0);
  expect(r.courses.sessions).toBe(2); // 周二线代 + 周四英语
});

test('DateRange：乱序起止自动顺位', () => {
  const r = Analytics.getDateRangeSummary('2026-09-11', '2026-09-08', fixture());
  expect(r.range.start).toBe('2026-09-08');
  expect(r.range.days).toBe(4);
});

/* ==================== Completion ==================== */

test('Completion：todo 0/0 → rate 0', () => {
  const f = { user: {}, checkins: [], english: [], focus: [], sports: [], readings: [], todos: [{ date: '2026-09-02', text: 'x', done: false }], courses: [] };
  const s = Analytics.getCompletionRate('todo', '2026-09-03', '2026-09-05', f);
  expect(s.total).toBe(0);
  expect(s.completionRate).toBe(0);
});

test('Completion：todo n/n → 100，部分完成 → 比例', () => {
  const f = { user: {}, checkins: [], english: [], focus: [], sports: [], readings: [], todos: [
    { date: '2026-09-10', text: 'a', done: true }, { date: '2026-09-10', text: 'b', done: true },
    { date: '2026-09-10', text: 'c', done: false },
  ], courses: [] };
  expect(Analytics.getCompletionRate('todo', '2026-09-10', '2026-09-10', f).completionRate).toBeCloseTo(66.7, 0);
  const all = { ...f, todos: [{ date: '2026-09-10', done: true }, { date: '2026-09-10', done: true }] };
  expect(Analytics.getCompletionRate('todo', '2026-09-10', '2026-09-10', all).completionRate).toBe(100);
});

test('Completion：course 用 完成数/总数（100% 或 status=done）', () => {
  const f = fixture();
  const c = Analytics.getCompletionRate('course', null, null, f);
  expect(c.count).toBe(3);
  expect(c.done).toBe(1);
  expect(c.pending).toBe(2);
  expect(c.completionRate).toBeCloseTo(33.3, 0);
});

test('Completion：active 活跃天数完成率', () => {
  const a = Analytics.getCompletionRate('active', '2026-09-08', '2026-09-11', fixture());
  expect(a.days).toBe(4);
  expect(a.activeDays).toBe(4);
  expect(a.completionRate).toBe(100);
});

/* ==================== Streak ==================== */

test('Streak：连续 4 天（08→11），未来日期不计', () => {
  const s = Analytics.getStreaks(fixture(), { today: TODAY });
  expect(s.currentStreak).toBe(4);
  expect(s.longestStreak).toBe(4);
  expect(s.todayDone).toBe(true);
});

test('Streak：今天未打卡但昨天有 → current 沿用最近一天', () => {
  const f = fixture();
  f.checkins = f.checkins.filter((c) => c.date !== TODAY); // 去掉今天
  const s = Analytics.getStreaks(f, { today: TODAY });
  expect(s.currentStreak).toBe(3); // 08/09/10 已打卡，昨天(10)至今(11)差1天
  expect(s.todayDone).toBe(false);
});

test('Streak：断一天 → current 只算断点后', () => {
  const f = fixture();
  f.checkins = [
    { date: '2026-09-08', status: 'done' }, { date: '2026-09-09', status: 'done' },
    { date: '2026-09-11', status: 'done' } // 10 号断档
  ];
  const s = Analytics.getStreaks(f, { today: TODAY });
  expect(s.currentStreak).toBe(1);
  expect(s.longestStreak).toBe(2);
});

test('Streak：跨年连续', () => {
  const f = fixture();
  f.checkins = [{ date: '2025-12-30', status: 'done' }, { date: '2025-12-31', status: 'done' }, { date: '2026-01-01', status: 'done' }];
  const s = Analytics.getStreaks(f, { today: '2026-01-02' });
  expect(s.longestStreak).toBe(3);
});

test('Streak：空数据 → 0', () => {
  const s = Analytics.getStreaks({ user: {}, checkins: [], english: [], focus: [], sports: [], readings: [], todos: [], courses: [] }, { today: TODAY });
  expect(s.currentStreak).toBe(0);
  expect(s.longestStreak).toBe(0);
});

/* ==================== Trend ==================== */

test('Trend：daily 日期升序 + 数值', () => {
  const t = Analytics.getTrend('study', '2026-09-10', '2026-09-11', 'daily', fixture());
  expect(t.map((x) => x.date)).toEqual(['2026-09-10', '2026-09-11']);
  expect(t[0].value).toBe(70); // 英语45+专注25
  expect(t[1].value).toBe(45); // 专注45
});

test('Trend：空数据 → 每点 0 但日期完整', () => {
  const f = { user: {}, checkins: [], english: [], focus: [], sports: [], readings: [], todos: [], courses: [] };
  const t = Analytics.getTrend('study', '2026-09-10', '2026-09-12', 'daily', f);
  expect(t.length).toBe(3);
  expect(t.every((x) => x.value === 0)).toBe(true);
});

test('Trend：单点', () => {
  const t = Analytics.getTrend('checkin', '2026-09-10', '2026-09-10', 'daily', fixture());
  expect(t).toEqual([{ date: '2026-09-10', value: 1 }]);
});

test('Trend：weekly 桶（按周一分组合计）', () => {
  const t = Analytics.getTrend('study', '2026-09-07', '2026-09-20', 'weekly', fixture());
  expect(t[0]).toEqual({ date: '2026-09-07', value: 165 });
  // 第二周 09-14~09-20 无数据 → 值为 0
  expect(t[1].date).toBe('2026-09-14');
  expect(t[1].value).toBe(0);
});

test('Trend：monthly 桶（按 YYYY-MM-01 分组）', () => {
  const t = Analytics.getTrend('study', '2026-09-01', '2026-09-30', 'monthly', fixture());
  expect(t).toEqual([{ date: '2026-09-01', value: 165 }]);
});

test('Trend：未知 metric → []', () => {
  expect(Analytics.getTrend('nope', '2026-09-10', '2026-09-11', 'daily', fixture())).toEqual([]);
});

/* ==================== 分主题 ==================== */

test('StudySummary：汇总学习数据', () => {
  const s = Analytics.getStudySummary('2026-09-07', '2026-09-13', fixture());
  expect(s.minutes).toBe(165);
  expect(s.englishMinutes).toBe(45);
  expect(s.focusMinutes).toBe(120);
  expect(s.words).toBe(70);
  expect(s.readingPages).toBe(50);
});

test('ExerciseSummary：次数/时长/卡路里/类型分布', () => {
  const s = Analytics.getExerciseSummary('2026-09-07', '2026-09-13', fixture());
  expect(s.count).toBe(1);
  expect(s.minutes).toBe(30);
  expect(s.calories).toBe(200);
  expect(s.types).toEqual({ run: 1 });
});

test('FocusSummary：session/分钟/均值', () => {
  const s = Analytics.getFocusSummary('2026-09-07', '2026-09-13', fixture());
  expect(s.sessions).toBe(3);
  expect(s.minutes).toBe(120);
  expect(s.avgMinutes).toBe(40);
});

test('TodoSummary：过期 = date 早于今天(today 可注入)且未做', () => {
  // 注入今日=09-11：t2(09-10 未做) 与 t4(09-05 未做) 均已过期；t1/t3 已完成
  // today 注入保证与真实系统日期解耦（Review M3）
  const s = Analytics.getTodoSummary('2026-09-01', '2026-09-11', fixture(), TODAY);
  expect(s.total).toBe(4);
  expect(s.done).toBe(2); // t1 + t3
  expect(s.pending).toBe(2);
  expect(s.overdue).toBe(2); // t2 + t4（日期早于今天且未完成）
  expect(s.completionRate).toBe(50);
});

test('CourseSummary：今日排课 / 本周 / 库概览', () => {
  const c = Analytics.getCourseSummary(fixture());
  expect(c.count).toBe(3);
  expect(c.done).toBe(1);
  expect(c.avgProgress).toBe(47);
  expect(c.totalCredits).toBe(9);
  expect(c.typeDistribution).toEqual({ 必修: 2, 选修: 1 });
  expect(c.todayScheduleCount).toBe(0); // 周五无课
  expect(c.weekly.sessions).toBe(3);
  expect(c.weekly.distinctCourses).toBe(3);
});

/* ==================== Activity ==================== */

test('ActivityDistribution：按类别给出可解释活跃度', () => {
  const arr = Analytics.getActivityDistribution('2026-09-10', '2026-09-10', fixture());
  expect(arr.length).toBe(1);
  const a = arr[0];
  expect(a.date).toBe('2026-09-10');
  expect(a.categories).toEqual({ checkin: 1, sports: 1, reading: 0, english: 1, focus: 1, todo: 1, course: 1 });
  expect(a.score).toBe(6);
});

test('ActivityMap：只返回有活动的日期（截止今日），count = 类别数', () => {
  // today 注入固定为 09-11，与真实系统日期解耦（Review M3）
  const m = Analytics.getActivityMap(fixture(), { today: TODAY });
  const byDate = {};
  m.forEach((x) => { byDate[x.date] = x.count; });
  expect(byDate['2026-09-10']).toBe(6);
  expect(byDate['2026-09-11']).toBe(3);   // 打卡+专注+阅读
  expect(byDate['2026-09-12']).toBeUndefined(); // 未来（>今日）不进入地图
  expect(byDate['2026-09-13']).toBeUndefined();
});

/* ==================== Defensive ==================== */

test('Defensive：坏记录（缺字段/坏日期/坏数字）不崩溃且跳过', () => {
  const dirty = {
    user: null,
    checkins: [{ date: 'bad', status: 'done' }, {}, { date: '' }, { date: '2026-09-10', status: 'done' }],
    english: [{ date: undefined, minutes: 'x' }, { minutes: 50 }, { date: '2026-09-10', minutes: '30' }],
    focus: [{ date: '2026-09-10', minutes: -5 }, { date: '2026-09-11' }],
    sports: [{ date: 20260910, calories: 'a' }, { date: '2026-09-10', calories: 100, duration: '20' }],
    readings: [{ date: '2026-09-10', pages: null }],
    todos: [{ date: '2026-09-11', done: 'yes' }, { date: '2026-09-10', done: true }],
    courses: [{ name: '坏课', slots: null }, { id: 'ok', name: '好课', progress: 50, slots: [] }]
  };
  // 不抛错
  const d = Analytics.getDailySummary('2026-09-10', dirty);
  expect(d.study.minutes).toBe(30);   // 只统计到合法 english '2026-09-10' 30分钟
  expect(d.todos.done).toBe(1);       // done:'2026-09-10' 的 true
  // 课程: 2026-09-10 周四，无合法 slots → scheduled 0
  expect(d.courses.scheduled).toBe(0);
  // streak 同样不崩
  const s = Analytics.getStreaks(dirty, { today: TODAY });
  expect(s.currentStreak).toBe(1);
});

test('Defensive：旧数据（course 只有 name+time）兼容', () => {
  const legacy = {
    user: {}, checkins: [], english: [], focus: [], sports: [], readings: [], todos: [], courses: [
      { name: '老高数', time: '周一1-2节' }
    ]
  };
  const c = Analytics.getCourseSummary(legacy);
  expect(c.count).toBe(1);
  expect(c.pending).toBe(1);
  // 周一有排课（归一化后）→ 今天(周五)不算，但本周 sessions = 1
  expect(c.weekly.sessions).toBe(1);
});

/* ==================== 不变量 ==================== */

test('不变量：Analytics 不改数据（before === after 深比较）', () => {
  const before = fixture();
  const deep = JSON.parse(JSON.stringify(before));
  Analytics.getDailySummary('2026-09-10', before);
  Analytics.getWeeklySummary(before);
  Analytics.getMonthlySummary(2026, 9, before);
  Analytics.getTrend('study', '2026-09-01', '2026-09-30', 'daily', before);
  Analytics.getStreaks(before, { today: TODAY });
  Analytics.getActivityDistribution('2026-09-01', '2026-09-30', before);
  expect(JSON.stringify(before)).toBe(JSON.stringify(deep));
});

test('不变量：snapshot() 不引用 Store 内部对象', () => {
  const f = fixture();
  const snap = Analytics.snapshot(f);
  expect(snap).not.toBe(f);
  expect(snap.courses).not.toBe(f.courses);
  // 修改快照不影响原数据
  snap.courses.push({ name: 'x' });
  snap.checkins[0].date = '2000-01-01';
  expect(f.courses.length).toBe(3);
  expect(f.checkins[0].date).toBe('2026-09-08');
});

test('不变量：调用 Analytics 100 次不动 CGStore / revision', async () => {
  const { default: CGStore } = await import('../js/store.js');
  CGStore.resetData();
  CGStore.addCheckin('2026-09-10', 'done');
  CGStore.addCourse({ name: '高数', progress: 10, status: 'doing', slots: [{ weekday: 0, periods: [1, 2], weeks: '1-16' }] });
  CGStore.addTodo({ text: '复习', date: '2026-09-10', done: false });
  var revBefore = CGStore.getRevision();
  var snapshotBefore = JSON.stringify(CGStore.get());

  var snap = Analytics.snapshot();
  for (var i = 0; i < 100; i++) {
    Analytics.getDailySummary('2026-09-10', snap);
    Analytics.getWeeklySummary(snap);
    Analytics.getMonthlySummary(2026, 9, snap);
    Analytics.getStreaks(snap, { today: '2026-09-11' });
    Analytics.getTrend('study', '2026-09-01', '2026-09-30', 'daily', snap);
    Analytics.getCourseSummary(snap);
  }

  // 100 次调用之后：revision 不变、数据逐位不变
  expect(CGStore.getRevision()).toBe(revBefore);
  expect(JSON.stringify(CGStore.get())).toBe(snapshotBefore);
});