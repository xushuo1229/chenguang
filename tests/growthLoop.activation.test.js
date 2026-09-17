import { test, expect, vi } from 'vitest';
import aiHtml from '../ai.html?raw';
import '../js/store.js';
import { dateStr, dateOffset } from '../js/utils/date.js';

const TODAY = dateStr(0);
const day = (offset) => dateOffset(TODAY, offset);

function seedData() {
  return {
    _meta: { revision: 5, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: {
      name: '测试',
      memory: {
        version: '2.1',
        updatedAt: TODAY,
        patterns: [{
          id: 'pattern:stable_focus', kind: 'habit_pattern', statement: '你已形成稳定专注习惯。',
          confidence: 0.9, weight: 80, status: 'active', createdAt: TODAY, lastSeenAt: TODAY,
          occurrences: 2, evidence: { delta: 32 }
        }],
        milestones: [],
        preferences: [],
        insights: [],
        candidates: [
          candidate('candidate:first', '数据显示你可能正在形成专注习惯。'),
          candidate('candidate:second', '数据显示你可能正在形成英语习惯。'),
          candidate('candidate:third', '数据显示你可能正在形成阅读习惯。')
        ]
      }
    },
    checkins: [{ id: 'ck1', date: TODAY, status: 'done' }],
    focus: [{ id: 'f1', date: TODAY, minutes: 45 }],
    sports: [{ id: 's1', date: TODAY, minutes: 30, calories: 200 }],
    readings: [],
    english: [{ id: 'e1', date: TODAY, minutes: 25, words: 20 }],
    todos: [{ id: 't1', text: '完成作业', done: true }],
    courses: [{ id: 'c1', name: '高等数学', progress: 20, status: 'doing', credits: 4 }],
    goals: []
  };
}

function candidate(id, content) {
  return {
    id,
    type: 'Habit',
    content,
    confidence: 0.8,
    status: 'pending',
    evidence: [{ source: 'Analytics', metric: 'focus', value: 32, timestamp: TODAY }],
    createdAt: TODAY,
    updatedAt: TODAY,
    expiresAt: dateStr(30)
  };
}

async function boot(data, token = 'test-token') {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('cg_token', token);
  localStorage.setItem('cg_user', JSON.stringify({ id: 'user-1' }));
  localStorage.setItem('chenguangData', JSON.stringify(data));
  localStorage.setItem('cg_ai_coach_memory_v1', JSON.stringify({
    version: 1,
    users: {
      'user-1': {
        recommendations: [],
        memories: [{ id: 'strategy:focus', statement: '短期 Coach Memory 洞察。', confidence: 'low' }],
        updatedAt: new Date().toISOString()
      }
    }
  }));
  const parsed = new DOMParser().parseFromString(aiHtml, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
  vi.resetModules();
  await import('../js/store.js');
  const getSpy = vi.spyOn(globalThis.CGStore, 'get');
  await import('../pages/ai.js');
  await new Promise((resolve) => setTimeout(resolve, 30));
  return getSpy;
}

const waitForPersist = () => new Promise((resolve) => setTimeout(resolve, 140));

function activationText() {
  return document.getElementById('memoryActivationList')?.textContent || '';
}

test('AI 页展示 pending candidates，但最多两条并保持可能趋势语义', async () => {
  await boot(seedData());
  const buttons = [...document.querySelectorAll('#memoryActivationList [data-memory-action="confirm"]')];

  expect(document.getElementById('cardMemoryActivation').hidden).toBe(false);
  expect(buttons).toHaveLength(2);
  expect(activationText()).toContain('数据显示你可能正在形成专注习惯。');
  expect(activationText()).toContain('数据显示你可能正在形成英语习惯。');
  expect(activationText()).not.toContain('数据显示你可能正在形成阅读习惯。');
  expect(activationText()).toContain('可能');
  expect(activationText()).not.toContain('已经形成');
  expect(activationText()).toContain('依据');
});

test('确认 Candidate 只写入一次 Memory，并刷新长期规律投影', async () => {
  const getSpy = await boot(seedData());
  const revisionBefore = globalThis.CGStore.getRevision();
  const confirmButton = document.querySelector('#memoryActivationList [data-memory-action="confirm"]');
  const confirmedId = confirmButton.getAttribute('data-memory-id');
  confirmButton.click();
  expect(document.getElementById('confirmedMemoryList').textContent).toContain('稳定专注习惯');
  expect(activationText()).not.toContain('数据显示你可能正在形成专注习惯。');
  await waitForPersist();
  const saved = JSON.parse(localStorage.getItem('chenguangData'));
  const persisted = saved.user.memory.candidates.find((item) => item.id === confirmedId);

  expect(saved._meta.revision).toBe(revisionBefore + 1);
  expect(persisted.status).toBe('confirmed');
  expect(saved.user.memory.candidates.filter((item) => item.id === confirmedId)).toHaveLength(1);
  expect(document.body.textContent).toContain('已记录这条成长规律');
  expect(getSpy).toHaveBeenCalledTimes(1);
});

test('暂不确认保留历史，不进入长期规律', async () => {
  await boot(seedData());
  const rejectButton = document.querySelector('#memoryActivationList [data-memory-action="reject"]');
  const rejectedId = rejectButton.getAttribute('data-memory-id');
  rejectButton.click();
  expect(document.getElementById('confirmedMemoryList').textContent).not.toContain('数据显示你可能正在形成专注习惯。');
  expect(activationText()).not.toContain('数据显示你可能正在形成专注习惯。');
  await waitForPersist();
  const saved = JSON.parse(localStorage.getItem('chenguangData'));

  expect(saved.user.memory.candidates.find((item) => item.id === rejectedId).status).toBe('rejected');
  expect(document.body.textContent).toContain('已暂不记录');
});

test('GrowthMemory confirmed 与 CoachMemory 短期洞察分区展示', async () => {
  await boot(seedData());

  expect(document.getElementById('confirmedMemoryList').textContent).toContain('你已形成稳定专注习惯。');
  expect(document.getElementById('memoryList').textContent).toContain('短期 Coach Memory 洞察。');
  expect(document.getElementById('memoryList').textContent).not.toContain('你已形成稳定专注习惯。');
});

test('AI Coach 不消费 pending candidate，也不会把候选描述为事实', async () => {
  await boot(seedData());
  const { default: AICoach } = await import('../js/aiCoach.js');
  const context = {
    growth: { trends: {}, strengths: [], risks: [] },
    growthState: {},
    goals: {},
    memory: {
      confirmed: [],
      candidates: [{
        id: 'candidate:fact_injection',
        type: 'Habit',
        content: '已经形成稳定习惯。',
        confidence: 0.9,
        status: 'pending',
        evidence: [{ source: 'Analytics', metric: 'focus', value: 1, timestamp: TODAY }]
      }]
    }
  };
  const coach = AICoach.buildCoachContext(context);

  expect(JSON.stringify(coach)).not.toContain('已经形成稳定习惯');
});
