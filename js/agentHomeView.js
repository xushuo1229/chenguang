'use strict';

const AUTHORITY_LABELS = {
  'sync.activity': '来自学习行为记录',
  'student_knowledge_states': '来自学习状态记录',
  'student_knowledge_state_projection': '来自学习状态记录',
  'course_space': '来自课程知识库',
  'cgstore.user.memory': '来自成长记忆（派生记忆）',
  'reflection_storage': '来自用户反思',
  'deterministic_insights': '来自确定性洞察',
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function authorityLabel(source) {
  return AUTHORITY_LABELS[source] || '来自已授权学习数据';
}

function confidenceLabel(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return '置信度：未知';
  return `置信度：${confidence.toFixed(2)}`;
}

function badge(source, authority) {
  return element('span', 'agent-badge', `${authorityLabel(source)} · ${authority}`);
}

function ensureStyles() {
  if (document.getElementById('agent-home-view-style')) return;
  const style = document.createElement('style');
  style.id = 'agent-home-view-style';
  style.textContent = `
    .agent-home { display: grid; gap: 20px; }
    .agent-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
    .agent-card { background: var(--bg-card); border: 1px solid var(--border-soft); border-radius: var(--r-lg); padding: 20px; min-width: 0; }
    .agent-card h3 { margin: 0 0 6px; font-size: 1.05rem; }
    .agent-section-note { margin: 0 0 14px; color: var(--text-muted); font-size: .82rem; }
    .agent-badge { display: inline-flex; max-width: 100%; margin-bottom: 14px; padding: 5px 9px; border-radius: 999px; background: var(--bg-elev); color: var(--text-muted); font-size: .72rem; line-height: 1.2; }
    .agent-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
    .agent-list li { padding: 10px 12px; border-radius: var(--r-md); background: var(--bg-elev); color: var(--text-mid); font-size: .86rem; }
    .agent-list strong { color: var(--text-hi); font-weight: 650; }
    .agent-empty { color: var(--text-muted); font-size: .86rem; }
    .agent-insight { padding: 14px 0; border-top: 1px solid var(--border-soft); }
    .agent-insight:first-child { border-top: 0; padding-top: 0; }
    .agent-reasoning { padding: 14px 0; border-top: 1px solid var(--border-soft); }
    .agent-reasoning:first-child { border-top: 0; padding-top: 0; }
    .agent-confidence { margin: 5px 0 0; color: var(--text-muted); font-size: .78rem; }
    .agent-evidence { margin: 9px 0 0; padding-left: 18px; color: var(--text-muted); font-size: .78rem; }
    .agent-status { min-height: 22px; color: var(--text-muted); font-size: .86rem; }
    @media (max-width: 760px) { .agent-grid { grid-template-columns: 1fr; } .agent-card { padding: 16px; } }
  `;
  document.head.appendChild(style);
}

function sectionCard(title, note, source, authority) {
  const card = element('article', 'agent-card');
  card.appendChild(element('h3', null, title));
  card.appendChild(element('p', 'agent-section-note', note));
  card.appendChild(badge(source, authority));
  return card;
}

function appendItems(list, items, render) {
  if (!items || !items.length) {
    list.appendChild(element('li', 'agent-empty', '暂无数据'));
    return;
  }
  items.slice(0, 5).forEach((item) => list.appendChild(element('li', null, render(item))));
}

function renderOverview(card, behavior) {
  const value = behavior.value || {};
  const tasks = value.taskSummary || {};
  const focus = value.focusSummary || {};
  const streaks = value.streaks || {};
  const list = element('ul', 'agent-list');
  appendItems(list, [
    `今日任务：${tasks.completed || 0}/${tasks.total || 0} 完成`,
    `专注：${focus.minutes || 0} 分钟`,
    `学习：${focus.studyMinutes || 0} 分钟`,
    `运动：${focus.exerciseMinutes || 0} 分钟`,
    `连续打卡：${streaks.current || 0} 天`,
  ], (text) => text);
  card.appendChild(list);
}

function renderCourse(card, courseKnowledge) {
  const value = courseKnowledge.value || {};
  const nodes = value.nodes || [];
  const evidence = value.evidence || [];
  const list = element('ul', 'agent-list');
  if (!nodes.length && !evidence.length) {
    list.appendChild(element('li', 'agent-empty', '暂无课程知识'));
  }
  nodes.slice(0, 3).forEach((node) => {
    list.appendChild(element('li', null, node.title || '未命名知识节点'));
  });
  if (evidence.length) {
    list.appendChild(element('li', null, `Evidence 摘要：${evidence.length} 条`));
  }
  card.appendChild(list);
}

function renderStates(card, states) {
  const value = states.value || {};
  const list = element('ul', 'agent-list');
  appendItems(list, value.strongTopics, (item) => `强项：${item.title || '未命名节点'}`);
  appendItems(list, value.weakTopics, (item) => `待加强：${item.title || '未命名节点'}`);
  appendItems(list, value.recentlyReviewed, (item) => `最近复习：${item.title || '未命名节点'}`);
  card.appendChild(list);
}

function renderGrowth(card, growth) {
  const value = growth.value || {};
  const list = element('ul', 'agent-list');
  if (!value.available || !(value.items || []).length) {
    list.appendChild(element('li', 'agent-empty', '暂无成长记忆'));
  } else {
    value.items.slice(0, 3).forEach((item) => list.appendChild(element('li', null, item.content || '')));
  }
  card.appendChild(list);
}

function renderInsights(host, insights) {
  if (!insights.insights.length) {
    host.appendChild(element('p', 'agent-empty', '暂无足够数据生成洞察。'));
    return;
  }
  insights.insights.slice(0, 5).forEach((insight) => {
    const item = element('article', 'agent-insight');
    item.appendChild(element('h4', null, insight.title || insight.headline || '学习观察'));
    item.appendChild(element('p', null, insight.explanation || ''));
    const evidence = element('ul', 'agent-evidence');
    (insight.evidence || []).slice(0, 3).forEach((item) => {
      const metric = [item.metric || item.field, item.period].filter(Boolean).join(' · ');
      const value = item.value == null ? '' : `：${item.value}`;
      evidence.appendChild(element('li', null, `${metric}${value} · ${item.source || '未知来源'} · ${item.authority || 'unknown'}`));
    });
    item.appendChild(evidence);
    host.appendChild(item);
  });
}

function renderReasoning(host, reasoning) {
  if (!reasoning || reasoning.available !== true || !reasoning.explanations.length) {
    host.appendChild(element('p', 'agent-empty', '暂无推理解释。'));
    return;
  }

  reasoning.explanations.slice(0, 5).forEach((explanation) => {
    const item = element('article', 'agent-reasoning');
    item.appendChild(element('h4', null, explanation.title || '学习观察解释'));
    item.appendChild(element('p', null, `Why：${explanation.why || '暂无解释。'}`));
    item.appendChild(element('p', 'agent-confidence', confidenceLabel(explanation.confidence)));
    const evidence = element('ul', 'agent-evidence');
    (explanation.evidenceRefs || []).slice(0, 3).forEach((ref) => {
      const metric = [ref.metric, ref.period].filter(Boolean).join(' · ');
      evidence.appendChild(element('li', null, `${metric} · ${ref.source || '未知来源'}`));
    });
    item.appendChild(evidence);
    host.appendChild(item);
  });
}

function createAgentHomeView({ target, service }) {
  ensureStyles();
  const root = element('div', 'agent-home');
  root.setAttribute('aria-label', 'Agent Home');
  const status = element('p', 'agent-status');
  status.setAttribute('role', 'status');
  const content = element('div', 'agent-grid agent-content');
  root.append(status, content);
  target.appendChild(root);

  function renderLoading() {
    status.textContent = '正在加载 Agent Home...';
    root.setAttribute('aria-busy', 'true');
    content.replaceChildren();
  }

  function renderError() {
    status.textContent = 'Agent Home 暂时不可用，请稍后再试。';
    root.removeAttribute('aria-busy');
    content.replaceChildren(element('p', 'agent-empty', '暂时无法读取学习状态。'));
  }

  function render({ context, insights, reasoning = {} }) {
    status.textContent = '';
    root.removeAttribute('aria-busy');
    const behavior = context.behavior || {};
    const courseKnowledge = context.courseKnowledge || {};
    const states = context.knowledgeStates || {};
    const growth = context.memories && context.memories.growth ? context.memories.growth : {};

    const overview = sectionCard('Learning Overview', '今日学习状态摘要', behavior.source, behavior.authority);
    renderOverview(overview, behavior);
    const courses = sectionCard('Course Intelligence', '课程知识与证据摘要', courseKnowledge.source, courseKnowledge.authority);
    renderCourse(courses, courseKnowledge);
    const knowledge = sectionCard('Knowledge State', '掌握状态只读展示', states.source, states.authority);
    renderStates(knowledge, states);
    const growthCard = sectionCard('Growth Context', '长期成长上下文，不作为事实', growth.source, growth.authority);
    renderGrowth(growthCard, growth);
    const insightCard = sectionCard('AI Insights', '结构化学习观察', insights.metadata ? 'agent_insight' : 'agent_insight', 'insight_only');
    renderInsights(insightCard, insights);
    const reasoningCard = sectionCard('Reasoning Explanation', '解释已有洞察，不新增事实', 'deterministic_insights', 'insight_only');
    renderReasoning(reasoningCard, reasoning);

    content.replaceChildren(overview, courses, knowledge, growthCard, insightCard, reasoningCard);
  }

  function load() {
    renderLoading();
    return service.load().then(render).catch(renderError);
  }

  return { root, status, content, load, render, renderLoading, renderError };
}

export { createAgentHomeView };
