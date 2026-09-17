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
});
