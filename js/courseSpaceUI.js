'use strict';

import { createCourseSpaceService } from './courseSpaceService.js';

const STYLE_ID = 'course-space-ui-style';
const FRIENDLY_ERROR_TEXT = '课程空间暂时不可用，请稍后再试。';

function ensureStyles(documentRef) {
  if (documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '.course-space-card { margin-top:24px; background:var(--bg-card); border:1px solid var(--border-soft); border-radius:var(--r-lg); padding:20px; }',
    '.course-space-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }',
    '.course-space-title { margin:0; font-size:1.05rem; font-weight:700; }',
    '.course-space-subtitle { margin:4px 0 0; font-size:.82rem; color:var(--text-muted); }',
    '.course-space-toolbar { display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; }',
    '.course-space-select, .course-space-input { flex:1; min-width:180px; border:1px solid var(--border-soft); background:var(--bg-elev); color:var(--text-hi); border-radius:var(--r-btn); padding:9px 12px; font-size:.86rem; }',
    '.course-space-button { border:1px solid var(--border-soft); background:var(--bg-hover); color:var(--text-dark); border-radius:40px; padding:9px 18px; font-size:.85rem; cursor:pointer; transition:var(--transition-fast); }',
    '.course-space-button:hover:not(:disabled) { border-color:var(--primary); }',
    '.course-space-button:disabled { opacity:.65; cursor:not-allowed; }',
    '.course-space-summary { margin:14px 0 0; font-size:.82rem; color:var(--text-muted); }',
    '.course-space-results { margin-top:14px; display:grid; gap:10px; }',
    '.course-space-item { padding:12px 14px; border:1px solid var(--border-soft); border-radius:var(--r-md); background:var(--bg-elev); }',
    '.course-space-item-title { font-weight:600; }',
    '.course-space-item-meta { margin-top:4px; font-size:.78rem; color:var(--text-muted); }',
    '.course-space-empty, .course-space-status { margin-top:14px; font-size:.85rem; color:var(--text-muted); }',
    '.course-space-error { color:#c2410c; }',
    '@media (max-width:640px) { .course-space-button { width:100%; } }'
  ].join('\n');
  documentRef.head.appendChild(style);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function countLabel(label, value) {
  return `${label} ${Number(value) || 0}`;
}

function createCourseSpaceUI(options) {
  const settings = options || {};
  const documentRef = settings.document || document;
  const service = settings.service || createCourseSpaceService();
  const root = element('section', 'course-space-card');
  root.setAttribute('aria-label', 'Course Space');

  const head = element('div', 'course-space-head');
  const heading = element('div');
  heading.appendChild(element('h3', 'course-space-title', '🧠 Course Space'));
  heading.appendChild(element('p', 'course-space-subtitle', '课程知识、关系与证据的只读检索基础。'));
  const summary = element('p', 'course-space-summary');
  head.appendChild(heading);
  head.appendChild(summary);

  const toolbar = element('div', 'course-space-toolbar');
  const courseSelect = documentRef.createElement('select');
  courseSelect.className = 'course-space-select';
  courseSelect.setAttribute('aria-label', '选择课程');
  const searchInput = documentRef.createElement('input');
  searchInput.className = 'course-space-input';
  searchInput.type = 'search';
  searchInput.placeholder = '搜索知识、资料或证据';
  searchInput.setAttribute('aria-label', '搜索知识');
  const searchButton = element('button', 'course-space-button', '检索');
  searchButton.type = 'button';
  toolbar.appendChild(courseSelect);
  toolbar.appendChild(searchInput);
  toolbar.appendChild(searchButton);

  const status = element('p', 'course-space-status');
  status.setAttribute('aria-live', 'polite');
  const results = element('div', 'course-space-results');
  results.setAttribute('aria-live', 'polite');
  const stateStatus = element('p', 'course-space-status');
  const stateResults = element('div', 'course-space-results');
  stateResults.setAttribute('aria-label', 'Knowledge State Preview');

  root.appendChild(head);
  root.appendChild(toolbar);
  root.appendChild(status);
  root.appendChild(results);
  root.appendChild(stateStatus);
  root.appendChild(stateResults);

  function selectedCourseId() {
    return courseSelect.value || '';
  }

  function renderLoading(text) {
    searchButton.disabled = true;
    status.className = 'course-space-status';
    status.textContent = text;
  }

  function renderIdle() {
    searchButton.disabled = false;
    status.textContent = '';
  }

  function renderError() {
    searchButton.disabled = false;
    status.className = 'course-space-status course-space-error';
    status.textContent = FRIENDLY_ERROR_TEXT;
    results.textContent = '';
  }

  function renderEmpty(text) {
    renderIdle();
    summary.textContent = '文档 0 · 知识节点 0 · 关系 0 · 证据 0';
    results.textContent = '';
    results.appendChild(element('p', 'course-space-empty', text));
  }

  function renderCourses(courses) {
    const selected = selectedCourseId();
    courseSelect.textContent = '';
    const allOption = documentRef.createElement('option');
    allOption.value = '';
    allOption.textContent = '全部课程';
    courseSelect.appendChild(allOption);
    (Array.isArray(courses) ? courses : []).forEach((course) => {
      if (!course || !course.id) return;
      const option = documentRef.createElement('option');
      option.value = String(course.id);
      option.textContent = String(course.name || course.id);
      courseSelect.appendChild(option);
    });
    courseSelect.value = selected;
  }

  function renderSummary(data) {
    summary.textContent = [
      countLabel('文档', data.documents && data.documents.length),
      countLabel('知识节点', data.nodes && data.nodes.length),
      countLabel('关系', data.relations ? data.relations.length : 0),
      countLabel('证据', data.evidence && data.evidence.length)
    ].join(' · ');
  }

  function renderResultItem(title, meta, detail) {
    const item = element('article', 'course-space-item');
    item.appendChild(element('p', 'course-space-item-title', title));
    if (meta) item.appendChild(element('p', 'course-space-item-meta', meta));
    if (detail) item.appendChild(element('p', 'course-space-item-meta', detail));
    results.appendChild(item);
  }

  function renderStateItem(state) {
    const item = element('article', 'course-space-item');
    const stateText = state.state === 'mastered' ? '已掌握' : state.state === 'learning' ? '学习中' : '薄弱';
    item.appendChild(element('p', 'course-space-item-title', state.nodeTitle || '未命名节点'));
    item.appendChild(element('p', 'course-space-item-meta', `掌握 ${Math.round((state.masteryLevel || 0) * 100)}% · 可信度 ${Math.round((state.confidence || 0) * 100)}% · ${stateText}`));
    item.appendChild(element('p', 'course-space-item-meta', `证据 ${state.evidenceCount || 0}`));
    stateResults.appendChild(item);
  }

  function renderStateEmpty(text) {
    stateStatus.textContent = '';
    stateResults.textContent = '';
    stateResults.appendChild(element('p', 'course-space-empty', text));
  }

  function renderStateError() {
    stateStatus.className = 'course-space-status course-space-error';
    stateStatus.textContent = '知识状态暂时不可用，请稍后再试。';
    stateResults.textContent = '';
  }

  function renderStates(states) {
    stateStatus.className = 'course-space-status';
    stateStatus.textContent = '';
    stateResults.textContent = '';
    if (!Array.isArray(states) || !states.length) {
      renderStateEmpty('还没有知识掌握状态。');
      return;
    }
    states.slice(0, 5).forEach(renderStateItem);
  }

  async function loadKnowledgeState() {
    const courseId = selectedCourseId();
    if (!courseId) return renderStateEmpty('选择课程后查看知识掌握状态。');
    stateStatus.className = 'course-space-status';
    stateStatus.textContent = '正在加载知识状态...';
    stateResults.textContent = '';
    try {
      const response = await service.knowledgeState(courseId, { limit: 10 });
      renderStates(response && response.data ? response.data.states : []);
    } catch (_) {
      renderStateError();
    }
  }

  function renderSnapshot(data) {
    renderIdle();
    if (!data || typeof data !== 'object') return renderEmpty('课程空间还没有内容。');
    renderCourses(data.courses);
    renderSummary(data);
    results.textContent = '';
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    if (!nodes.length) {
      results.appendChild(element('p', 'course-space-empty', '还没有知识节点。这里只展示已归档的课程知识。'));
      return;
    }
    nodes.slice(0, 5).forEach((node) => {
      renderResultItem(node.title || '未命名节点', node.kind || '', node.definition || '');
    });
  }

  function renderSearch(data) {
    if (!data || typeof data !== 'object') return renderEmpty('没有匹配的知识内容。');
    renderIdle();
    renderCourses(data.courses || []);
    renderSummary({
      documents: data.documents,
      nodes: data.nodes,
      relations: [],
      evidence: data.evidence
    });
    results.textContent = '';
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const documents = Array.isArray(data.documents) ? data.documents : [];
    const evidence = Array.isArray(data.evidence) ? data.evidence : [];
    if (!nodes.length && !documents.length && !evidence.length) {
      results.appendChild(element('p', 'course-space-empty', '没有匹配的知识内容。'));
      return;
    }
    nodes.forEach((node) => renderResultItem(node.title || '未命名节点', node.kind || '', node.definition || ''));
    documents.forEach((documentItem) => renderResultItem(documentItem.title || '未命名资料', 'Document', documentItem.sourceUrl || ''));
    evidence.forEach((item) => renderResultItem(item.quote || '未命名证据', 'Evidence', item.locator || ''));
  }

  async function loadSnapshot() {
    renderLoading('正在加载课程空间...');
    try {
      const response = await service.snapshot(selectedCourseId());
      renderSnapshot(response && response.data);
      await loadKnowledgeState();
    } catch (_) {
      renderError();
      return;
    }
  }

  async function search() {
    const query = searchInput.value.trim();
    if (!query) return loadSnapshot();
    renderLoading('正在检索课程知识...');
    try {
      const response = await service.search({ query, courseId: selectedCourseId(), limit: 10 });
      renderSearch(response && response.data);
    } catch (_) {
      renderError();
    }
  }

  searchButton.addEventListener('click', search);
  courseSelect.addEventListener('change', loadSnapshot);
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') search();
  });
  renderIdle();

  return {
    root,
    courseSelect,
    searchInput,
    searchButton,
    status,
    summary,
    results,
    stateStatus,
    stateResults,
    loadSnapshot,
    search,
    loadKnowledgeState,
    renderSnapshot,
    renderSearch,
    renderEmpty,
    renderError
  };
}

function mountCourseSpace(options) {
  const settings = options || {};
  const documentRef = settings.document || document;
  ensureStyles(documentRef);
  const target = settings.target || documentRef.querySelector('#wb-view-course') || documentRef.body;
  const ui = createCourseSpaceUI({ ...settings, document: documentRef });
  target.appendChild(ui.root);
  return ui;
}

export {
  createCourseSpaceUI,
  mountCourseSpace
};
