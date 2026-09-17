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
  expect(coach.warnings.some((item) => item.type === 'memory_challenge')).toBe(false);
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

test('AI Coach 只读取 confirmed Memory，不读取 pending candidate', () => {
  const context = normalContext();
  context.memory = {
    confirmed: [
      { id: 'pattern:study_rising', type: 'Habit', content: '过去 90 天学习节奏保持长期改善。', confidence: 0.5, evidence: [{ source: 'GrowthIntelligence', metric: 'study', value: 25, timestamp: TODAY }] },
      { id: 'milestone:streak_7', type: 'Achievement', content: '连续成长 7 天。', confidence: 0.9, evidence: [{ source: 'Analytics', metric: 'current_streak', value: 7, timestamp: TODAY }] },
      { id: 'insight:learning', type: 'Pattern', content: '过去 30 天学习动力持续积累。', confidence: 0.5, evidence: [{ source: 'GrowthIntelligence', metric: 'study', value: 20, timestamp: TODAY }] }
    ],
    candidates: [{ id: 'candidate:pending', type: 'Habit', content: '未确认习惯。', confidence: 0.3, status: 'pending', evidence: [] }]
  };
  const before = JSON.stringify(context);
  const coach = AICoach.buildCoachContext(context);
  expect(coach.insights.map((item) => item.message).join(' ')).toContain('学习节奏');
  expect(coach.insights.map((item) => item.message).join(' ')).not.toContain('未确认习惯');
  expect(coach.warnings.some((item) => item.type === 'memory_challenge')).toBe(false);

  context.memory.confirmed.push({ id: 'pattern:goal_break_declining', type: 'Risk', content: '长期目标容易在执行中段中断。', confidence: 0.5, evidence: [{ source: 'GrowthIntelligence', metric: 'goal', value: -20, timestamp: TODAY }] });
  const mutatedSnapshot = JSON.stringify(context);
  const challengeCoach = AICoach.buildCoachContext(context);
  expect(challengeCoach.warnings.map((item) => item.message).join(' ')).toContain('容易在执行中段中断');
  expect(JSON.stringify(context)).toBe(mutatedSnapshot);
});

test('AI Coach 优先使用 Context Insight，并在缺失时 fallback confirmed', () => {
  const context = normalContext();
  context.memory = {
    insights: [{
      id: 'memory-insight:test',
      type: 'MemoryInsight',
      content: '长期记录显示学习节奏优先级最高。',
      confidence: 0.8,
      sourceIds: ['pattern:test'],
      evidence: [{ source: 'GrowthIntelligence', metric: 'study', value: 25, timestamp: TODAY }]
    }],
    confirmed: [{ id: 'pattern:test', type: 'Habit', content: 'confirmed fallback should not win.', confidence: 0.8, evidence: [] }],
    candidates: [{ id: 'candidate:pending', type: 'Habit', content: 'pending trend.', confidence: 0.5, status: 'pending', evidence: [] }]
  };
  const coach = AICoach.buildCoachContext(context);

  expect(coach.insights[0].message).toContain('长期记录显示');
  expect(coach.insights[0].message).not.toContain('confirmed fallback');
  expect(coach.insights.map((item) => item.message).join(' ')).not.toContain('pending trend');
});

test('AI Coach 将 dailyFeedback 作为短期上下文，不并入长期事实', () => {
  const context = normalContext();
  context.dailyFeedback = {
    summary: '根据今天记录，完成了一次专注。',
    highlights: ['今天记录了专注 25 分钟。'],
    changes: [{ metric: 'focus', direction: 'up', description: '最近记录显示专注投入上升。' }],
    nextActions: ['可以尝试继续保持一次小专注。']
  };
  const coach = AICoach.buildCoachContext(context);

  expect(coach.dailyFeedback.summary).toContain('根据今天记录');
  expect(coach.dailyFeedback.scope).toBe('daily');
  expect(JSON.stringify(coach.insights)).not.toContain('根据今天记录');

  const fallback = AICoach.buildCoachContext(normalContext());
  expect(fallback.dailyFeedback).toBeNull();
});
