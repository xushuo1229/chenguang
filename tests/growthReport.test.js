import { test, expect } from 'vitest';
import growthReportSrc from '../js/growthReport.js?raw';
import GrowthReport from '../js/growthReport.js';

const TODAY = '2026-09-14';

function reportContext(overrides = {}) {
  return {
    version: '1.0',
    today: TODAY,
    overview: {
      activeDays: 4,
      currentStreak: 3,
      completionRate: 80,
      studyMinutes: 120,
      totalFocusMinutes: 90
    },
    goals: {
      active: [{ id: 'g1', title: '本周专注 600 分钟', percentage: 80 }],
      completed: []
    },
    study: { minutes: 120 },
    daily: {
      activity: true,
      studyMinutes: 45,
      focusMinutes: 25,
      exerciseMinutes: 30,
      todosCompleted: 2,
      todosTotal: 3
    },
    growth: {
      score: { value: 72, dataSufficient: true },
      strengths: [{ type: 'focus_habit_forming', reason: '最近 7 天专注时长上升 20%。' }],
      risks: [{ type: 'focus_declining', severity: 'medium', reason: '最近 7 天专注时长下降 18%。' }],
      trends: {
        '7d': { learningTrend: { status: 'rising', delta: 20, description: '最近 7 天学习趋势上升。' } },
        '30d': { learningTrend: { status: 'rising', delta: 15, description: '最近 30 天学习趋势上升。' } }
      }
    },
    growthState: {
      overall: 'improving',
      dataSufficiency: { overall: true },
      importantChanges: [{ status: 'rising', label: '专注', delta: 20 }],
      risks: [{ type: 'focus_declining', reason: '最近 7 天专注时长下降 18%。' }],
      strengths: [{ type: 'focus_habit_forming', reason: '最近 30 天专注时长上升 20%。' }],
      recommendedFocus: [{ type: 'focus_recovery', reason: '建议明天安排 25 分钟深度学习。' }],
      actionProposals: [{ id: 'focus-25', title: '安排 25 分钟深度学习', why: '先恢复专注节奏。' }]
    },
    coach: {
      dataSufficient: true,
      insights: [{ message: '你的专注习惯正在形成。' }],
      warnings: [{ message: '最近专注节奏有所回落。' }],
      recommendations: [{ title: '安排 25 分钟深度学习', message: '先恢复专注节奏。', requiresConfirmation: true }],
      encouragement: '继续按自己的节奏推进。'
    },
    ...overrides
  };
}

test('日报使用今日完成、亮点与建议生成可执行报告', () => {
  const report = GrowthReport.buildReport(reportContext(), 'daily');
  expect(report.version).toBe('1.0');
  expect(report.readOnly).toBe(true);
  expect(report.period).toBe('daily');
  expect(report.summary).toContain('今日');
  expect(report.achievements.join(' ')).toContain('连续');
  expect(report.insights.join(' ')).toContain('专注');
  expect(report.nextSteps.join(' ')).toContain('25 分钟');
});

test('周报总结趋势、最大进步与改善方向', () => {
  const report = GrowthReport.buildReport(reportContext(), 'weekly');
  expect(report.period).toBe('weekly');
  expect(report.summary).toContain('本周');
  expect(report.achievements.join(' ')).toContain('学习');
  expect(report.challenges.join(' ')).toContain('专注');
  expect(report.recommendations.join(' ')).toContain('深度学习');
});

test('月报总结长期趋势与下一阶段建议', () => {
  const report = GrowthReport.buildReport(reportContext(), 'monthly');
  expect(report.period).toBe('monthly');
  expect(report.summary).toContain('月度');
  expect(report.insights.join(' ')).toContain('30 天');
  expect(report.nextSteps.join(' ')).toContain('下一阶段');
});

test('空数据用户收到诚实空态报告，不会生成虚构成果', () => {
  const context = reportContext({
    overview: {},
    goals: {},
    study: {},
    growth: { score: {}, trends: {}, strengths: [], risks: [] },
    growthState: { dataSufficiency: { overall: false }, importantChanges: [], strengths: [], risks: [], recommendedFocus: [], actionProposals: [] },
    coach: null
  });
  ['daily', 'weekly', 'monthly'].forEach((period) => {
    const report = GrowthReport.buildReport(context, period);
    expect(report.dataSufficient).toBe(false);
    expect(report.summary).toContain('数据不足');
    expect(report.achievements).toHaveLength(0);
    expect(report.insights).toHaveLength(0);
    expect(report.challenges).toHaveLength(0);
  });
});

test('提升趋势会成为亮点，下降趋势会成为温和挑战', () => {
  const rising = GrowthReport.buildReport(reportContext(), 'weekly');
  expect(rising.insights.join(' ')).toMatch(/上升|改善/);

  const context = reportContext();
  context.growth.trends['7d'].learningTrend = { status: 'falling', delta: -20, description: '最近 7 天学习趋势下降。' };
  const falling = GrowthReport.buildReport(context, 'weekly');
  expect(falling.challenges.join(' ')).toMatch(/下降|回落/);
  expect(JSON.stringify(falling)).not.toMatch(/必须|失败|懒惰/);
});

test('风险和建议保持用户确认边界', () => {
  const report = GrowthReport.buildReport(reportContext(), 'weekly');
  expect(report.challenges.join(' ')).toContain('下降');
  expect(report.recommendations.join(' ')).toContain('深度学习');
});

test('旧 Context 没有 coach 时仍能从 Growth Intelligence 生成报告', () => {
  const context = reportContext();
  delete context.coach;
  const report = GrowthReport.buildReport(context, 'weekly');
  expect(report.summary).toContain('本周');
  expect(report.recommendations.join(' ')).toContain('深度学习');
});

test('报告生成不修改输入 Context', () => {
  const context = reportContext();
  const before = JSON.stringify(context);
  GrowthReport.buildReports(context);
  expect(JSON.stringify(context)).toBe(before);
});

test('formatReport 输出安全纯文本结构', () => {
  const text = GrowthReport.formatReport(GrowthReport.buildReport(reportContext(), 'weekly'));
  expect(text).toContain('成长报告');
  expect(text).toContain('成果');
  expect(text).toContain('下一步');
});

test('Growth Report 模块没有直接数据访问或写入能力', () => {
  expect(growthReportSrc).not.toMatch(/CGStore|Store\.get|localStorage|sessionStorage|Analytics\.|GoalEngine|GrowthIntelligence|AICoach/);
});
