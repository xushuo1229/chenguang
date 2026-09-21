import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPersonalAgentExperience } from '../js/personalAgentExperience.js';

function context() {
  return {
    version: 'learning-context-v1',
    readOnly: true,
    courses: { value: [{ courseId: 'course-1', name: 'JavaScript' }] },
    behavior: {
      value: { taskSummary: { completed: 2, total: 4 }, focusSummary: { minutes: 45 } },
      source: 'sync.activity',
      authority: 'deterministic_projection',
    },
    courseKnowledge: { value: { nodes: [], evidence: [] }, source: 'course_space', authority: 'source' },
    knowledgeStates: {
      value: { weakTopics: [{ title: 'Promise' }], strongTopics: [] },
      source: 'student_knowledge_states',
      authority: 'source',
    },
    memories: { growth: { value: { available: false, items: [] }, source: 'cgstore.user.memory', authority: 'derived_memory' } },
  };
}

function insights() {
  return {
    version: 'agent-insight-v1',
    insights: [],
    metadata: { readOnly: true, actionLevel: 'insight_only' },
  };
}

function reasoning() {
  return {
    version: 'agent-reasoning-v1',
    available: true,
    explanations: [{ title: '学习观察解释', why: '该观察来自当前学习状态。', evidenceRefs: [], confidence: 1 }],
    permissions: { read: ['deterministic_insights'], write: [] },
    metadata: { readOnly: true, actionLevel: 'insight_only' },
  };
}

function overview() {
  return {
    version: 'personal-learning-agent-v2',
    courseId: 'course-1',
    perception: {
      stateCounts: { no_state: 1 },
      riskCounts: { watch: 1 },
      nextBestRecommendation: {
        nodeTitle: 'Promise',
        state: 'no_state',
        masteryLevel: 0,
        dueNow: true,
        recommendedMode: 'assessment',
        reasons: ['state:no_state', 'due_now'],
      },
    },
    plan: {
      blocks: [{
        knowledgeNodeId: 'node-1',
        nodeTitle: 'Promise',
        kind: 'assessment',
        minutes: 8,
        reason: 'missing_assessment_evidence',
      }],
    },
    metadata: { readOnly: true, autonomous: false },
  };
}

function confirmedAction() {
  return {
    version: 'personal-learning-agent-v2',
    status: 'action_ready',
    proposal: { id: 'proposal-1', kind: 'assessment' },
    action: {
      type: 'start_assessment',
      assessment: {
        version: 'assessment-result-v1',
        courseId: 'course-1',
        knowledgeNodeId: 'node-1',
        items: [{ itemId: 'assessment:node-1', prompt: '请解释 Promise。' }],
      },
    },
    metadata: { userConfirmed: true },
  };
}

describe('personal agent experience', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  test('renders the agent loop from validated context and overview', async () => {
    const service = {
      load: vi.fn().mockResolvedValue({ context: context(), insights: insights(), reasoning: reasoning() }),
      learningAgentOverview: vi.fn().mockResolvedValue(overview()),
      confirmLearningNextAction: vi.fn(),
      submitAssessment: vi.fn(),
    };
    const host = document.createElement('section');
    document.body.appendChild(host);
    const experience = createPersonalAgentExperience({ target: host, service, greeting: '晚上好。' });
    const result = await experience.load();

    expect(result.status).toBe('ready');
    expect(host.textContent).toContain('晚上好。');
    expect(host.textContent).not.toContain('null');
    expect(host.textContent).toContain('发现：Promise处于未开始状态。');
    expect(host.textContent).toContain('该观察来自当前学习状态。');
    expect(host.textContent).toContain('建议评估「Promise」。');
    expect(host.textContent).toContain('薄弱领域');
    expect(host.textContent).toContain('Promise');
    expect(host.textContent).toContain('任务完成：2/4');
    expect(host.textContent).toContain('Action Proposal');
  });

  test('confirms an action and submits assessment feedback explicitly', async () => {
    const service = {
      load: vi.fn().mockResolvedValue({ context: context(), insights: insights(), reasoning: reasoning() }),
      learningAgentOverview: vi.fn().mockResolvedValue(overview()),
      confirmLearningNextAction: vi.fn().mockResolvedValue(confirmedAction()),
      submitAssessment: vi.fn().mockResolvedValue({
        assessment: { version: 'assessment-result-v1', score: 0.9 },
        mastery: { state: 'learning' },
      }),
    };
    const host = document.createElement('section');
    document.body.appendChild(host);
    const experience = createPersonalAgentExperience({ target: host, service });
    await experience.load();
    host.querySelector('.personal-agent-button').click();
    await vi.waitFor(() => expect(host.querySelector('.personal-agent-assessment')).toBeTruthy());
    expect(service.confirmLearningNextAction).toHaveBeenCalledWith('course-1');

    host.querySelectorAll('.personal-agent-actions .personal-agent-button')[1].click();
    expect(host.querySelector('.personal-agent-assessment')).toBeNull();
    expect(host.textContent).toContain('已取消当前行动，未执行任何修改。');

    host.querySelector('.personal-agent-button').click();
    await vi.waitFor(() => expect(host.querySelector('.personal-agent-assessment')).toBeTruthy());

    const textarea = host.querySelector('textarea');
    textarea.value = 'A Promise represents an eventual value.';
    host.querySelector('.personal-agent-assessment').dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(host.textContent).toContain('评估完成：得分 0.90'));
    expect(service.submitAssessment).toHaveBeenCalledWith(expect.objectContaining({
      confirmed: true,
      courseId: 'course-1',
      knowledgeNodeId: 'node-1',
      proposalId: 'proposal-1',
    }));
  });

  test('keeps no-course and unavailable states bounded', async () => {
    const emptyService = {
      load: vi.fn().mockResolvedValue({
        context: context(),
        insights: insights(),
        reasoning: reasoning(),
      }),
      learningAgentOverview: vi.fn(),
    };
    emptyService.load.mockResolvedValueOnce({
      context: { ...context(), courses: { value: [] } },
      insights: insights(),
      reasoning: reasoning(),
    });
    const emptyHost = document.createElement('section');
    document.body.appendChild(emptyHost);
    const emptyExperience = createPersonalAgentExperience({ target: emptyHost, service: emptyService });
    await emptyExperience.load();
    expect(emptyHost.textContent).toContain('还没有可用的学习课程');

    const failingService = {
      load: vi.fn().mockRejectedValue(new Error('Provider stack secret-detail')),
      learningAgentOverview: vi.fn(),
    };
    const failingHost = document.createElement('section');
    document.body.appendChild(failingHost);
    const failingExperience = createPersonalAgentExperience({ target: failingHost, service: failingService });
    await failingExperience.load();
    expect(failingHost.textContent).toContain('个人 Agent 暂时不可用');
    expect(failingHost.textContent).not.toContain('Provider stack secret-detail');
  });
});
