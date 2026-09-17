'use strict';

import AIContext from './aiContext.js';
import { createAiReflectionService } from './aiReflectionService.js';

const STYLE_ID = 'ai-reflection-ui-style';
const FRIENDLY_ERROR_TEXT = 'AI 复盘暂时不可用，请稍后再试。';

function ensureStyles(documentRef) {
  if (documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '.ai-reflection-card {',
    '  margin-top: 24px;',
    '  background: var(--bg-card);',
    '  border: 1px solid var(--border-soft);',
    '  border-radius: var(--r-lg);',
    '  padding: 20px;',
    '  color: var(--text-dark);',
    '}',
    '.ai-reflection-header { display:flex; justify-content:space-between; gap:16px; align-items:center; }',
    '.ai-reflection-title { margin:0; font-size:1.05rem; font-weight:700; }',
    '.ai-reflection-subtitle { margin:4px 0 0; font-size:.82rem; color:var(--text-muted); }',
    '.ai-reflection-button { border:1px solid var(--border-soft); background:var(--bg-hover); color:var(--text-dark); border-radius:40px; padding:8px 18px; font-size:.85rem; cursor:pointer; transition:border-color .2s, background .2s; }',
    '.ai-reflection-button:hover:not(:disabled) { border-color:var(--primary); }',
    '.ai-reflection-button:disabled { opacity:.65; cursor:not-allowed; }',
    '.ai-reflection-status { margin:16px 0 0; color:var(--text-muted); }',
    '.ai-reflection-performance { margin:16px 0 0; padding:10px 12px; background:var(--bg-elev); border-radius:var(--r-md); font-size:.85rem; color:var(--text-muted); }',
    '.ai-reflection-overview { margin:14px 0 0; line-height:1.6; }',
    '.ai-reflection-section { margin-top:16px; }',
    '.ai-reflection-label { margin:0 0 8px; font-size:.78rem; font-weight:700; color:var(--brand-amber); }',
    '.ai-reflection-list { margin:0; padding-left:18px; line-height:1.6; }',
    '.ai-reflection-error { color:#c2410c; }',
    '@media (max-width: 640px) {',
    '  .ai-reflection-header { align-items:flex-start; flex-direction:column; }',
    '  .ai-reflection-button { width:100%; }',
    '}'
  ].join('\n');
  documentRef.head.appendChild(style);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function performanceText(performance) {
  const source = performance && typeof performance === 'object' ? performance : {};
  const tasks = source.tasks || {};
  const focus = source.focus || {};
  const learning = source.learning || {};
  const parts = [];

  if (Number(tasks.total) > 0) {
    parts.push(`任务 ${Number(tasks.completed) || 0}/${Number(tasks.total)}`);
  }
  if (Number(focus.minutes) > 0) {
    parts.push(`专注 ${Number(focus.minutes)} 分钟`);
  }
  if (Number(learning.studyMinutes) > 0) {
    parts.push(`学习 ${Number(learning.studyMinutes)} 分钟`);
  }
  if (Number(learning.exerciseMinutes) > 0) {
    parts.push(`运动 ${Number(learning.exerciseMinutes)} 分钟`);
  }
  return parts.join(' · ');
}

function hasReflectionContent(reflection) {
  const summary = reflection && reflection.summary ? reflection.summary : {};
  const insights = Array.isArray(reflection && reflection.insights) ? reflection.insights : [];
  const suggestions = Array.isArray(reflection && reflection.suggestions) ? reflection.suggestions : [];
  return Boolean(
    String(summary.title || '').trim() ||
    String(summary.overview || '').trim() ||
    insights.length ||
    suggestions.length
  );
}

function defaultContextProvider() {
  const store = globalThis.CGStore;
  if (!store || typeof store.get !== 'function') return {};
  return AIContext.buildContext(store.get());
}

export function createAiReflectionUI(options) {
  const settings = options || {};
  const documentRef = settings.document || document;
  const service = settings.service || createAiReflectionService();
  const contextProvider = settings.contextProvider || defaultContextProvider;
  const root = element('section', 'ai-reflection-card');
  root.setAttribute('aria-label', 'AI 今日复盘');
  root.setAttribute('aria-live', 'polite');

  const header = element('div', 'ai-reflection-header');
  const title = element('h3', 'ai-reflection-title', 'AI 今日复盘');
  const subtitle = element('p', 'ai-reflection-subtitle', '根据今日计划与成长数据生成回顾和建议。');
  const button = element('button', 'ai-reflection-button', '生成今日反思');
  button.type = 'button';
  header.appendChild(title);
  header.appendChild(button);
  root.appendChild(header);

  const status = element('p', 'ai-reflection-status');
  const content = element('div', 'ai-reflection-content');
  root.appendChild(status);
  root.appendChild(content);

  let requestInFlight = false;

  function clearContent() {
    status.textContent = '';
    status.className = 'ai-reflection-status';
    content.textContent = '';
  }

  function renderIdle() {
    clearContent();
    button.disabled = false;
    status.textContent = '还没有生成今日复盘。';
    const empty = element('p', 'ai-reflection-empty', '点击按钮，让 AI 帮你回顾今天的行动并给出明日建议。');
    content.appendChild(empty);
  }

  function renderLoading() {
    clearContent();
    button.disabled = true;
    root.setAttribute('aria-busy', 'true');
    status.textContent = '正在生成今日反思...';
  }

  function renderError() {
    clearContent();
    button.disabled = false;
    root.removeAttribute('aria-busy');
    status.textContent = FRIENDLY_ERROR_TEXT;
    status.className = 'ai-reflection-status ai-reflection-error';
  }

  function renderEmpty() {
    clearContent();
    button.disabled = false;
    root.removeAttribute('aria-busy');
    status.textContent = '暂无足够内容生成今日复盘。';
    const empty = element('p', 'ai-reflection-empty', '先记录或完成今天的计划，之后再试一次。');
    content.appendChild(empty);
  }

  function renderSuccess(reflection) {
    clearContent();
    button.disabled = false;
    root.removeAttribute('aria-busy');
    const summary = reflection.summary || {};
    const performance = performanceText(reflection.performance);
    if (performance) {
      content.appendChild(element('p', 'ai-reflection-performance', performance));
    }
    if (String(summary.title || '').trim()) {
      content.appendChild(element('h4', 'ai-reflection-section-title', summary.title));
    }
    if (String(summary.overview || '').trim()) {
      content.appendChild(element('p', 'ai-reflection-overview', summary.overview));
    }

    const insights = Array.isArray(reflection.insights) ? reflection.insights : [];
    if (insights.length) {
      const section = element('div', 'ai-reflection-section');
      section.appendChild(element('p', 'ai-reflection-label', '成长观察'));
      const list = element('ul', 'ai-reflection-list');
      insights.forEach((item) => {
        if (item && String(item.content || '').trim()) {
          list.appendChild(element('li', '', item.content));
        }
      });
      if (list.children.length) section.appendChild(list);
      if (section.children.length) content.appendChild(section);
    }

    const suggestions = Array.isArray(reflection.suggestions) ? reflection.suggestions : [];
    if (suggestions.length) {
      const section = element('div', 'ai-reflection-section');
      section.appendChild(element('p', 'ai-reflection-label', '明日建议'));
      const list = element('ul', 'ai-reflection-list');
      suggestions.forEach((item) => {
        if (item && String(item.content || '').trim()) {
          list.appendChild(element('li', '', item.content));
        }
      });
      if (list.children.length) section.appendChild(list);
      if (section.children.length) content.appendChild(section);
    }
  }

  async function generate() {
    if (requestInFlight) return;
    requestInFlight = true;
    renderLoading();
    try {
      const result = await service.generate(contextProvider());
      const reflection = result && result.reflection;
      if (hasReflectionContent(reflection)) {
        renderSuccess(reflection);
      } else {
        renderEmpty();
      }
    } catch (_) {
      renderError();
    } finally {
      requestInFlight = false;
    }
  }

  button.addEventListener('click', generate);
  renderIdle();

  return {
    root,
    button,
    status,
    content,
    generate,
    renderIdle,
    renderLoading,
    renderSuccess,
    renderEmpty,
    renderError
  };
}

export function mountTodayReflection(options) {
  const settings = options || {};
  const documentRef = settings.document || document;
  ensureStyles(documentRef);
  const target = settings.target || documentRef.querySelector('main.main') || documentRef.body;
  const ui = createAiReflectionUI(Object.assign({}, settings, { document: documentRef }));
  target.appendChild(ui.root);
  return ui;
}
