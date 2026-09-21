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
    .agent-conversation-form { display: flex; gap: 10px; margin: 12px 0 10px; }
    .agent-conversation-input { flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--border-soft); border-radius: var(--r-md); background: var(--bg-elev); color: var(--text-hi); }
    .agent-conversation-button { padding: 10px 14px; border: 0; border-radius: var(--r-md); background: var(--accent, var(--primary)); color: var(--text-inverse, #fff); font-weight: 600; cursor: pointer; }
    .agent-confidence { margin: 5px 0 0; color: var(--text-muted); font-size: .78rem; }
    .agent-evidence { margin: 9px 0 0; padding-left: 18px; color: var(--text-muted); font-size: .78rem; }
    .agent-status { min-height: 22px; color: var(--text-muted); font-size: .86rem; }
    @media (max-width: 760px) { .agent-grid { grid-template-columns: 1fr; } .agent-card { padding: 16px; } .agent-conversation-form { flex-direction: column; } }
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

function renderConversationResult(host, result) {
  host.replaceChildren();
  if (result.status === 'clarification_required') {
    host.appendChild(element('p', 'agent-empty', '需要补充课程或知识点后才能生成学习解释。'));
    return;
  }
  const explanation = result.explanation || {};
  const explanations = Array.isArray(explanation.explanations) ? explanation.explanations : [];
  if (!explanations.length) {
    host.appendChild(element('p', 'agent-empty', '暂无可解释的学习内容。'));
    return;
  }
  explanations.slice(0, 3).forEach((item) => {
    const article = element('article', 'agent-insight');
    article.appendChild(element('h4', null, item.title || item.text || '学习解释'));
    article.appendChild(element('p', null, item.why || item.text || ''));
    const evidence = element('ul', 'agent-evidence');
    (item.evidenceRefs || []).slice(0, 3).forEach((ref) => {
      evidence.appendChild(element('li', null, [ref.metric, ref.period].filter(Boolean).join(' · ') || '已绑定证据'));
    });
    article.appendChild(evidence);
    host.appendChild(article);
  });
  const understanding = result.queryUnderstanding || {};
  const selection = result.contextSelection || {};
  host.appendChild(element('p', 'agent-confidence', `Context transparency · ${selection.status || 'unknown'} · intent ${understanding.intent ? understanding.intent.value : 'unknown'} · learning mode ${result.modeHint || 'unknown'}`));
}

function createConversationCard(service) {
  const card = sectionCard('Learning Conversation', '基于已选上下文解释，不执行操作', 'learning_conversation_runtime', 'read_only');
  const form = element('form', 'agent-conversation-form');
  const input = element('input', 'agent-conversation-input');
  input.type = 'text';
  input.name = 'query';
  input.setAttribute('aria-label', '学习问题');
  input.placeholder = '例如：解释 Promise';
  input.maxLength = 1000;
  input.required = true;
  const button = element('button', 'agent-conversation-button', '获取解释');
  button.type = 'submit';
  const status = element('p', 'agent-status');
  status.setAttribute('role', 'status');
  const output = element('div');
  form.append(input, button);
  card.append(form, status, output);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    status.textContent = '正在生成学习解释...';
    service.askLearningConversation({ query }).then((result) => {
      status.textContent = '';
      renderConversationResult(output, result);
    }).catch(() => {
      status.textContent = '学习解释暂时不可用，请稍后再试。';
      output.replaceChildren();
    });
  });
  return card;
}

function renderAgentOverview(output, overview) {
  const counts = overview.perception.stateCounts || {};
  const plan = overview.plan || {};
  const list = element('ul', 'agent-list');
  appendItems(list, [
    `薄弱状态：${counts.weak || 0} · 学习中：${counts.learning || 0} · 已掌握：${counts.mastered || 0}`,
    `计划行动：${(plan.blocks || []).length} 个`,
    overview.perception.nextBestRecommendation
      ? `下一步：${overview.perception.nextBestRecommendation.nodeTitle} · ${overview.perception.nextBestRecommendation.recommendedMode}`
      : '下一步：暂无推荐',
  ], (item) => item);
  output.replaceChildren(list, element('p', 'agent-confidence', '计划仅为推荐，执行前需要用户确认。'));
}

function resetLearningAgent(output, status) {
  output.replaceChildren();
  status.textContent = '已取消当前行动，未执行任何修改。';
}

function renderAssessmentForm(output, service, action) {
  const assessment = action.action.assessment;
  const form = element('form', 'agent-conversation-form agent-assessment-form');
  form.className = 'agent-assessment-form';
  assessment.items.forEach((entry) => {
    const field = element('div', 'agent-insight');
    field.appendChild(element('p', null, entry.prompt));
    const textarea = element('textarea', 'agent-conversation-input');
    textarea.maxLength = 2000;
    textarea.dataset.itemId = entry.itemId;
    textarea.setAttribute('aria-label', `请作答：${entry.prompt}`);
    textarea.required = true;
    field.appendChild(textarea);
    form.appendChild(field);
  });
  const button = element('button', 'agent-conversation-button', '提交评估');
  button.type = 'submit';
  form.appendChild(button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    button.disabled = true;
    const answers = [...form.querySelectorAll('textarea')].map((textarea) => ({
      itemId: textarea.dataset.itemId,
      response: textarea.value,
    }));
    service.submitAssessment({
      confirmed: true,
      courseId: assessment.courseId,
      knowledgeNodeId: assessment.knowledgeNodeId,
      proposalId: action.proposal.id,
      answers,
    }).then((result) => {
      output.replaceChildren(element('p', 'agent-confidence', `评估完成：得分 ${result.assessment.score.toFixed(2)}，掌握状态 ${result.mastery.state}`));
    }).catch(() => {
      button.disabled = false;
      output.appendChild(element('p', 'agent-empty', '评估提交暂时不可用，请稍后再试。'));
    });
  });
  output.appendChild(form);
}

function renderConfirmedAction(output, service, action) {
  const proposal = action.proposal || {};
  const summary = element('p', 'agent-confidence', `已确认：${proposal.nodeTitle || ''} · ${proposal.kind || ''}`);
  output.replaceChildren(summary);
  if (action.action && action.action.type === 'start_assessment') {
    renderAssessmentForm(output, service, action);
  } else {
    output.appendChild(element('p', 'agent-empty', action.action ? action.action.instruction : '暂无可执行行动。'));
  }
}

function createLearningAgentCard(service, courseId) {
  const card = sectionCard('Personal Learning Agent 2.0', '感知 → 计划 → 用户确认 → 评估反馈', 'deterministic_orchestration', 'user_confirmed_action');
  const actions = element('div', 'agent-conversation-form');
  const loadButton = element('button', 'agent-conversation-button', '加载学习概览');
  loadButton.type = 'button';
  const nextButton = element('button', 'agent-conversation-button', '确认下一个行动');
  nextButton.type = 'button';
  nextButton.setAttribute('aria-label', '确认执行下一个学习行动');
  const cancelButton = element('button', 'agent-conversation-button', '取消');
  cancelButton.type = 'button';
  cancelButton.setAttribute('aria-label', '取消学习行动');
  const status = element('p', 'agent-status');
  status.setAttribute('role', 'status');
  const output = element('div');
  actions.append(loadButton, nextButton, cancelButton);
  card.append(actions, status, output);

  loadButton.addEventListener('click', () => {
    status.textContent = '正在读取学习概览...';
    service.learningAgentOverview(courseId, 60).then((overview) => {
      status.textContent = '';
      renderAgentOverview(output, overview);
    }).catch(() => {
      status.textContent = '学习概览暂时不可用。';
      output.replaceChildren();
    });
  });
  nextButton.addEventListener('click', () => {
    status.textContent = '等待确认后启动行动...';
    service.confirmLearningNextAction(courseId).then((result) => {
      status.textContent = '';
      renderConfirmedAction(output, service, result);
    }).catch(() => {
      status.textContent = '学习行动暂时不可用。';
      output.replaceChildren();
    });
  });
  cancelButton.addEventListener('click', () => {
    resetLearningAgent(output, status);
  });
  return card;
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
    const conversationCard = typeof service.askLearningConversation === 'function'
      ? createConversationCard(service)
      : null;
    const courseOptions = context.courses && Array.isArray(context.courses.value) ? context.courses.value : [];
    const agentCourseId = courseOptions.find((course) => course && course.courseId)?.courseId || null;
    const agentCard = agentCourseId && typeof service.learningAgentOverview === 'function'
      ? createLearningAgentCard(service, agentCourseId)
      : null;

    content.replaceChildren(...[
      conversationCard,
      agentCard,
      overview,
      courses,
      knowledge,
      growthCard,
      insightCard,
      reasoningCard,
    ].filter(Boolean));
  }

  function load() {
    renderLoading();
    return service.load().then(render).catch(renderError);
  }

  return { root, status, content, load, render, renderLoading, renderError };
}

export { createAgentHomeView };
