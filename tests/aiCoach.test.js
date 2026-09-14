import { test, expect } from 'vitest';
import aiCoachSrc from '../js/aiCoach.js?raw';
import AICoach from '../js/aiCoach.js';

const TODAY = '2026-09-14';

function normalContext() {
  return {
    version: '1.0',
    today: TODAY,
    overview: { activeDays: 12, currentStreak: 3 },
    goals: {
      active: [{ id: 'g1', title: '本周专注 600 分钟', percentage: 25 }]
    },
    growth: {
      score: { value: 72, dataSufficient: true },
      strengths: [{ type: 'focus_habit_forming', reason: '最近 30 天专注时长上升 20%。' }],
      risks: [{ type: 'focus_declining', severity: 'medium', reason: '最近 7 天专注时长下降 18%。' }],
      trends: {
        '7d': { learningTrend: { status: 'falling', delta: -18, description: '最近 7 天专注下降。' } },
        '30d': { learningTrend: { status: 'rising', delta: 20, description: '最近 30 天专注上升。' } }
      }
    },
    growthState: {
      overall: 'stable',
      dataSufficiency: { overall: true },
      recommendedFocus: [{ type: 'focus_recovery', reason: '建议明天安排 25 分钟深度学习。' }],
      actionProposals: [{
        id: 'focus-25',
        type: 'add_todo',
        title: '安排 25 分钟深度学习',
        why: '先恢复专注节奏。',
        requiresConfirmation: true
      }],
      strengths: [{ type: 'focus_habit_forming', reason: '最近 30 天专注时长上升 20%。' }],
      risks: [{ type: 'focus_declining', severity: 'medium', reason: '最近 7 天专注时长下降 18%。' }]
    }
  };
}

function emptyContext() {
  return {
    version: '1.0',
    today: TODAY,
    overview: { activeDays: 0, currentStreak: 0 },
    goals: { active: [] },
    growth: {
      score: { value: 0, dataSufficient: false },
      strengths: [],
      risks: [],
      trends: {
        '7d': { learningTrend: { status: 'insufficient_data', delta: 0 } },
        '30d': { learningTrend: { status: 'insufficient_data', delta: 0 } }
      }
    },
    growthState: {
      overall: 'insufficient_data',
      dataSufficiency: { overall: false },
      recommendedFocus: [],
      actionProposals: [],
      strengths: [],
      risks: []
    }
  };
}

test('AI Coach 基于已有 Growth 输出生成洞察、风险与建议', () => {
  const coach = AICoach.buildCoachContext(normalContext());
  expect(coach.version).toBe('1.0');
  expect(coach.role).toBe('growth_coach');
  expect(coach.readOnly).toBe(true);
  expect(coach.insights.some((item) => item.message.includes('专注时长上升'))).toBe(true);
  expect(coach.warnings.some((item) => item.message.includes('专注时长下降'))).toBe(true);
  expect(coach.recommendations.some((item) => item.title.includes('深度学习'))).toBe(true);
  expect(coach.encouragement).not.toContain('必须');
  expect(coach.persona.boundaries).toEqual(expect.arrayContaining([
    '不制造焦虑',
    '不做绝对化判断',
    '不提供医疗建议',
    '尊重用户自主选择'
  ]));
});

test('空数据用户不收到虚构洞察或建议', () => {
  const coach = AICoach.buildCoachContext(emptyContext());
  expect(coach.dataSufficient).toBe(false);
  expect(coach.insights).toHaveLength(0);
  expect(coach.warnings).toHaveLength(0);
  expect(coach.recommendations).toHaveLength(0);
  expect(coach.encouragement).toContain('数据');
});

test('提升趋势会转成成长亮点，下降趋势会转成温和风险提醒', () => {
  const context = normalContext();
  context.growth.trends['30d'].learningTrend = { status: 'rising', delta: 25 };
  const improving = AICoach.buildCoachContext(context);
  expect(improving.insights.some((item) => item.message.includes('上升') || item.message.includes('改善'))).toBe(true);

  context.growth.trends['30d'].learningTrend = { status: 'falling', delta: -25 };
  const declining = AICoach.buildCoachContext(context);
  expect(declining.warnings.some((item) => item.message.includes('下降') || item.message.includes('回落'))).toBe(true);
  expect(JSON.stringify(declining.warnings)).not.toMatch(/必须|失败|懒惰/);
});

test('建议只来自已有 Coach 输入，并且保持确认边界', () => {
  const coach = AICoach.buildCoachContext(normalContext());
  const recommendation = coach.recommendations[0];
  expect(recommendation).toMatchObject({
    type: 'recommendation',
    requiresConfirmation: true
  });
  expect(recommendation.evidence).toEqual(expect.objectContaining({ id: 'focus-25' }));
});

test('AI Coach 不修改输入上下文', () => {
  const context = normalContext();
  const before = JSON.stringify(context);
  AICoach.buildCoachContext(context);
  expect(JSON.stringify(context)).toBe(before);
});

test('AI Coach 模块没有数据写入或直接数据访问', () => {
  expect(aiCoachSrc).not.toMatch(/CGStore|Store\.get|localStorage|sessionStorage|GrowthIntelligence|Analytics/);
  expect(aiCoachSrc).not.toMatch(/\.setItem\(|\.removeItem\(|fetch\(/);
});
