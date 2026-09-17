import { describe, expect, test } from 'vitest';
import {
  evidenceLabel,
  formatConfidence,
  formatEvidence,
  formatLifecycle,
  formatMemoryType,
} from '../js/ui/memoryCopy.js';

const today = '2026-09-15';

describe('Memory UX copy', () => {
  test('maps memory types to user language', () => {
    expect(formatMemoryType('Habit')).toBe('学习习惯');
    expect(formatMemoryType('Pattern')).toBe('成长规律');
    expect(formatMemoryType('Achievement')).toBe('阶段成果');
    expect(formatMemoryType('Risk')).toBe('需要关注');
    expect(formatMemoryType('Preference')).toBe('个人偏好');
    expect(formatMemoryType('GoalHistory')).toBe('目标记录');
    expect(formatMemoryType('Unknown')).toBe('成长记录');
  });

  test('humanizes evidence metrics without changing values', () => {
    expect(evidenceLabel('focus')).toBe('专注记录');
    expect(evidenceLabel('current_streak')).toBe('连续成长记录');
    expect(evidenceLabel('unknown_metric')).toBe('unknown_metric');
    expect(formatEvidence([{ metric: 'focus', value: 32 }, { metric: 'todo', value: '+10%' }]))
      .toBe('专注记录 +32；任务完成情况 +10%');
  });

  test('uses observation labels instead of percentage confidence', () => {
    const item = { confidence: 0.9, evidence: [{ source: 'Analytics', metric: 'focus', value: 32, timestamp: today }] };
    expect(formatConfidence(item, { confirmed: true })).toBe('你已确认');
    expect(formatConfidence({ ...item, confidence: 0.2 })).toBe('初步观察');
    expect(formatConfidence({ ...item, confidence: 0.5 })).toBe('有一定记录支持');
    expect(formatConfidence({ ...item, confidence: 0.8 })).toBe('较多记录支持');
  });

  test('maps lifecycle stages to non-destructive copy', () => {
    expect(formatLifecycle({ stage: 'confirmed' })).toBe('保留中');
    expect(formatLifecycle({ stage: 'aging' })).toBe('等待新记录更新');
    expect(formatLifecycle({ stage: 'expired' })).toBe('暂不参与分析');
    expect(formatLifecycle({})).toBe('');
  });
});
