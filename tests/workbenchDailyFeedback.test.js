import { test, expect, vi } from 'vitest';
import workbenchHtml from '../workbench.html?raw';
import workbenchPageSrc from '../pages/workbench.js?raw';
import { dateOffset, todayStr } from '../js/utils/date.js';

const TODAY = todayStr();

function seedData() {
  return {
    _meta: { revision: 7, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '测试', onboarded: true, startDate: dateOffset(TODAY, -20) },
    checkins: [],
    focus: [{ id: 'focus-old', date: dateOffset(TODAY, -2), minutes: 10 }],
    english: [], sports: [], readings: [],
    todos: [], courses: [], goals: []
  };
}

function mount(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
}

function stubHeadAppend() {
  const original = document.head.appendChild.bind(document.head);
  document.head.appendChild = function (node) {
    const result = original(node);
    if (node && node.tagName === 'SCRIPT' && node.onload) node.onload();
    return result;
  };
}

async function boot(data) {
  localStorage.clear();
  localStorage.setItem('cg_token', 'test-token');
  localStorage.setItem('chenguangData', JSON.stringify(data));
  mount(workbenchHtml);
  stubHeadAppend();
  vi.resetModules();
  await import('../js/store.js');
  await import('../pages/workbench.js');
  await new Promise((resolve) => setTimeout(resolve, 40));
}

test('Growth Brief has a bounded daily feedback section and empty guidance', async () => {
  await boot(seedData());
  const feedback = document.getElementById('growthBriefFeedback');

  expect(feedback).toBeTruthy();
  expect(feedback.textContent).toContain('今日成长反馈');
  expect(feedback.textContent).toContain('完成一次记录后，这里会生成你的今日成长反馈');
});

test('adding focus updates Daily Feedback without replacing the existing toast copy', async () => {
  await boot(seedData());
  globalThis.CGStore.addFocus({ date: TODAY, minutes: 25 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const feedback = document.getElementById('growthBriefFeedback');

  expect(feedback.textContent).toContain('今天完成了 1 次成长记录');
  expect(feedback.textContent).toContain('专注');
  expect(feedback.textContent).toContain('下一步建议');
  expect(feedback.textContent.length).toBeLessThan(500);
  expect(workbenchPageSrc).toContain('今日成长反馈已更新');
});

test('Growth Brief shows one bounded current growth stage', async () => {
  const data = seedData();
  data.checkins = Array.from({ length: 7 }, (_, index) => ({
    id: 'checkin-' + index,
    date: dateOffset(TODAY, -index),
    status: 'done'
  }));
  await boot(data);
  const stage = document.getElementById('growthBriefStage');
  const label = document.getElementById('growthBriefStageLabel');
  const description = document.getElementById('growthBriefStageDescription');

  expect(stage).toBeTruthy();
  expect(stage.hidden).toBe(false);
  expect(label.textContent).toContain('当前成长阶段');
  expect(label.textContent).toContain('稳定尝试');
  expect(description.textContent).toContain('你开始把记录变成一种节奏');
  expect(stage.textContent).not.toContain('→');
  expect(stage.textContent.length).toBeLessThan(160);
});

test('current growth stage is hidden without error when narrative is empty', async () => {
  await boot({
    _meta: { revision: 0, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '测试', onboarded: true },
    checkins: [], focus: [], english: [], sports: [], readings: [], todos: [], courses: [], goals: []
  });
  const stage = document.getElementById('growthBriefStage');
  const label = document.getElementById('growthBriefStageLabel');
  const description = document.getElementById('growthBriefStageDescription');

  expect(stage).toBeTruthy();
  expect(stage.hidden).toBe(true);
  expect(stage.textContent).not.toContain('undefined');
  expect(label.textContent).toBe('');
  expect(description.textContent).toBe('');
});

test('growth stage rendering uses safe text nodes', () => {
  expect(workbenchPageSrc).toContain("stageLabel.textContent = '当前成长阶段：' + narrative.currentStage.label");
  expect(workbenchPageSrc).toContain("stageDescription.textContent = narrative.currentStage.meaning");
  expect(workbenchPageSrc).not.toMatch(/growthBriefStage.*innerHTML/);
});
