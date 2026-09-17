'use strict';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mountTodayReflection } from '../js/aiReflectionUI.js';
import { createAiReflectionFeedbackService } from '../js/aiReflectionFeedbackService.js';

vi.mock('../js/apiClient.js', () => ({
  default: {
    ai: {
      reflectionFeedback: vi.fn()
    }
  }
}));

const CGAPI = (await import('../js/apiClient.js')).default;

const SUCCESS_REFLECTION = {
  reflection: {
    summary: { title: '稳步推进', overview: '今天完成 3/4 项任务。' },
    insights: [{ type: 'trend', content: '专注节奏保持稳定。' }],
    suggestions: [{ priority: 'high', content: '明天先完成核心任务。' }]
  },
  reflectionId: 'rf_00000000-0000-4000-8000-000000000000',
  meta: {}
};

function mount() {
  const target = document.createElement('main');
  target.className = 'main';
  document.body.appendChild(target);
  const service = { generate: vi.fn() };
  const feedbackService = { submit: vi.fn() };
  const ui = mountTodayReflection({ target, service, feedbackService });
  return { ui, service, feedbackService };
}

async function mountWithSuccess() {
  const mounted = mount();
  mounted.service.generate.mockResolvedValue(SUCCESS_REFLECTION);
  await mounted.ui.generate();
  return mounted;
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AI reflection feedback service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('submits a valid rating through the shared API client', async () => {
    CGAPI.ai.reflectionFeedback.mockResolvedValue({ success: true });
    const service = createAiReflectionFeedbackService();

    await service.submit({
      reflectionId: 'rf_00000000-0000-4000-8000-000000000000',
      rating: 'helpful'
    });

    expect(CGAPI.ai.reflectionFeedback).toHaveBeenCalledWith({
      reflectionId: 'rf_00000000-0000-4000-8000-000000000000',
      rating: 'helpful',
      timeoutMs: 10000
    });
  });

  test('rejects invalid ratings without calling the API', async () => {
    const service = createAiReflectionFeedbackService();
    await expect(service.submit({
      reflectionId: 'rf_00000000-0000-4000-8000-000000000000',
      rating: 'invalid'
    })).rejects.toThrow('INVALID_RATING');
    expect(CGAPI.ai.reflectionFeedback).not.toHaveBeenCalled();
  });

  test('rejects malformed success responses', async () => {
    CGAPI.ai.reflectionFeedback.mockResolvedValue({ data: {} });
    const service = createAiReflectionFeedbackService();
    await expect(service.submit({
      reflectionId: 'rf_00000000-0000-4000-8000-000000000000',
      rating: 'not_helpful'
    })).rejects.toThrow('INVALID_FEEDBACK_RESPONSE');
  });
});

describe('AI reflection feedback UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.textContent = '';
    document.head.querySelectorAll('#ai-reflection-ui-style').forEach((node) => node.remove());
  });

  test('hides feedback buttons until a reflection is successfully generated', async () => {
    const { ui, service } = mount();
    expect(ui.feedbackSection.hidden).toBe(true);

    service.generate.mockResolvedValue(SUCCESS_REFLECTION);
    await ui.generate();
    expect(ui.feedbackSection.hidden).toBe(false);
    expect(ui.helpfulButton.textContent).toContain('有帮助');
    expect(ui.notHelpfulButton.textContent).toContain('不太符合');
  });

  test('submits helpful feedback after a button click and shows success', async () => {
    const { ui, feedbackService } = await mountWithSuccess();
    let resolveSubmit;
    feedbackService.submit.mockReturnValue(new Promise((resolve) => {
      resolveSubmit = resolve;
    }));

    ui.helpfulButton.click();
    expect(feedbackService.submit).toHaveBeenCalledWith({
      reflectionId: SUCCESS_REFLECTION.reflectionId,
      rating: 'helpful'
    });
    expect(ui.status.textContent).toBe('正在提交反馈...');
    expect(ui.helpfulButton.disabled).toBe(true);
    expect(ui.notHelpfulButton.disabled).toBe(true);

    resolveSubmit({ success: true });
    await flushAsync();
    expect(ui.status.textContent).toBe('感谢你的反馈');
    expect(ui.feedbackSection.hidden).toBe(true);
  });

  test('submits not_helpful feedback and shows a friendly error on failure', async () => {
    const { ui, feedbackService } = await mountWithSuccess();
    let rejectSubmit;
    feedbackService.submit.mockReturnValue(new Promise((resolve, reject) => {
      rejectSubmit = reject;
    }));

    ui.notHelpfulButton.click();
    expect(feedbackService.submit).toHaveBeenCalledWith({
      reflectionId: SUCCESS_REFLECTION.reflectionId,
      rating: 'not_helpful'
    });
    expect(ui.status.textContent).toBe('正在提交反馈...');
    expect(ui.helpfulButton.disabled).toBe(true);
    expect(ui.notHelpfulButton.disabled).toBe(true);

    rejectSubmit(new Error('Provider stack: secret-detail'));
    await flushAsync();
    expect(ui.status.textContent).toBe('反馈提交失败，请稍后再试');
    expect(ui.root.textContent).not.toContain('Provider stack');
    expect(ui.helpfulButton.disabled).toBe(false);
    expect(ui.notHelpfulButton.disabled).toBe(false);
  });
});
