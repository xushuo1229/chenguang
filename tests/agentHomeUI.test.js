'use strict';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createAgentHomeService, normalizeContext, normalizeInsights, normalizeReasoning } from '../js/agentHomeService.js';
import { createAgentHomeView } from '../js/agentHomeView.js';
import agentHomeHtml from '../agent-home.html?raw';

function contextResponse() {
  return {
    data: {
      version: 'learning-context-v1',
      userId: 1,
      readOnly: true,
      actionLevel: 'insight_only',
      behavior: {
        value: {
        taskSummary: { completed: 2, total: 4 },
        focusSummary: { minutes: 45, studyMinutes: 65, exerciseMinutes: 20 },
        streaks: { current: 3 },
        recent7: {
          focusMinutes: 120,
          current3FocusMinutes: 80,
          previous4FocusMinutes: 40,
          studyActiveDays: 4,
          current3StudyDays: 2,
          previous4StudyDays: 2,
        },
        },
        source: 'sync.activity',
        authority: 'deterministic_projection',
        type: 'behavior_summary',
        confidence: 1,
      },
      courseKnowledge: {
        value: {
          nodes: [{ title: 'Promise' }],
          evidence: [{ evidenceId: 'e1' }],
        },
        source: 'course_space',
        authority: 'source',
        type: 'course_knowledge_projection',
        confidence: 1,
      },
      knowledgeStates: {
        value: {
          strongTopics: [{ title: 'Async' }],
          weakTopics: [{ title: 'Promise' }],
          recentlyReviewed: [],
        },
        source: 'student_knowledge_states',
        authority: 'source',
        type: 'student_knowledge_state_projection',
        confidence: 1,
      },
      memories: {
        growth: {
          value: { available: true, items: [{ content: 'Morning study is stable' }] },
          source: 'cgstore.user.memory',
          authority: 'derived_memory',
          type: 'growth_memory_projection',
          confidence: 0.5,
        },
      },
    },
  };
}

function insightsResponse() {
  return {
    data: {
      version: 'agent-insight-v1',
      scope: 'agent_home',
      insights: [{
        id: 'knowledge-gap-detected',
        type: 'knowledge_gap_detected',
        title: 'Promise 当前掌握度较低。',
        explanation: '根据当前用户的 Knowledge State 记录生成。',
        source: 'student_knowledge_states',
        authority: 'source',
        evidence: [{
          source: 'student_knowledge_adapter',
          authority: 'source',
          metric: 'weakTopics[0].masteryLevel',
          period: 'current',
          value: 0.2,
        }],
        confidence: 1,
        actionLevel: 'insight_only',
      }],
      metadata: { readOnly: true, actionLevel: 'insight_only' },
    },
  };
}

function reasoningResponse() {
  return {
    data: {
      version: 'agent-reasoning-v1',
      generatedAt: '2026-09-18T00:00:00.000Z',
      userId: 1,
      scope: 'agent_home',
      available: true,
      summary: { title: '学习观察解释', narrative: '以下解释只基于已验证的结构化洞察。', insightCount: 1, evidenceCount: 1 },
      explanations: [{
        insightId: 'knowledge-gap-detected',
        insightType: 'knowledge_gap_detected',
        title: '为什么出现知识缺口观察？',
        why: '该观察聚合了当前用户 Knowledge State 中的薄弱主题。',
        evidenceRefs: [{
          insightId: 'knowledge-gap-detected',
          index: 0,
          source: 'student_knowledge_adapter',
          metric: 'weakTopics[0].masteryLevel',
          period: 'current',
        }],
        confidence: 1,
        actionLevel: 'insight_only',
      }],
      permissions: { read: ['deterministic_insights'], write: [] },
      metadata: { readOnly: true, actionLevel: 'insight_only', sourceInsightVersion: 'agent-insight-v1', contextVersion: 'learning-context-v1' },
    },
  };
}

function createClient() {
  return {
    agentHome: {
      context: vi.fn().mockResolvedValue(contextResponse()),
      insights: vi.fn().mockResolvedValue(insightsResponse()),
      reasoning: vi.fn().mockResolvedValue(reasoningResponse()),
    },
  };
}

function mount(service) {
  const target = document.createElement('main');
  document.body.appendChild(target);
  const view = createAgentHomeView({ target, service });
  return { target, view };
}

describe('agent home service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.textContent = '';
    document.head.querySelectorAll('#agent-home-view-style').forEach((node) => node.remove());
  });

  test('loads context and insights through the Agent API only', async () => {
    const client = createClient();
    const service = createAgentHomeService({ client });
    const result = await service.load();

    expect(client.agentHome.context).toHaveBeenCalledTimes(1);
    expect(client.agentHome.insights).toHaveBeenCalledTimes(1);
    expect(client.agentHome.reasoning).toHaveBeenCalledTimes(1);
    expect(result.context.version).toBe('learning-context-v1');
    expect(result.insights.version).toBe('agent-insight-v1');
    expect(result.reasoning.version).toBe('agent-reasoning-v1');
  });

  test('rejects writable or malformed agent contracts', () => {
    expect(() => normalizeContext({ data: { version: 'learning-context-v1', readOnly: false } })).toThrow('INVALID_AGENT_CONTEXT');
    expect(() => normalizeInsights({ data: { version: 'agent-insight-v1', insights: [], metadata: { readOnly: false } } })).toThrow('INVALID_AGENT_INSIGHTS');
    expect(() => normalizeInsights({ data: { version: 'agent-insight-v1', insights: [], metadata: { readOnly: true, actionLevel: 'review' } } })).toThrow('INVALID_AGENT_INSIGHTS');
    const writableReasoning = reasoningResponse();
    writableReasoning.data.permissions.write = ['todos'];
    expect(() => normalizeReasoning(writableReasoning)).toThrow('INVALID_AGENT_REASONING');
    const emptySuccessfulReasoning = reasoningResponse();
    emptySuccessfulReasoning.data.explanations = [];
    expect(() => normalizeReasoning(emptySuccessfulReasoning)).toThrow('INVALID_AGENT_REASONING');
  });
});

describe('agent home UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.textContent = '';
    document.head.querySelectorAll('#agent-home-view-style').forEach((node) => node.remove());
  });

  test('shows loading state while API requests are pending', () => {
    const service = { load: vi.fn().mockReturnValue(new Promise(() => {})) };
    const { view } = mount(service);
    view.load();

    expect(view.status.textContent).toBe('正在加载 Agent Home...');
    expect(view.root.getAttribute('aria-busy')).toBe('true');
  });

  test('renders read-only sections, authority labels and evidence-backed insight', async () => {
    const service = { load: vi.fn().mockResolvedValue({
      context: contextResponse().data,
      insights: insightsResponse().data,
      reasoning: reasoningResponse().data,
    }) };
    const { target, view } = mount(service);
    await view.load();
    const text = target.textContent;

    expect(view.status.textContent).toBe('');
    expect(text).toContain('Learning Overview');
    expect(text).toContain('今日任务：2/4 完成');
    expect(text).toContain('Course Intelligence');
    expect(text).toContain('Promise');
    expect(text).toContain('Knowledge State');
    expect(text).toContain('Growth Context');
    expect(text).toContain('来自学习行为记录 · deterministic_projection');
    expect(text).toContain('来自课程知识库 · source');
    expect(text).toContain('来自成长记忆（派生记忆） · derived_memory');
    expect(text).toContain('Promise 当前掌握度较低。');
    expect(text).toContain('weakTopics[0].masteryLevel · current：0.2');
    expect(text).toContain('student_knowledge_adapter · source');
    expect(text).toContain('Reasoning Explanation');
    expect(text).toContain('Why：该观察聚合了当前用户 Knowledge State 中的薄弱主题。');
    expect(text).toContain('置信度：1.00');
    expect(text).toContain('weakTopics[0].masteryLevel · current');
    expect(text).toContain('来自确定性洞察 · insight_only');
    expect(target.querySelectorAll('button')).toHaveLength(0);
    expect(target.querySelectorAll('form')).toHaveLength(0);
  });

  test('falls back safely when reasoning API is unavailable', async () => {
    const client = createClient();
    client.agentHome.reasoning = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    const service = createAgentHomeService({ client });
    const result = await service.load();
    const { target, view } = mount(service);
    await view.load();

    expect(result.reasoning.available).toBe(false);
    expect(result.reasoning.reason).toBe('reasoning_unavailable');
    expect(view.status.textContent).toBe('');
    expect(target.textContent).toContain('Reasoning Explanation');
    expect(target.textContent).toContain('暂无推理解释。');
  });

  test('shows meaningful empty state without inventing data', async () => {
    const service = { load: vi.fn().mockResolvedValue({
      context: {
        version: 'learning-context-v1', readOnly: true,
        behavior: { value: { taskSummary: {}, focusSummary: {}, streaks: {} }, source: 'sync.activity', authority: 'deterministic_projection' },
        courseKnowledge: { value: { nodes: [], evidence: [] }, source: 'course_space', authority: 'source' },
        knowledgeStates: { value: {}, source: 'student_knowledge_states', authority: 'source' },
        memories: { growth: { value: { available: false, items: [] }, source: 'cgstore.user.memory', authority: 'derived_memory' } },
      },
      insights: { version: 'agent-insight-v1', insights: [], metadata: { readOnly: true } },
      reasoning: { version: 'agent-reasoning-v1', available: false, explanations: [], permissions: { write: [] }, metadata: { readOnly: true, actionLevel: 'insight_only' } },
    }) };
    const { target, view } = mount(service);
    await view.load();

    expect(view.status.textContent).toBe('');
    expect(target.textContent).toContain('今日任务：0/0 完成');
    expect(target.textContent).toContain('暂无课程知识');
    expect(target.textContent).toContain('暂无成长记忆');
    expect(target.textContent).toContain('暂无足够数据生成洞察。');
    expect(target.textContent).toContain('暂无推理解释。');
  });

  test('shows friendly API error without exposing internals', async () => {
    const service = { load: vi.fn().mockRejectedValue(new Error('Provider stack: secret-detail')) };
    const { target, view } = mount(service);
    await view.load();

    expect(view.status.textContent).toBe('Agent Home 暂时不可用，请稍后再试。');
    expect(target.textContent).not.toContain('Provider stack');
    expect(target.textContent).not.toContain('secret-detail');
  });

  test('uses mobile-first responsive MPA shell without new frameworks', () => {
    expect(agentHomeHtml).toContain('name="viewport"');
    expect(agentHomeHtml).toContain('@media (max-width: 760px)');
    expect(agentHomeHtml).toContain('mobile-tabbar');
    expect(agentHomeHtml).toContain('/calm-dawn-1to1.css');
    expect(agentHomeHtml).toContain('/xingzhixing.css');
    expect(agentHomeHtml).toContain('js/shellBootstrap.js');
    expect(agentHomeHtml).toContain('/js/agentHome.js');
    expect(agentHomeHtml).not.toMatch(/react|vue/i);
  });
});
