import { describe, expect, test } from 'vitest';
import GrowthTimeline from '../js/growthTimeline.js';

const TODAY = '2026-09-15';

function growthState(overrides = {}) {
  return {
    today: TODAY,
    learningState: { summary: { minutes30: 650, activeDays30: 14 } },
    focusState: { summary: { minutes30: 190, sessions30: 12 } },
    englishState: { summary: { minutes30: 120, words30: 240 } },
    readingState: { summary: { pages30: 220 } },
    exerciseState: { summary: { minutes30: 320 } },
    courseState: { summary: { total: 3, done: 1, avgProgress: 65 } },
    goalState: { summary: { completed: 2 } },
    consistencyState: { summary: { currentStreak: 8, longestStreak: 8, activeDays30: 14 } },
    importantChanges: [
      { metric: 'focus', label: '专注时长', delta: 32, status: 'rising' },
      { metric: 'english', label: '英语学习', delta: 24, status: 'rising' }
    ],
    ...overrides
  };
}

describe('Growth Timeline projection', () => {
  test('empty data returns no timeline and no error', () => {
    const timeline = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: {
        learningState: { summary: {} },
        focusState: { summary: {} },
        englishState: { summary: {} },
        readingState: { summary: {} },
        exerciseState: { summary: {} },
        courseState: { summary: {} },
        goalState: { summary: {} },
        consistencyState: { summary: {} },
        importantChanges: []
      },
      personalBest: { firstRecordDate: null, longestStreak: 0 },
      courseSummary: { done: 0 }
    });

    expect(timeline).toEqual({ version: '1.0', today: TODAY, dataSufficient: false, timeline: [] });
  });

  test('builds reliable record, goal, streak, breakthrough and trend nodes', () => {
    const result = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: growthState(),
      personalBest: { firstRecordDate: '2026-09-07', longestStreak: 8 },
      courseSummary: { done: 1 }
    });

    const text = result.timeline.map((item) => item.title + ' ' + item.description).join(' ');
    expect(result.dataSufficient).toBe(true);
    expect(result.timeline.length).toBeGreaterThan(3);
    expect(result.timeline.some((item) => item.type === 'achievement' && item.title.includes('目标已完成'))).toBe(true);
    expect(result.timeline.some((item) => item.type === 'milestone' && item.title.includes('连续成长'))).toBe(true);
    expect(result.timeline.some((item) => item.type === 'progress')).toBe(true);
    expect(result.timeline.some((item) => item.title.includes('数据显示'))).toBe(true);
    expect(text).not.toContain('你已经改变');
    expect(result.timeline.every((item) => item.id === 'timeline:first_record' || item.asOf === TODAY)).toBe(true);
  });

  test('limits output to eight unique nodes', () => {
    const state = growthState({
      importantChanges: Array.from({ length: 18 }, (_, index) => ({
        metric: 'metric-' + index,
        label: '指标' + index,
        delta: 30 + index,
        status: 'rising'
      }))
    });
    const result = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: state,
      personalBest: { firstRecordDate: '2026-09-07', longestStreak: 30 },
      courseSummary: { done: 2 }
    });

    const ids = result.timeline.map((item) => item.id);
    expect(result.timeline).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });

  test('enforces source and type whitelists', () => {
    const result = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: growthState(),
      personalBest: { firstRecordDate: '2026-09-07' },
      courseSummary: { done: 1 }
    });

    expect(result.timeline.every((item) => ['Analytics', 'Goals', 'GrowthIntelligence'].includes(item.source))).toBe(true);
    expect(result.timeline.every((item) => ['achievement', 'milestone', 'progress', 'consistency'].includes(item.type))).toBe(true);
  });

  test('uses asOf for completed goals without inventing completedAt', () => {
    const result = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: growthState(),
      personalBest: { firstRecordDate: null },
      courseSummary: { done: 0 }
    });
    const goal = result.timeline.find((item) => item.id === 'timeline:goal_completed_1');

    expect(goal).toBeTruthy();
    expect(goal.source).toBe('Goals');
    expect(goal.asOf).toBe(TODAY);
    expect(goal).not.toHaveProperty('completedAt');
    expect(goal.title).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test('does not invent historical dates', () => {
    const result = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: growthState(),
      personalBest: { firstRecordDate: null },
      courseSummary: { done: 0 }
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('occurredAt');
    expect(serialized).not.toContain('completedAt');
    expect(result.timeline.every((item) => item.asOf === TODAY)).toBe(true);
  });

  test('sorts by type priority, then confidence', () => {
    const result = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: growthState(),
      personalBest: { firstRecordDate: '2026-09-07' },
      courseSummary: { done: 1 }
    });
    const priority = { achievement: 0, milestone: 1, progress: 2, consistency: 3 };
    const types = result.timeline.map((item) => priority[item.type]);

    expect(types).toEqual([...types].sort((a, b) => a - b));
    for (let index = 1; index < result.timeline.length; index += 1) {
      if (result.timeline[index].type === result.timeline[index - 1].type) {
        expect(result.timeline[index - 1].confidence).toBeGreaterThanOrEqual(result.timeline[index].confidence);
      }
    }
  });
});

describe('Growth Narrative projection', () => {
  test('empty timeline produces no narrative stages', () => {
    const narrative = GrowthTimeline.buildNarrative({
      version: '1.0',
      today: TODAY,
      dataSufficient: false,
      timeline: []
    });

    expect(narrative).toEqual({
      version: '1.0',
      today: TODAY,
      dataSufficient: false,
      summary: '',
      currentStage: null,
      stages: []
    });
  });

  test('maps timeline nodes to bounded growth stages', () => {
    const projection = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: growthState(),
      personalBest: { firstRecordDate: '2026-09-07' },
      courseSummary: { done: 1 }
    });
    const narrative = GrowthTimeline.buildNarrative(projection);
    const labels = narrative.stages.map((stage) => stage.label);

    expect(narrative.dataSufficient).toBe(true);
    expect(labels).toContain('起点');
    expect(labels).toContain('稳定尝试');
    expect(labels).toContain('投入积累');
    expect(labels).toContain('阶段成果');
    expect(labels.indexOf('起点')).toBeLessThan(labels.indexOf('稳定尝试'));
    expect(labels.indexOf('稳定尝试')).toBeLessThan(labels.indexOf('投入积累'));
    expect(labels.indexOf('投入积累')).toBeLessThan(labels.indexOf('阶段成果'));
    expect(narrative.summary).toContain('成长阶段');
    expect(narrative.currentStage.label).toBe(narrative.stages.at(-1).label);
  });

  test('uses existing node ids as evidence, bounds confidence, and caps evidence', () => {
    const timeline = [
      { id: 'timeline:first_record', confidence: 0.9 },
      { id: 'timeline:streak_30', confidence: 0.94 },
      { id: 'timeline:active_days_30d', confidence: 0.85 },
      { id: 'timeline:learning_600_30d', confidence: 0.93 },
      { id: 'timeline:focus_180_30d', confidence: 0.92 },
      { id: 'timeline:reading_200_30d', confidence: 0.82 }
    ];
    const narrative = GrowthTimeline.buildNarrative({
      version: '1.0',
      today: TODAY,
      dataSufficient: true,
      timeline
    });
    const knownIds = new Set(timeline.map((item) => item.id));
    const accumulation = narrative.stages.find((stage) => stage.id === 'stage:accumulation');

    expect(accumulation.evidenceIds.length).toBeLessThanOrEqual(2);
    narrative.stages.forEach((stage) => {
      expect(stage.confidence).toBeGreaterThanOrEqual(0);
      expect(stage.confidence).toBeLessThanOrEqual(1);
      stage.evidenceIds.forEach((id) => expect(knownIds.has(id)).toBe(true));
    });
  });

  test('ignores unknown evidence and does not mutate the input', () => {
    const projection = {
      version: '1.0',
      today: TODAY,
      dataSufficient: true,
      timeline: [
        { id: 'timeline:first_record', confidence: 0.9 },
        { id: 'timeline:not-real', confidence: 0.99 }
      ]
    };
    const before = JSON.stringify(projection);
    const narrative = GrowthTimeline.buildNarrative(projection);

    expect(narrative.stages).toHaveLength(1);
    expect(narrative.stages[0].evidenceIds).toEqual(['timeline:first_record']);
    expect(JSON.stringify(projection)).toBe(before);
  });

  test('does not add persistence or absolute claims', () => {
    const projection = GrowthTimeline.buildTimeline({
      today: TODAY,
      growthState: growthState(),
      personalBest: { firstRecordDate: '2026-09-07' },
      courseSummary: { done: 1 }
    });
    const text = JSON.stringify(GrowthTimeline.buildNarrative(projection));

    expect(text).not.toContain('completedAt');
    expect(text).not.toContain('createdAt');
    expect(text).not.toContain('milestoneId');
    expect(text).not.toContain('一定会');
    expect(text).not.toContain('彻底改变');
  });
});
