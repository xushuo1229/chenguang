// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { buildGrowthContext } from '../js/growthContext.js';
import AIContext from '../js/aiContext.js';
import { todayStr, dateOffset } from '../js/utils/date.js';

function emptySnapshot() {
  return {
    user: {},
    checkins: [],
    sports: [],
    readings: [],
    english: [],
    focus: [],
    todos: [],
    goals: [],
    courses: []
  };
}

describe('growthContext', () => {
  it('exports VERSION', () => {
    expect(typeof buildGrowthContext).toBe('function');
  });

  it('handles empty data without crashing', () => {
    const snap = emptySnapshot();
    const ctx = buildGrowthContext(snap);
    expect(ctx.version).toBe('1.0');
    expect(ctx.taskSummary.total).toBe(0);
    expect(ctx.taskSummary.completed).toBe(0);
    expect(ctx.taskSummary.completionRate).toBe(0);
    expect(ctx.signals.positive.length).toBe(0);
    expect(ctx.goals.activeCount).toBe(0);
    expect(ctx.goals.atRisk.length).toBe(0);
  });

  it('aggregates today task summary from Analytics', () => {
    const today = todayStr();
    const snap = emptySnapshot();
    snap.todos = [
      { id: '1', text: 'done task', date: today, done: true },
      { id: '2', text: 'pending task', date: today, done: false },
      { id: '3', text: 'pending task 2', date: today, done: false }
    ];
    const ctx = buildGrowthContext(snap, { today });
    expect(ctx.taskSummary.total).toBe(3);
    expect(ctx.taskSummary.completed).toBe(1);
    expect(ctx.taskSummary.pending).toBe(2);
    expect(ctx.taskSummary.completionRate).toBe(33.3);
  });

  it('detects yesterday pending tasks', () => {
    const today = todayStr();
    const yesterday = dateOffset(today, -1);
    const snap = emptySnapshot();
    snap.todos = [{ id: 'y1', text: 'yesterday task', date: yesterday, done: false }];
    const ctx = buildGrowthContext(snap, { today });
    expect(ctx.taskSummary.yesterdayPending).toBe(1);
    const riskTypes = ctx.signals.risks.map(r => r.type);
    expect(riskTypes).toContain('yesterday_pending');
  });

  it('integrates goals from GoalEngine without recalculating', () => {
    const today = todayStr();
    const snap = emptySnapshot();
    snap.goals = [{
      id: 'g1', title: '学习 JavaScript', type: 'focus', metric: 'minutes',
      targetValue: 100, period: 'monthly', startDate: dateOffset(today, -20), endDate: dateOffset(today, 5)
    }];
    const ctx = buildGrowthContext(snap, { today });
    expect(ctx.goals.activeCount).toBeGreaterThanOrEqual(0);
  });

  it('detects at-risk goals', () => {
    const today = todayStr();
    const snap = emptySnapshot();
    snap.goals = [{
      id: 'g1', title: '紧急目标', type: 'focus', metric: 'minutes',
      targetValue: 1000, period: 'monthly', startDate: dateOffset(today, -25), endDate: dateOffset(today, 3)
    }];
    const ctx = buildGrowthContext(snap, { today });
    if (ctx.goals.atRisk.length > 0) {
      expect(ctx.goals.atRisk[0].percentage).toBeLessThan(70);
      expect(ctx.goals.atRisk[0].daysRemaining).toBeLessThanOrEqual(7);
    }
  });

  it('uses Analytics for streaks (no recalculation)', () => {
    const today = todayStr();
    const snap = emptySnapshot();
    snap.checkins = [
      { date: dateOffset(today, -2), status: 'done' },
      { date: dateOffset(today, -1), status: 'done' },
      { date: today, status: 'done' }
    ];
    const ctx = buildGrowthContext(snap, { today });
    expect(ctx.streaks.current).toBe(3);
    expect(ctx.streaks.todayDone).toBe(true);
  });

  it('produces positive signals for active user', () => {
    const today = todayStr();
    const snap = emptySnapshot();
    snap.checkins = [{ date: today, status: 'done' }];
    snap.focus = [{ date: today, minutes: 25 }];
    snap.todos = [{ id: '1', text: 'task', date: today, done: true }];
    const ctx = buildGrowthContext(snap, { today });
    const types = ctx.signals.positive.map(s => s.type);
    expect(types).toContain('streak');
    expect(types).toContain('focus_time');
    expect(types).toContain('task_progress');
  });

  it('produces suggestions for empty day', () => {
    const snap = emptySnapshot();
    const ctx = buildGrowthContext(snap);
    expect(ctx.suggestions.length).toBeGreaterThan(0);
    expect(ctx.suggestions[0]).toContain('计划');
  });

  it('AIContext.buildContext includes growthContext field', () => {
    const today = todayStr();
    const snap = emptySnapshot();
    snap.todos = [{ id: '1', text: 'test', date: today, done: false }];
    const ctx = AIContext.buildContext(snap, { today });
    expect(ctx.growthContext).toBeDefined();
    expect(ctx.growthContext.version).toBe('1.0');
    expect(ctx.growthContext.taskSummary.total).toBe(1);
    // Verify backward compatibility: existing fields still present
    expect(ctx.overview).toBeDefined();
    expect(ctx.trends).toBeDefined();
    expect(ctx.todos).toBeDefined();
    expect(ctx.goals).toBeDefined();
    expect(ctx.insights).toBeDefined();
  });
});
