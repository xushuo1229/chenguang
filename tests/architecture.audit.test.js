import { beforeEach, expect, test } from 'vitest';
import aiPageSrc from '../pages/ai.js?raw';
import goalsPageSrc from '../pages/goals.js?raw';
import indexPageSrc from '../pages/index.js?raw';
import loginPageSrc from '../pages/login.js?raw';
import statsPageSrc from '../pages/stats.js?raw';
import workbenchPageSrc from '../pages/workbench.js?raw';
import Analytics from '../js/analytics.js';
import AIContext from '../js/aiContext.js';
import GoalEngine from '../js/goals.js';
import CGStore from '../js/store.js';
import { dateStr, dateOffset } from '../js/utils/date.js';

const PAGES = [
  aiPageSrc,
  goalsPageSrc,
  indexPageSrc,
  loginPageSrc,
  statsPageSrc,
  workbenchPageSrc,
];

const TODAY = dateStr(0);

function seed() {
  return {
    user: { name: '审计用户', startDate: dateOffset(TODAY, -7), totalDays: 8, continuousDays: 2 },
    checkins: [{ id: 'ck1', date: TODAY, status: 'done' }],
    sports: [{ id: 'sp1', date: TODAY, name: '跑步', duration: 20, calories: 100, type: 'run' }],
    readings: [{ id: 'rd1', date: TODAY, bookName: '书', pages: 10, totalPages: 100 }],
    courses: [{ id: 'co1', name: '高等数学', progress: 40, status: 'doing', credits: 4 }],
    english: [{ id: 'en1', date: TODAY, words: 20, minutes: 15 }],
    todos: [
      { id: 'td1', text: '完成作业', date: TODAY, done: true, priority: 'high' },
      { id: 'td2', text: '复习', date: TODAY, done: false, priority: 'normal' },
    ],
    focus: [{ id: 'fo1', date: TODAY, minutes: 25, task: '数学' }],
    goals: [{
      id: 'go1', title: '本周专注', type: 'focus', metric: 'minutes', targetValue: 300,
      period: 'weekly', startDate: dateOffset(TODAY, -3), endDate: TODAY, status: 'active',
      createdAt: 'x', updatedAt: 'x',
    }],
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  CGStore.resetData();
  CGStore.clearDirtyCategories();
});

test('页面不直接读写业务数据存储键', () => {
  for (const source of PAGES) {
    expect(source).not.toMatch(/localStorage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*['"]chenguangData['"]/);
    expect(source).not.toMatch(/sessionStorage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*['"]chenguangData['"]/);
  }
});

test('CGStore 保留统一业务模型并包含同步元数据', () => {
  CGStore.set(seed());
  const data = CGStore.get();
  ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus', 'goals']
    .forEach((key) => expect(Array.isArray(data[key])).toBe(true));
  expect(data._meta).toEqual(expect.objectContaining({
    revision: 1,
    updatedAt: expect.any(String),
    deviceId: expect.any(String),
    tombstones: expect.any(Object),
  }));
});

test('Analytics、GoalEngine 与 AI Context 都是只读派生层', () => {
  CGStore.set(seed());
  const revisionBefore = CGStore.getRevision();
  const before = JSON.stringify(CGStore.get());
  const snapshot = Analytics.snapshot();

  expect(snapshot).not.toBe(CGStore.get());
  Analytics.getStreaks(snapshot, { today: TODAY });
  GoalEngine.computeGoalsProgress(snapshot.goals, snapshot, { today: TODAY });
  AIContext.buildContext(snapshot, { today: TODAY });

  expect(CGStore.getRevision()).toBe(revisionBefore);
  expect(JSON.stringify(CGStore.get())).toBe(before);
  expect(CGStore.getDirtyCategories()).toEqual([]);
});
