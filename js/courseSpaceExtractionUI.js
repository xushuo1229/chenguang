'use strict';

import { createCourseSpaceExtractionService } from './courseSpaceExtractionService.js';

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function createCourseSpaceExtractionUI(options) {
  const settings = options || {};
  const documentRef = settings.document || document;
  const service = settings.service || createCourseSpaceExtractionService({ client: settings.client });
  const root = createElement('section', 'course-space-card course-extraction-card');
  const heading = createElement('div', 'course-space-head');
  const title = createElement('div');
  title.appendChild(createElement('h3', 'course-space-title', '🔍 Knowledge Extraction'));
  title.appendChild(createElement('p', 'course-space-subtitle', 'AI 生成知识候选，确认后才会进入知识库。'));
  heading.appendChild(title);
  const status = createElement('p', 'course-space-status');
  const summary = createElement('p', 'course-space-summary');
  const courseSelect = documentRef.createElement('select');
  courseSelect.className = 'course-space-select';
  courseSelect.setAttribute('aria-label', '选择课程');
  const documentSelect = documentRef.createElement('select');
  documentSelect.className = 'course-space-select';
  documentSelect.setAttribute('aria-label', '选择文档');
  const extractButton = documentRef.createElement('button');
  extractButton.type = 'button';
  extractButton.className = 'course-space-button';
  extractButton.textContent = '生成候选';
  const toolbar = createElement('div', 'course-space-toolbar');
  toolbar.append(courseSelect, documentSelect, extractButton);
  const reviewList = createElement('div', 'course-space-results');
  const jobList = createElement('div', 'course-space-results');
  root.append(heading, status, toolbar, summary, reviewList, jobList);

  let documents = [];
  let busy = false;

  function selectedCourseId() { return courseSelect.value || ''; }
  function selectedDocumentId() { return documentSelect.value || ''; }

  function renderStatus(text, isError) {
    status.textContent = text;
    status.className = isError ? 'course-space-status course-space-error' : 'course-space-status';
  }

  function setBusy(value, text) {
    busy = value;
    extractButton.disabled = value;
    courseSelect.disabled = value;
    documentSelect.disabled = value;
    if (text) renderStatus(text);
  }

  function renderCourses(courses) {
    const selected = selectedCourseId();
    courseSelect.textContent = '';
    const all = documentRef.createElement('option');
    all.value = '';
    all.textContent = '全部课程';
    courseSelect.appendChild(all);
    (Array.isArray(courses) ? courses : []).forEach((course) => {
      if (!course || !course.id) return;
      const option = documentRef.createElement('option');
      option.value = String(course.id);
      option.textContent = String(course.name || course.id);
      courseSelect.appendChild(option);
    });
    courseSelect.value = selected;
  }

  function renderDocuments(items) {
    const selected = selectedDocumentId();
    documentSelect.textContent = '';
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || !item.id) return;
      const option = documentRef.createElement('option');
      option.value = String(item.id);
      option.textContent = String(item.title || item.id);
      documentSelect.appendChild(option);
    });
    documentSelect.value = selected;
  }

  function clear(node) { node.textContent = ''; }

  function item(titleText, metaText, detailText) {
    const article = createElement('article', 'course-space-item');
    article.appendChild(createElement('p', 'course-space-item-title', titleText));
    if (metaText) article.appendChild(createElement('p', 'course-space-item-meta', metaText));
    if (detailText) article.appendChild(createElement('p', 'course-space-item-meta', detailText));
    return article;
  }

  function renderReview(candidates) {
    clear(reviewList);
    if (!candidates.length) {
      reviewList.appendChild(createElement('p', 'course-space-empty', '没有待审核的知识候选。'));
      return;
    }
    candidates.forEach((candidate) => {
      const article = item(candidate.title || '未命名候选', `${candidate.type || 'concept'} · 置信度 ${Math.round((candidate.confidence || 0) * 100)}%`, candidate.content || '');
      const actions = createElement('div', 'course-space-toolbar');
      const accept = documentRef.createElement('button');
      accept.type = 'button';
      accept.className = 'course-space-button';
      accept.textContent = '接受';
      accept.addEventListener('click', async () => {
        if (busy) return;
        setBusy(true, '正在保存审核结果...');
        try {
          await service.reviewCandidate(candidate.id, { action: 'accept', title: candidate.title, content: candidate.content });
          await load(true);
        } catch (_) {
          renderStatus('审核暂时失败，请稍后再试。', true);
          setBusy(false);
        }
      });
      const reject = documentRef.createElement('button');
      reject.type = 'button';
      reject.className = 'course-space-button';
      reject.textContent = '拒绝';
      reject.addEventListener('click', async () => {
        if (busy) return;
        setBusy(true, '正在保存审核结果...');
        try {
          await service.reviewCandidate(candidate.id, { action: 'reject' });
          await load(true);
        } catch (_) {
          renderStatus('审核暂时失败，请稍后再试。', true);
          setBusy(false);
        }
      });
      actions.append(accept, reject);
      article.appendChild(actions);
      reviewList.appendChild(article);
    });
  }

  function renderJobs(jobs) {
    clear(jobList);
    jobList.appendChild(createElement('p', 'course-space-item-title', '提取任务'));
    if (!jobs.length) {
      jobList.appendChild(createElement('p', 'course-space-empty', '还没有提取任务。'));
      return;
    }
    jobs.slice(0, 5).forEach((job) => {
      jobList.appendChild(item(job.documentId, job.status, job.error || job.promptVersion));
    });
  }

  async function createJob() {
    if (busy) return;
    const courseId = selectedCourseId();
    const documentId = selectedDocumentId();
    if (!courseId || !documentId) {
      renderStatus('请先选择课程和文档。', true);
      return;
    }
    setBusy(true, '正在生成今日知识候选...');
    try {
      await service.createJob({ courseId, documentId });
      await load(true);
    } catch (_) {
      renderStatus('AI 提取暂时不可用，请稍后再试。', true);
      setBusy(false);
    }
  }

  async function load(force) {
    if (busy && !force) return;
    setBusy(true, '正在加载知识提取...');
    try {
      const data = await service.load({ courseId: selectedCourseId() });
      renderCourses(data.snapshot && data.snapshot.courses);
      renderDocuments(data.snapshot && data.snapshot.documents);
      renderReview(data.candidates);
      renderJobs(data.jobs);
      renderStatus('');
    } catch (_) {
      renderStatus('知识提取暂时不可用，请稍后再试。', true);
    } finally {
      setBusy(false);
    }
  }

  extractButton.addEventListener('click', createJob);
  courseSelect.addEventListener('change', load);
  return {
    root,
    courseSelect,
    documentSelect,
    extractButton,
    status,
    summary,
    reviewList,
    jobList,
    load,
    createJob
  };
}

function mountCourseSpaceExtraction(options) {
  const settings = options || {};
  const documentRef = settings.document || document;
  const target = settings.target || documentRef.querySelector('#wb-view-course') || documentRef.body;
  const ui = createCourseSpaceExtractionUI(settings);
  target.appendChild(ui.root);
  ui.load();
  return ui;
}

export { createCourseSpaceExtractionUI, mountCourseSpaceExtraction };
