'use strict';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mountTodayReflection } from '../js/aiReflectionUI.js';
import { createAiReflectionService } from '../js/aiReflectionService.js';

vi.mock('../js/apiClient.js', () => ({
  default: {
    ai: {
      reflection: vi.fn()
    }
  }
}));

const CGAPI = (await import('../js/apiClient.js')).default;

function mount() {
  const target = document.createElement('main');
  target.className = 'main';
  document.body.appendChild(target);
  const service = { generate: vi.fn() };
  const ui = mountTodayReflection({ target, service });
  return { target, service, ui };
}

describe('AI reflection service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('uses POST /api/ai/reflection through the shared API client and normalizes response', async () => {
    CGAPI.ai.reflection.mockResolvedValue({
      data: { reflection: { summary: { title: 'ok' } } },
      meta: { contextVersion: '1.0' }
    });
    const service = createAiReflectionService();
    const context = { version: '1.0' };
    const result = await service.generate(context);

    expect(CGAPI.ai.reflection).toHaveBeenCalledWith({
      context,
      timeoutMs: 35000
    });
    expect(result.reflection.summary.title).toBe('ok');
    expect(result.meta.contextVersion).toBe('1.0');
  });

  test('rejects malformed success responses', async () => {
    CGAPI.ai.reflection.mockResolvedValue({ data: {} });
    const service = createAiReflectionService();
    await expect(service.generate({})).rejects.toThrow('INVALID_REFLECTION_RESPONSE');
  });
});

describe('AI reflection UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.textContent = '';
    document.head.querySelectorAll('#ai-reflection-ui-style').forEach((node) => node.remove());
  });

  test('renders the idle entry without requesting AI', () => {
    const { ui } = mount();
    expect(ui.root.getAttribute('aria-label')).toBe('AI 今日复盘');
    expect(ui.status.textContent).toContain('还没有生成今日复盘');
    expect(ui.content.textContent).toContain('点击按钮');
    expect(ui.button.textContent).toBe('生成今日反思');
  });

  test('shows loading while the request is in flight', async () => {
    const { ui, service } = mount();
    service.generate.mockReturnValue(new Promise(() => {}));
    ui.generate();
    await Promise.resolve();
    expect(service.generate).toHaveBeenCalledTimes(1);
    expect(ui.status.textContent).toBe('正在生成今日反思...');
    expect(ui.button.disabled).toBe(true);
    expect(ui.root.getAttribute('aria-busy')).toBe('true');
  });

  test('renders summary, observations and suggestions on success', async () => {
    const { ui, service } = mount();
    service.generate.mockResolvedValue({
      reflection: {
        summary: { title: '稳步推进', overview: '今天完成 3/4 项任务。' },
        performance: {
          tasks: { total: 4, completed: 3 },
          focus: { minutes: 120 },
          learning: { studyMinutes: 45 }
        },
        insights: [{ type: 'trend', content: '专注节奏保持稳定。' }],
        suggestions: [{ priority: 'high', content: '明天先完成核心任务。' }]
      },
      meta: {}
    });

    await ui.generate();
    const text = ui.content.textContent;
    expect(ui.status.textContent).toBe('');
    expect(text).toContain('任务 3/4');
    expect(text).toContain('专注 120 分钟');
    expect(text).toContain('学习 45 分钟');
    expect(text).toContain('稳步推进');
    expect(text).toContain('今天完成 3/4 项任务。');
    expect(text).toContain('成长观察');
    expect(text).toContain('专注节奏保持稳定。');
    expect(text).toContain('明日建议');
    expect(text).toContain('明天先完成核心任务。');
  });

  test('shows a friendly error without exposing provider details', async () => {
    const { ui, service } = mount();
    service.generate.mockRejectedValue(new Error('Provider stack: secret-detail'));
    await ui.generate();
    expect(ui.status.textContent).toBe('AI 复盘暂时不可用，请稍后再试。');
    expect(ui.root.textContent).not.toContain('Provider stack');
    expect(ui.button.disabled).toBe(false);
  });

  test('shows a meaningful empty state for empty AI content', async () => {
    const { ui, service } = mount();
    service.generate.mockResolvedValue({
      reflection: { summary: {}, insights: [], suggestions: [] },
      meta: {}
    });
    await ui.generate();
    expect(ui.status.textContent).toContain('暂无足够内容');
    expect(ui.content.textContent).toContain('先记录或完成今天的计划');
  });
});
