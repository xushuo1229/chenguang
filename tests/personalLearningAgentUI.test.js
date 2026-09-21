import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createAgentHomeView } from '../js/agentHomeView.js';

function loadPayload() {
  return {
    context: {
      version: 'learning-context-v1',
      readOnly: true,
      courses: { value: [{ courseId: 'course-1', name: 'JavaScript' }] },
      behavior: { value: {}, source: 'sync.activity', authority: 'deterministic_projection' },
      courseKnowledge: { value: { nodes: [], evidence: [] }, source: 'course_space', authority: 'source' },
      knowledgeStates: { value: {}, source: 'student_knowledge_states', authority: 'source' },
      memories: { growth: { value: { available: false, items: [] }, source: 'cgstore.user.memory', authority: 'derived_memory' } },
    },
    insights: { version: 'agent-insight-v1', insights: [], metadata: { readOnly: true, actionLevel: 'insight_only' } },
    reasoning: { version: 'agent-reasoning-v1', available: false, explanations: [], permissions: { write: [] }, metadata: { readOnly: true, actionLevel: 'insight_only' } },
  };
}

function overview() {
  return {
    version: 'personal-learning-agent-v2',
    perception: {
      stateCounts: { no_state: 1 },
      riskCounts: { watch: 1 },
      nextBestRecommendation: { nodeTitle: 'Promise', recommendedMode: 'assessment' },
    },
    plan: { blocks: [{ knowledgeNodeId: 'node-1', nodeTitle: 'Promise', kind: 'assessment' }] },
    metadata: { readOnly: true, autonomous: false },
  };
}

function confirmedAction() {
  return {
    version: 'personal-learning-agent-v2',
    proposal: { id: 'proposal-1', nodeTitle: 'Promise', kind: 'assessment' },
    action: {
      type: 'start_assessment',
      assessment: {
        version: 'assessment-result-v1',
        courseId: 'course-1',
        knowledgeNodeId: 'node-1',
        items: [{ itemId: 'assessment:node-1', kind: 'concept_recall', prompt: '请解释「Promise」。' }],
      },
    },
    metadata: { userConfirmed: true },
  };
}

describe('personal learning agent UI', () => {
  beforeEach(() => {
    document.body.textContent = '';
    document.head.querySelectorAll('#agent-home-view-style').forEach((node) => node.remove());
  });

  test('loads overview and confirms explicit next action', async () => {
    const payload = loadPayload();
    const overviewFn = vi.fn().mockResolvedValue(overview());
    const confirmFn = vi.fn().mockResolvedValue(confirmedAction());
    const submitFn = vi.fn().mockResolvedValue({
      assessment: { version: 'assessment-result-v1', score: 1 },
      mastery: { state: 'learning' },
    });
    const service = {
      load: vi.fn().mockResolvedValue(payload),
      learningAgentOverview: overviewFn,
      confirmLearningNextAction: confirmFn,
      submitAssessment: submitFn,
    };
    const target = document.createElement('main');
    document.body.appendChild(target);
    const view = createAgentHomeView({ target, service });
    await view.load();

    const loadButton = [...target.querySelectorAll('button')].find((node) => node.textContent === '加载学习概览');
    loadButton.click();
    await vi.waitFor(() => expect(target.textContent).toContain('下一步：Promise'));
    expect(overviewFn).toHaveBeenCalledWith('course-1', 60);

    const confirmButton = [...target.querySelectorAll('button')].find((node) => node.textContent === '确认下一个行动');
    confirmButton.click();
    await vi.waitFor(() => expect(target.querySelector('textarea')).toBeTruthy());
    expect(confirmFn).toHaveBeenCalledWith('course-1');
    target.querySelector('textarea').value = 'It represents an eventual value.';
    target.querySelector('.agent-assessment-form button').click();
    await vi.waitFor(() => expect(target.textContent).toContain('评估完成'));
    expect(submitFn).toHaveBeenCalledWith(expect.objectContaining({
      confirmed: true,
      courseId: 'course-1',
      knowledgeNodeId: 'node-1',
      proposalId: 'proposal-1',
    }));
  });

  test('provides accessible input and cancel safely without execution', async () => {
    const service = {
      load: vi.fn().mockResolvedValue(loadPayload()),
      askLearningConversation: vi.fn(),
      learningAgentOverview: vi.fn().mockResolvedValue(overview()),
      confirmLearningNextAction: vi.fn().mockResolvedValue(confirmedAction()),
      submitAssessment: vi.fn(),
    };
    const target = document.createElement('main');
    document.body.appendChild(target);
    const view = createAgentHomeView({ target, service });
    await view.load();

    expect(target.querySelector('input[name="query"]').getAttribute('aria-label')).toBe('学习问题');
    [...target.querySelectorAll('button')].find((node) => node.textContent === '加载学习概览').click();
    await vi.waitFor(() => expect(target.textContent).toContain('下一步：Promise'));
    expect(target.querySelector('[aria-label="确认执行下一个学习行动"]')).toBeTruthy();
    [...target.querySelectorAll('button')].find((node) => node.textContent === '确认下一个行动').click();
    await vi.waitFor(() => expect(target.querySelector('textarea').getAttribute('aria-label')).toBe('请作答：请解释「Promise」。'));

    [...target.querySelectorAll('button')].find((node) => node.textContent === '取消').click();
    expect(target.textContent).toContain('已取消当前行动，未执行任何修改。');
    expect(target.querySelector('textarea')).toBeNull();
    expect(service.submitAssessment).not.toHaveBeenCalled();
  });

  test('shows friendly assessment failure without provider details', async () => {
    const service = {
      load: vi.fn().mockResolvedValue(loadPayload()),
      learningAgentOverview: vi.fn().mockResolvedValue(overview()),
      confirmLearningNextAction: vi.fn().mockResolvedValue(confirmedAction()),
      submitAssessment: vi.fn().mockRejectedValue(new Error('Provider secret-detail')),
    };
    const target = document.createElement('main');
    document.body.appendChild(target);
    const view = createAgentHomeView({ target, service });
    await view.load();

    [...target.querySelectorAll('button')].find((node) => node.textContent === '加载学习概览').click();
    await vi.waitFor(() => expect(target.textContent).toContain('下一步：Promise'));
    [...target.querySelectorAll('button')].find((node) => node.textContent === '确认下一个行动').click();
    await vi.waitFor(() => expect(target.querySelector('textarea')).toBeTruthy());
    target.querySelector('textarea').value = 'It represents an eventual value.';
    target.querySelector('.agent-assessment-form button').click();
    await vi.waitFor(() => expect(target.textContent).toContain('评估提交暂时不可用，请稍后再试。'));
    expect(target.textContent).not.toContain('Provider');
    expect(target.textContent).not.toContain('secret-detail');
  });
});
