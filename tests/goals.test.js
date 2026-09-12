/**
 * Phase 12 · Goals System —— Goal Engine / Store 集成 / 向后兼容 测试
 * ============================================================
 * 覆盖：
 *  1. validateGoal 校验（targetValue>0、日期合法、start<=end、metric 合法、custom 上限）
 *  2. goalRange 周期→范围（daily/weekly/monthly/custom；复用 Analytics 周/月语义）
 *  3. 进度计算：focus/reading/english/todo/checkin/exercise 各指标
 *  4. completed / expired / archived 派生状态
 *  5. 超额完成：cur 保留、percentage 钳位、remaining=0
 *  6. 每日目标：只算当天，不从创建日累计
 *  7. Store：创建/编辑/归档 revision+1；计算进度 revision 不变（只读）
 *  8. 向后兼容：无 goals 的旧数据不崩、返回 []
 *  9. 坏数据（非法日期/坏目标）隔离，不拖垮整批
 *
 * 说明：计算一律注入 { today } 与明确 snapshot，不依赖真实系统日期。
 */
import { describe, test, expect, beforeEach } from 'vitest';
import CGStore from '../js/store.js';
import GoalEngine from '../js/goals.js';

const TODAY = '2026-09-12'; // 周六
// 本周一 09-07 … 周日 09-13（Analytics.thisWeek 的周界）
const WEEK_START = '2026-09-07';
const WEEK_END = '2026-09-13';

/* ---- 一条本周 seed：落在 09-07 所在周内 ---- */
function seed() {
  return {
    user: { name: '测试', semesterStart: '' },
    checkins: [
      { id: 'c1', date: '2026-09-07', status: 'done' },
      { id: 'c2', date: '2026-09-08', status: 'done' },
      { id: 'c3', date: '2026-09-10', status: 'done' },
    ],
    focus: [
      { id: 'f1', date: '2026-09-07', minutes: 60 },
      { id: 'f2', date: '2026-09-08', minutes: 40 },
      { id: 'f3', date: '2026-09-09', minutes: 20 },
    ],
    readings: [
      { id: 'r1', date: '2026-09-07', pages: 10 },
      { id: 'r2', date: '2026-09-08', pages: 20 },
    ],
    english: [
      { id: 'e1', date: '2026-09-07', words: 200, minutes: 30 },
      { id: 'e2', date: '2026-09-09', words: 300, minutes: 45 },
    ],
    sports: [
      { id: 's1', date: '2026-09-07', duration: 30, calories: 200 },
      { id: 's2', date: '2026-09-09', duration: 25, calories: 150 },
      { id: 's3', date: '2026-09-09', duration: 20, calories: 120 },
    ],
    todos: [
      { id: 't1', date: '2026-09-07', text: 'a', done: true },
      { id: 't2', date: '2026-09-07', text: 'b', done: true },
      { id: 't3', date: '2026-09-08', text: 'c', done: true },
      { id: 't4', date: '2026-09-08', text: 'd', done: true },
      { id: 't5', date: '2026-09-08', text: 'e', done: false },
    ],
    courses: [],
  };
}

function weeklyGoal(overrides) {
  return Object.assign({
    id: 'g1', title: '本周专注', type: 'focus', metric: 'minutes', targetValue: 600,
    period: 'weekly', startDate: WEEK_START, endDate: WEEK_END, status: 'active',
  }, overrides || {});
}

/* ==================== 1. 校验 ==================== */
describe('validateGoal', () => {
  test('合法目标 ok', () => {
    expect(GoalEngine.validateGoal(weeklyGoal()).ok).toBe(true);
  });
  test('targetValue <= 0 拒绝', () => {
    const v = GoalEngine.validateGoal(weeklyGoal({ targetValue: 0 }));
    expect(v.ok).toBe(false);
    expect(v.errors.map((e) => e.field)).toContain('targetValue');
  });
  test('空标题拒绝', () => {
    expect(GoalEngine.validateGoal(weeklyGoal({ title: '  ' })).ok).toBe(false);
  });
  test('start > end 拒绝', () => {
    const v = GoalEngine.validateGoal(weeklyGoal({ period: 'custom', startDate: WEEK_END, endDate: WEEK_START }));
    expect(v.ok).toBe(false);
  });
  test('metric 与 type 不匹配拒绝', () => {
    const v = GoalEngine.validateGoal(weeklyGoal({ type: 'reading', metric: 'minutes' }));
    expect(v.ok).toBe(false);
  });
  test('非法日期（含 2026-02-30）拒绝', () => {
    expect(GoalEngine.validateGoal(weeklyGoal({ period: 'custom', startDate: '2026-02-30', endDate: WEEK_END })).ok).toBe(false);
    expect(GoalEngine.validateGoal(weeklyGoal({ period: 'custom', startDate: 'not-a-date', endDate: WEEK_END })).ok).toBe(false);
  });
  test('custom 缺日期拒绝；超长周期拒绝', () => {
    expect(GoalEngine.validateGoal(weeklyGoal({ period: 'custom', endDate: '' })).ok).toBe(false);
    const long = GoalEngine.validateGoal(weeklyGoal({ period: 'custom', endDate: '2029-12-31' }));
    expect(long.ok).toBe(false);
  });
});

/* ==================== 2. 周期范围 ==================== */
describe('goalRange', () => {
  test('daily → 单日', () => {
    const r = GoalEngine.goalRange({ period: 'daily', startDate: TODAY, endDate: TODAY });
    expect(r).toEqual([TODAY, TODAY]);
  });
  test('weekly → 周一~周日（复用 Analytics 周界）', () => {
    const r = GoalEngine.goalRange({ period: 'weekly', startDate: TODAY });
    expect(r).toEqual([WEEK_START, WEEK_END]);
  });
  test('monthly → 当月首日~末日', () => {
    const r = GoalEngine.goalRange({ period: 'monthly', startDate: '2026-09-12' });
    expect(r[0]).toBe('2026-09-01');
    expect(r[1]).toBe('2026-09-30');
  });
  test('custom → [start,end]', () => {
    expect(GoalEngine.goalRange({ period: 'custom', startDate: '2026-09-01', endDate: '2026-09-15' })).toEqual(['2026-09-01', '2026-09-15']);
  });
  test('非法日期 → null', () => {
    expect(GoalEngine.goalRange({ period: 'weekly', startDate: 'bad' })).toBeNull();
  });
});

/* ==================== 3/4/5. 进度 + 状态 + 超额 ==================== */
describe('computeGoalsProgress 各指标', () => {
  test('focus minutes：120/600 → 20%、剩余 480、active', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal(), seed(), { today: TODAY });
    expect(p.currentValue).toBe(120);
    expect(p.targetValue).toBe(600);
    expect(p.percentage).toBe(20);
    expect(p.remaining).toBe(480);
    expect(p.status).toBe('active');
    expect(p.daysRemaining).toBe(1); // 09-13 - 09-12
  });
  test('reading pages：30/100 → 30%', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ title: '阅读', type: 'reading', metric: 'pages', targetValue: 100 }), seed(), { today: TODAY });
    expect(p.currentValue).toBe(30);
    expect(p.percentage).toBe(30);
  });
  test('english words：500/2000 → 25%', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ type: 'english', metric: 'words', targetValue: 2000 }), seed(), { today: TODAY });
    expect(p.currentValue).toBe(500);
    expect(p.percentage).toBe(25);
  });
  test('english minutes：75/150 → 50%', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ type: 'english', metric: 'minutes', targetValue: 150 }), seed(), { today: TODAY });
    expect(p.currentValue).toBe(75);
    expect(p.percentage).toBe(50);
  });
  test('todo count：4/10 → 40%', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ type: 'todo', metric: 'count', targetValue: 10 }), seed(), { today: TODAY });
    expect(p.currentValue).toBe(4);
    expect(p.percentage).toBe(40);
  });
  test('checkin days：3/5 → 60%', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ type: 'checkin', metric: 'days', targetValue: 5 }), seed(), { today: TODAY });
    expect(p.currentValue).toBe(3);
    expect(p.percentage).toBe(60);
  });
  test('exercise count：3/4 → 75%；exercise minutes：75/90 → 83%', () => {
    const c = GoalEngine.getGoalProgress(weeklyGoal({ type: 'exercise', metric: 'count', targetValue: 4 }), seed(), { today: TODAY });
    expect(c.currentValue).toBe(3);
    expect(c.percentage).toBe(75);
    const m = GoalEngine.getGoalProgress(weeklyGoal({ type: 'exercise', metric: 'minutes', targetValue: 90 }), seed(), { today: TODAY });
    expect(m.currentValue).toBe(75);
  });

  test('completed：cur>=target → completed，即使未到 end 日期', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ type: 'focus', metric: 'minutes', targetValue: 100 }), seed(), { today: TODAY });
    expect(p.isComplete).toBe(true);
    expect(p.status).toBe('completed');
    expect(p.percentage).toBe(100);
  });
  test('过期：today > end 且未完成 → expired', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ startDate: '2026-09-01', endDate: '2026-09-05', period: 'custom', targetValue: 1000 }), seed(), { today: TODAY });
    expect(p.isExpired).toBe(true);
    expect(p.status).toBe('expired');
  });
  test('超期今天截止：daysRemaining=0 为 active 未过期', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ endDate: TODAY, period: 'custom', targetValue: 1000 }), seed(), { today: TODAY });
    expect(p.daysRemaining).toBe(0);
    expect(p.isExpired).toBe(false);
  });
  test('超额完成：percentage 钳位 100、保留原始实际值 120', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ targetValue: 100 }), seed(), { today: TODAY });
    expect(p.currentValue).toBe(120);
    expect(p.percentage).toBe(100);
    expect(p.percentRaw).toBe(120);
    expect(p.remaining).toBe(0);
  });
  test('archived：状态持久为 archived，不进 active', () => {
    const p = GoalEngine.getGoalProgress(weeklyGoal({ status: 'archived' }), seed(), { today: TODAY });
    expect(p.status).toBe('archived');
  });
  test('course count：已完成课程数（库级，可靠口径）', () => {
    const data = seed();
    data.courses = [
      { id: 'k1', name: '高数', progress: 100, status: 'done' },
      { id: 'k2', name: '英语', progress: 60, status: 'doing' },
    ];
    const p = GoalEngine.getGoalProgress(weeklyGoal({ type: 'course', metric: 'count', targetValue: 2 }), data, { today: TODAY });
    expect(p.currentValue).toBe(1);
    expect(p.percentage).toBe(50);
  });
});

/* ==================== 6. 每日目标语义 ==================== */
describe('daily 目标是单日，不从创建日累计', () => {
  test('只计 startDate 当天，前一天数据不计入', () => {
    const data = seed();
    // 前一天 09-11 有 500 分钟专注，但 daily 目标只评估 09-12 当天
    data.focus.push({ id: 'xx', date: '2026-09-11', minutes: 500 });
    const p = GoalEngine.getGoalProgress(
      weeklyGoal({ period: 'daily', startDate: TODAY, endDate: TODAY, type: 'focus', targetValue: 600 }),
      data, { today: TODAY });
    expect(p.currentValue).toBe(0); // 09-12 无专注
    expect(p.percentage).toBe(0);
  });
  test('当天有记录 → 计入', () => {
    const data = seed();
    data.focus.push({ id: 'yy', date: TODAY, minutes: 60 });
    const p = GoalEngine.getGoalProgress(
      weeklyGoal({ period: 'daily', startDate: TODAY, endDate: TODAY, type: 'focus', targetValue: 60 }),
      data, { today: TODAY });
    expect(p.currentValue).toBe(60);
    expect(p.isComplete).toBe(true);
  });
});

/* ==================== 7. Store revision ==================== */
describe('Store 集成：revision 规则', () => {
  beforeEach(() => {
    localStorage.clear();
    CGStore.resetData();
    CGStore.clearDirtyCategories();
  });

  test('emptyData 含 goals 空集合', () => {
    const d = CGStore.get();
    expect(Array.isArray(d.goals)).toBe(true);
    expect(d.goals).toHaveLength(0);
  });

  test('创建 revision+1；编辑 +1；归档 +1', () => {
    const r0 = CGStore.getRevision();
    const g = CGStore.addGoal({ title: '本周专注', type: 'focus', metric: 'minutes', targetValue: 600, period: 'weekly', startDate: WEEK_START, endDate: WEEK_END });
    expect(g).toBeTruthy();
    expect(g.metric).toBe('minutes');
    expect(CGStore.getRevision()).toBe(r0 + 1);

    CGStore.updateGoal(g.id, { targetValue: 700 });
    expect(CGStore.getRevision()).toBe(r0 + 2);

    CGStore.archiveGoal(g.id);
    expect(CGStore.getRevision()).toBe(r0 + 3);
    expect(CGStore.getGoal(g.id).status).toBe('archived');
  });

  test('计算进度 revision 不变（纯计算）', () => {
    CGStore.addGoal({ title: '专注', type: 'focus', metric: 'minutes', targetValue: 600, period: 'weekly', startDate: WEEK_START, endDate: WEEK_END });
    CGStore.merge({ focus: seed().focus });
    const before = CGStore.getRevision();
    GoalEngine.computeGoalsProgress(CGStore.getGoals(), CGStore.get(), { today: TODAY });
    GoalEngine.getGoalProgress(CGStore.getGoals()[0], CGStore.get(), { today: TODAY });
    expect(CGStore.getRevision()).toBe(before);
  });

  test('addGoal targetValue<=0 拒绝并返回 null', () => {
    expect(CGStore.addGoal({ title: 'x', targetValue: 0 })).toBeNull();
  });

  test('removeGoal 走墓碑 + revision+1', () => {
    const g = CGStore.addGoal({ title: 'x', targetValue: 5, period: 'custom', startDate: TODAY, endDate: TODAY });
    const rev = CGStore.getRevision();
    expect(CGStore.removeGoal(g.id)).toBe(true);
    expect(CGStore.getGoals()).toHaveLength(0);
    expect(CGStore.getRevision()).toBe(rev + 1);
    expect(CGStore.getTombstones('goals')).toContain(g.id);
  });
});

/* ==================== 8/9. 向后兼容 + 坏数据 ==================== */
describe('向后兼容与坏数据防御', () => {
  test('无 goals 的旧数据：computeGoalsProgress 不崩、返回 []', () => {
    const legacy = { user: { name: 'a' }, checkins: [], focus: [], sports: [], readings: [], english: [], todos: [], courses: [] };
    expect(GoalEngine.computeGoalsProgress(undefined, legacy, { today: TODAY })).toEqual([]);
    // 即便数据对象根本没有 goals 键
    const bare = { user: {} };
    expect(GoalEngine.computeGoalsProgress(null, bare, { today: TODAY })).toEqual([]);
  });
  test('坏目标（无日期/坏类型）被隔离，不拖垮其余目标', () => {
    const p = GoalEngine.computeGoalsProgress([
      null,
      { id: 'bad', title: 'x', type: 'focus', metric: 'minutes', targetValue: 100, period: 'weekly', startDate: null, endDate: null },
      weeklyGoal(),
    ], seed(), { today: TODAY });
    expect(p).toHaveLength(3);
    // 有效目标仍能算出正确进度
    const ok = p[2];
    expect(ok.currentValue).toBe(120);
    expect(ok.percentage).toBe(20);
  });
  test('非法日期字段被防御：不产生 NaN/undefined', () => {
    const data = seed();
    data.focus.push({ id: 'zz', date: '2026-02-30', minutes: 999 });
    const p = GoalEngine.computeGoalsProgress([weeklyGoal({ type: 'focus' })], data, { today: TODAY });
    const s = JSON.stringify(p[0]);
    expect(s).not.toMatch(/NaN|undefined|Invalid/);
  });
});

/* ==================== classify ==================== */
describe('classifyGoals 分桶', () => {
  test('按派生状态分组 active/completed/expired/archived', () => {
    const goals = [
      weeklyGoal({ id: 'a', targetValue: 1000 }),                                    // active
      weeklyGoal({ id: 'b', targetValue: 100 }),                                     // completed
      weeklyGoal({ id: 'c', type: 'focus', startDate: '2026-09-01', endDate: '2026-09-05', period: 'custom', targetValue: 1000 }), // expired
      weeklyGoal({ id: 'd', status: 'archived', targetValue: 1000 }),                // archived
    ];
    const buckets = GoalEngine.classifyGoals(GoalEngine.computeGoalsProgress(goals, seed(), { today: TODAY }));
    expect(buckets.active.map((p) => p.goal.id)).toEqual(['a']);
    expect(buckets.completed.map((p) => p.goal.id)).toEqual(['b']);
    expect(buckets.expired.map((p) => p.goal.id)).toEqual(['c']);
    expect(buckets.archived.map((p) => p.goal.id)).toEqual(['d']);
  });
});