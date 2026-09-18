'use strict';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCourseSpaceService } from '../js/courseSpaceService.js';
import { createCourseSpaceUI } from '../js/courseSpaceUI.js';
import CGAPI from '../js/apiClient.js';

vi.mock('../js/apiClient.js', () => ({
  default: {
    courseSpace: {
      snapshot: vi.fn(),
      search: vi.fn(),
      createDocument: vi.fn(),
      createNode: vi.fn(),
      createRelation: vi.fn(),
      createEvidence: vi.fn()
    },
    knowledgeState: {
      list: vi.fn()
    }
  }
}));

const snapshot = {
  data: {
    courses: [{ id: 'course-1', name: '数据结构' }],
    documents: [{ id: 'doc-1', title: 'Lecture 01' }],
    nodes: [{ id: 'node-1', title: 'Closure', kind: 'concept', definition: 'A function and scope.' }],
    relations: [{ id: 'rel-1' }],
    evidence: [{ id: 'ev-1', quote: 'Closure keeps scope.' }]
  }
};

const searchResult = {
  data: {
    query: 'closure',
    courses: snapshot.data.courses,
    documents: snapshot.data.documents,
    nodes: snapshot.data.nodes,
    evidence: snapshot.data.evidence
  }
};

describe('course space service', () => {
  beforeEach(() => vi.clearAllMocks());

  test('uses shared API client for snapshot and bounded search', async () => {
    CGAPI.courseSpace.snapshot.mockResolvedValue(snapshot);
    CGAPI.courseSpace.search.mockResolvedValue(searchResult);
    const service = createCourseSpaceService();
    await service.snapshot('course-1');
    await service.search({ query: 'closure', courseId: 'course-1', limit: 10 });
    expect(CGAPI.courseSpace.snapshot).toHaveBeenCalledWith('course-1');
    expect(CGAPI.courseSpace.search).toHaveBeenCalledWith({
      query: 'closure', courseId: 'course-1', limit: 10
    });
    CGAPI.knowledgeState.list.mockResolvedValue({ data: { states: [] } });
    await service.knowledgeState('course-1', { limit: 10 });
    expect(CGAPI.knowledgeState.list).toHaveBeenCalledWith('course-1', { limit: 10 });
  });
});

describe('course space UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.textContent = '';
    document.head.querySelectorAll('#course-space-ui-style').forEach((node) => node.remove());
  });

  test('renders course names, counts and knowledge safely', async () => {
    CGAPI.courseSpace.snapshot.mockResolvedValue(snapshot);
    const ui = createCourseSpaceUI();
    document.body.appendChild(ui.root);
    await ui.loadSnapshot();
    expect(CGAPI.courseSpace.snapshot).toHaveBeenCalledWith('');
    expect(ui.summary.textContent).toContain('文档 1');
    expect(ui.summary.textContent).toContain('知识节点 1');
    expect(ui.summary.textContent).toContain('关系 1');
    expect(ui.summary.textContent).toContain('证据 1');
    expect(ui.courseSelect.textContent).toContain('数据结构');
    expect(ui.results.textContent).toContain('Closure');
    expect(ui.results.querySelector('script')).toBeNull();
  });

  test('shows loading during search and renders matching evidence', async () => {
    CGAPI.courseSpace.snapshot.mockResolvedValue(snapshot);
    let resolveSearch;
    CGAPI.courseSpace.search.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));
    const ui = createCourseSpaceUI();
    document.body.appendChild(ui.root);
    await ui.loadSnapshot();
    ui.searchInput.value = 'closure';
    const searchPromise = ui.search();
    expect(ui.searchButton.disabled).toBe(true);
    resolveSearch(searchResult);
    await searchPromise;
    expect(CGAPI.courseSpace.search).toHaveBeenCalledWith({ query: 'closure', courseId: '', limit: 10 });
    expect(ui.results.textContent).toContain('Closure keeps scope.');
    expect(ui.searchButton.disabled).toBe(false);
  });

  test('shows friendly error without exposing internal details', async () => {
    CGAPI.courseSpace.snapshot.mockRejectedValue(new Error('SQLite path /secret/db'));
    const ui = createCourseSpaceUI();
    document.body.appendChild(ui.root);
    await ui.loadSnapshot();
    expect(ui.status.textContent).toBe('课程空间暂时不可用，请稍后再试。');
    expect(ui.root.textContent).not.toContain('/secret/db');
  });

  test('renders bounded knowledge state preview', async () => {
    CGAPI.courseSpace.snapshot.mockResolvedValue(snapshot);
    CGAPI.knowledgeState.list.mockResolvedValue({
      data: {
        states: [{
          nodeTitle: 'Promise',
          masteryLevel: 0.65,
          confidence: 0.5,
          state: 'learning',
          evidenceCount: 2
        }]
      }
    });
    const ui = createCourseSpaceUI();
    document.body.appendChild(ui.root);
    await ui.loadSnapshot();
    ui.courseSelect.value = 'course-1';
    await ui.loadKnowledgeState();
    expect(CGAPI.knowledgeState.list).toHaveBeenCalledWith('course-1', { limit: 10 });
    expect(ui.stateResults.textContent).toContain('Promise');
    expect(ui.stateResults.textContent).toContain('掌握 65%');
    expect(ui.stateResults.textContent).toContain('可信度 50%');
    expect(ui.stateResults.textContent).toContain('学习中');
    expect(ui.stateResults.querySelector('script')).toBeNull();
  });

  test('shows knowledge state empty and friendly error states', async () => {
    CGAPI.courseSpace.snapshot.mockResolvedValue(snapshot);
    CGAPI.knowledgeState.list.mockResolvedValue({ data: { states: [] } });
    const ui = createCourseSpaceUI();
    document.body.appendChild(ui.root);
    await ui.loadSnapshot();
    ui.courseSelect.value = 'course-1';
    await ui.loadKnowledgeState();
    expect(ui.stateResults.textContent).toContain('还没有知识掌握状态。');

    const failing = createCourseSpaceUI();
    document.body.appendChild(failing.root);
    CGAPI.courseSpace.snapshot.mockRejectedValueOnce(new Error('state db /secret'));
    failing.courseSelect.value = 'course-1';
    await failing.loadSnapshot();
    expect(failing.status.textContent).toBe('课程空间暂时不可用，请稍后再试。');

    const stateFailing = createCourseSpaceUI();
    document.body.appendChild(stateFailing.root);
    CGAPI.courseSpace.snapshot.mockResolvedValueOnce(snapshot);
    CGAPI.knowledgeState.list.mockRejectedValueOnce(new Error('/secret/state'));
    await stateFailing.loadSnapshot();
    stateFailing.courseSelect.value = 'course-1';
    await stateFailing.loadKnowledgeState();
    expect(stateFailing.stateStatus.textContent).toBe('知识状态暂时不可用，请稍后再试。');
    expect(stateFailing.root.textContent).not.toContain('/secret/state');
  });
});
