'use strict';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCourseSpaceExtractionUI } from '../js/courseSpaceExtractionUI.js';

function createService() {
  return {
    load: vi.fn(),
    createJob: vi.fn(),
    reviewCandidate: vi.fn()
  };
}

const loaded = {
  snapshot: {
    courses: [{ id: 'course-1', name: '数据结构' }],
    documents: [{ id: 'doc-1', title: '<script>Lecture</script>' }]
  },
  jobs: [{ id: 'job-1', documentId: 'doc-1', status: 'completed', error: '' }],
  candidates: [{
    id: 'candidate-1',
    documentId: 'doc-1',
    documentVersion: 3,
    title: 'Closure',
    content: 'A function bundled with scope.',
    type: 'definition',
    confidence: 0.86
  }],
  evidenceById: {
    'candidate-1': [{
      locator: 'section 1.2',
      quote: 'A closure keeps access to its outer scope.',
      verificationStatus: 'verified',
      version: 3
    }]
  }
};

describe('course space extraction UI', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  test('renders candidates, evidence-safe text, jobs and empty states', async () => {
    const service = createService();
    service.load.mockResolvedValueOnce(loaded);
    const ui = createCourseSpaceExtractionUI({ service });
    document.body.appendChild(ui.root);
    await ui.load();
    expect(ui.courseSelect.textContent).toContain('数据结构');
    expect(ui.documentSelect.textContent).toContain('<script>Lecture</script>');
    expect(ui.reviewList.textContent).toContain('Closure');
    expect(ui.reviewList.textContent).toContain('来源文档：<script>Lecture</script> · 版本：3');
    expect(ui.reviewList.textContent).toContain('定位：section 1.2');
    expect(ui.reviewList.textContent).toContain('证据：A closure keeps access to its outer scope.');
    expect(ui.reviewList.textContent).toContain('证据状态：已验证');
    expect(ui.reviewList.querySelector('input').maxLength).toBe(200);
    expect(ui.reviewList.querySelector('textarea').maxLength).toBe(5000);
    expect(ui.reviewList.querySelector('script')).toBeNull();
    expect(ui.jobList.textContent).toContain('completed');

    service.load.mockResolvedValueOnce({ snapshot: { courses: [], documents: [] }, jobs: [], candidates: [] });
    await ui.load();
    expect(ui.reviewList.textContent).toContain('没有待审核的知识候选。');
    expect(ui.jobList.textContent).toContain('还没有提取任务。');
  });

  test('shows loading, sends a bounded job request and refreshes', async () => {
    const service = createService();
    service.load.mockResolvedValueOnce(loaded);
    const ui = createCourseSpaceExtractionUI({ service });
    document.body.appendChild(ui.root);
    await ui.load();
    ui.courseSelect.value = 'course-1';
    ui.documentSelect.value = 'doc-1';
    service.load.mockResolvedValueOnce(loaded);
    service.createJob.mockResolvedValueOnce({ data: { id: 'job-2' } });
    await ui.createJob();
    expect(service.createJob).toHaveBeenCalledWith({ courseId: 'course-1', documentId: 'doc-1' });
    expect(ui.extractButton.disabled).toBe(false);
  });

  test('accepts a candidate and surfaces friendly errors without internals', async () => {
    const service = createService();
    service.load.mockResolvedValueOnce(loaded);
    const ui = createCourseSpaceExtractionUI({ service });
    document.body.appendChild(ui.root);
    await ui.load();
    service.reviewCandidate.mockResolvedValueOnce({ data: {} });
    service.load.mockResolvedValueOnce(loaded);
    const titleInput = ui.reviewList.querySelector('input');
    const contentInput = ui.reviewList.querySelector('textarea');
    titleInput.value = 'Closure (reviewed)';
    contentInput.value = 'Reviewed definition.';
    ui.reviewList.querySelector('button').click();
    await Promise.resolve();
    expect(service.reviewCandidate).toHaveBeenCalledWith('candidate-1', {
      action: 'accept', title: 'Closure (reviewed)', content: 'Reviewed definition.'
    });

    const rejecting = createService();
    rejecting.load.mockResolvedValueOnce(loaded);
    rejecting.reviewCandidate.mockRejectedValueOnce(new Error('SQLITE_CONSTRAINT /secret'));
    const rejectUi = createCourseSpaceExtractionUI({ service: rejecting });
    document.body.appendChild(rejectUi.root);
    await rejectUi.load();
    rejectUi.reviewList.querySelectorAll('button')[1].click();
    await Promise.resolve();
    await Promise.resolve();
    expect(rejecting.reviewCandidate).toHaveBeenCalledWith('candidate-1', { action: 'reject' });
    expect(rejectUi.status.textContent).toBe('审核暂时失败，请稍后再试。');
    expect(rejectUi.root.textContent).not.toContain('/secret');

    const failing = createService();
    failing.load.mockRejectedValue(new Error('SQLite path /secret/db'));
    const failedUi = createCourseSpaceExtractionUI({ service: failing });
    document.body.appendChild(failedUi.root);
    await failedUi.load();
    expect(failedUi.status.textContent).toBe('知识提取暂时不可用，请稍后再试。');
    expect(failedUi.root.textContent).not.toContain('/secret/db');
  });
});
