'use strict';

const MODE_LABELS = {
  assessment: '评估',
  review: '复习',
  consolidate: '巩固',
};

const MEMORY_CATEGORY_LABELS = {
  patterns: '规律',
  milestones: '里程碑',
  preferences: '偏好',
  insights: '洞察',
};

const STATE_LABELS = {
  no_state: '未开始',
  weak: '薄弱',
  learning: '学习中',
  mastered: '已掌握',
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function card(title, note) {
  const host = element('article', 'personal-agent-card');
  const head = element('div', 'personal-agent-card-head');
  head.append(element('h3', null, title));
  if (note) head.append(element('p', null, note));
  host.append(head);
  return host;
}

function stateLabel(value) {
  return STATE_LABELS[value] || value || '未知';
}

function modeLabel(value) {
  return MODE_LABELS[value] || value || '学习';
}

function memoryCategoryLabel(value) {
  return MEMORY_CATEGORY_LABELS[value] || value || '成长记忆';
}

function factsList(items, emptyText) {
  const list = element('ul', 'personal-agent-list');
  if (!items.length) {
    list.appendChild(element('li', 'personal-agent-empty', emptyText));
    return list;
  }
  items.forEach((item) => list.appendChild(element('li', null, item)));
  return list;
}

function renderStatus(host, text, busy = false) {
  const status = host.querySelector('.personal-agent-status');
  status.setAttribute('role', 'status');
  status.textContent = text;
  if (busy) host.setAttribute('aria-busy', 'true');
  else host.removeAttribute('aria-busy');
}

function renderLoading(host) {
  host.replaceChildren(
    element('p', 'personal-agent-status'),
    element('div', 'personal-agent-loading', '个人 Agent 正在读取学习状态...'),
  );
  renderStatus(host, '正在加载个人 Agent...', true);
}

function renderNoCourse(host) {
  host.replaceChildren(
    element('p', 'personal-agent-status'),
    element('div', 'personal-agent-card'),
  );
  const cardHost = host.lastElementChild;
  cardHost.append(
    element('h3', 'personal-agent-card-title', '还没有可用的学习课程'),
    element('p', 'personal-agent-muted', '添加课程和知识内容后，个人 Agent 才能理解你的学习状态并推荐行动。'),
  );
  renderStatus(host, '个人 Agent 已就绪。');
}

function renderUnavailable(host) {
  host.replaceChildren(
    element('p', 'personal-agent-status'),
    element('div', 'personal-agent-card'),
  );
  const cardHost = host.lastElementChild;
  cardHost.append(
    element('h3', 'personal-agent-card-title', '个人 Agent 暂时不可用'),
    element('p', 'personal-agent-muted', '无法读取学习状态，请稍后再试。页面中的成长分析仍然有效。'),
  );
  renderStatus(host, '');
}

function renderHero(host, overview, context, options) {
  const greeting = options.greeting || '晚上好。';
  const course = context.courses.value.find((item) => item.courseId === overview.courseId);
  const hero = element('section', 'personal-agent-hero personal-agent-card');
  const title = element('h2', 'personal-agent-hero-title', greeting);
  const subtitle = element('p', 'personal-agent-hero-subtitle');
  subtitle.textContent = course && course.name
    ? `你的个人 Agent 正在跟进「${course.name}」。`
    : '你的个人 Agent 正在跟进当前学习状态。';
  hero.append(title, subtitle);
  return hero;
}

function renderInsightCard(host, overview, reasoning) {
  const next = overview.perception.nextBestRecommendation;
  const insightCard = card('Agent Insight', '事实来自学习记录，解释保持可追溯。');
  if (!next) {
    insightCard.appendChild(element('p', 'personal-agent-empty', '暂无足够学习数据生成洞察。'));
    return insightCard;
  }
  const fact = [
    `发现：${next.nodeTitle || '学习节点'}处于${stateLabel(next.state)}状态。`,
    `掌握度：${Number(next.masteryLevel || 0).toFixed(2)}`,
    next.dueNow ? '当前已到复习时间。' : '当前暂不需要复习。',
  ];
  insightCard.appendChild(element('h4', 'personal-agent-section-title', '我发现'));
  insightCard.appendChild(factsList(fact));
  insightCard.appendChild(element('h4', 'personal-agent-section-title', '我的判断'));
  const explanation = reasoning && Array.isArray(reasoning.explanations) && reasoning.explanations[0];
  insightCard.appendChild(element('p', 'personal-agent-reasoning',
    explanation && explanation.why ? explanation.why : '当前证据不足以给出更强的解释。'));
  insightCard.appendChild(element('h4', 'personal-agent-section-title', '建议'));
  insightCard.appendChild(element('p', 'personal-agent-recommendation',
    `建议${modeLabel(next.recommendedMode)}「${next.nodeTitle || '学习节点'}」。`));
  return insightCard;
}

function renderStateCard(host, overview, context) {
  const behavior = (context.behavior && context.behavior.value) || {};
  const states = (context.knowledgeStates && context.knowledgeStates.value) || {};
  const counts = overview.perception.stateCounts || {};
  const stateText = Object.entries(counts).map(([key, value]) => `${stateLabel(key)} ${value}`).join(' · ');
  const weakAreas = (states.weakTopics || []).slice(0, 3).map((item) => item.title || item.nodeTitle || '未命名节点');
  const stateCard = card('Learning State', '来自学习状态与行为投影。');
  stateCard.appendChild(element('h4', 'personal-agent-section-title', '当前状态'));
  stateCard.appendChild(element('p', null, stateText || '暂无状态。'));
  stateCard.appendChild(element('h4', 'personal-agent-section-title', '薄弱领域'));
  stateCard.appendChild(factsList(weakAreas, '暂无薄弱领域。'));
  const taskSummary = behavior.taskSummary || {};
  const focusSummary = behavior.focusSummary || {};
  stateCard.appendChild(element('h4', 'personal-agent-section-title', '今日进度'));
  stateCard.appendChild(factsList([
    `任务完成：${taskSummary.completed || 0}/${taskSummary.total || 0}`,
    `专注：${focusSummary.minutes || 0} 分钟`,
  ]));
  return stateCard;
}

function renderFocusCard(host, overview, confirmProposal) {
  const focusCard = card("Today's Focus", '来自现有 Learning Planner。');
  const blocks = overview.plan.blocks || [];
  if (!blocks.length) {
    focusCard.appendChild(element('p', 'personal-agent-empty', '暂无今日学习计划。'));
    return focusCard;
  }
  blocks.forEach((block, index) => {
    const item = element('article', 'personal-agent-focus-item');
    item.append(
      element('h4', null, `${modeLabel(block.kind)} · ${block.nodeTitle || '学习节点'}`),
      element('p', 'personal-agent-muted', `${block.minutes || 0} 分钟`),
      element('p', 'personal-agent-muted', block.reason || '当前学习状态需要继续推进。'),
    );
    if (index === 0) {
      const start = element('button', 'personal-agent-button', '开始');
      start.type = 'button';
      start.setAttribute('aria-label', `开始${modeLabel(block.kind)}${block.nodeTitle || '学习节点'}`);
      start.addEventListener('click', confirmProposal);
      item.appendChild(start);
    }
    focusCard.appendChild(item);
  });
  return focusCard;
}

function renderProposalCard(host, overview) {
  const next = overview.perception.nextBestRecommendation;
  const proposalCard = card('Action Proposal', '未经确认不会执行。');
  if (!next) {
    proposalCard.appendChild(element('p', 'personal-agent-empty', '暂无可确认行动。'));
    return proposalCard;
  }
  proposalCard.append(
    element('p', 'personal-agent-proposal', `建议现在${modeLabel(next.recommendedMode)}「${next.nodeTitle || '学习节点'}」。`),
    element('p', 'personal-agent-muted', next.reasons && next.reasons.join(' · ') || '来自当前学习状态。'),
  );
  return proposalCard;
}

function renderMemoryCard(context) {
  const memoryCard = card('Growth Memory', '只显示用户确认的成长记忆投影。');
  const boundary = context.memories && context.memories.growth;
  const memory = boundary && boundary.value;
  const items = memory && Array.isArray(memory.items) ? memory.items.slice(0, 3) : [];
  if (!items.length) {
    memoryCard.appendChild(element('p', 'personal-agent-empty', '暂无已确认的成长记忆。'));
    return memoryCard;
  }
  items.forEach((item) => {
    const row = element('article', 'personal-agent-focus-item');
    row.append(
      element('h4', null, memoryCategoryLabel(item.category)),
      element('p', null, item.content || ''),
      element('p', 'personal-agent-muted', `置信度 ${Number(item.confidence || 0).toFixed(2)} · 更新于 ${item.updatedAt || '未知时间'}`),
    );
    memoryCard.appendChild(row);
  });
  return memoryCard;
}

function renderTimelineCard(context) {
  const timelineCard = card('Learning Timeline', '来自 Learning State 的最近更新。');
  const boundary = context.knowledgeStates;
  const states = boundary && boundary.value && Array.isArray(boundary.value.recentlyReviewed)
    ? boundary.value.recentlyReviewed.slice(0, 5)
    : [];
  if (!states.length) {
    timelineCard.appendChild(element('p', 'personal-agent-empty', '暂无学习状态更新。'));
    return timelineCard;
  }
  states.forEach((item) => {
    const row = element('article', 'personal-agent-focus-item');
    row.append(
      element('h4', null, item.title || '学习节点'),
      element('p', 'personal-agent-muted', `${stateLabel(item.state)} · 掌握度 ${Number(item.masteryLevel || 0).toFixed(2)} · 证据 ${Number(item.evidenceCount || 0)} 条`),
      element('p', 'personal-agent-muted', `更新于 ${item.updatedAt || '未知时间'}`),
    );
    timelineCard.appendChild(row);
  });
  return timelineCard;
}

function renderReady(host, payload, options, actions) {
  const { context, reasoning, overview } = payload;
  host.replaceChildren(
    element('p', 'personal-agent-status'),
    renderHero(host, overview, context, options),
    renderInsightCard(host, overview, reasoning),
    renderStateCard(host, overview, context),
    renderFocusCard(host, overview, actions.confirmProposal),
    renderProposalCard(host, overview),
    renderMemoryCard(context),
    renderTimelineCard(context),
  );
  renderStatus(host, '个人 Agent 已就绪。');
}

function assessmentForm(action, proposal, submitAssessment, host) {
  const form = element('form', 'personal-agent-assessment');
  const assessment = action.assessment;
  form.append(element('h4', 'personal-agent-section-title', 'Practice'));
  assessment.items.forEach((item) => {
    const field = element('label', 'personal-agent-field');
    field.append(element('span', null, item.prompt || '请作答'));
    const input = element('textarea');
    input.maxLength = 2000;
    input.required = true;
    input.setAttribute('aria-label', `请作答：${item.prompt || item.itemId}`);
    input.dataset.itemId = item.itemId;
    field.appendChild(input);
    form.appendChild(field);
  });
  const buttons = element('div', 'personal-agent-actions');
  const submit = element('button', 'personal-agent-button primary', '提交评估');
  submit.type = 'submit';
  const cancel = element('button', 'personal-agent-button', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => {
    const output = host.querySelector('.personal-agent-output');
    if (output) output.remove();
    renderStatus(host, '已取消当前行动，未执行任何修改。');
  });
  buttons.append(submit, cancel);
  form.appendChild(buttons);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const answers = [...form.querySelectorAll('textarea')].map((input) => ({
      itemId: input.dataset.itemId,
      response: input.value,
    }));
    submitAssessment({
      confirmed: true,
      courseId: assessment.courseId,
      knowledgeNodeId: assessment.knowledgeNodeId,
      proposalId: proposal.id,
      answers,
    });
  });
  return form;
}

function createPersonalAgentExperience({ target, service, greeting, availableMinutes = 60 }) {
  const host = target;
  host.setAttribute('aria-label', '个人 Agent 核心体验');

  function confirmProposal() {
    const courseId = currentData && currentData.overview && currentData.overview.courseId;
    if (!courseId) return;
    renderStatus(host, '等待确认后启动行动...', true);
    service.confirmLearningNextAction(courseId).then((result) => {
      if (!result || result.status === 'no_action_available') {
        renderStatus(host, '当前没有可确认的学习行动。');
        return;
      }
      const output = element('div', 'personal-agent-output');
      output.appendChild(element('h3', 'personal-agent-card-title', 'Learning Action'));
      if (result.action && result.action.type === 'start_assessment') {
        output.appendChild(assessmentForm(result.action, result.proposal, submitAssessment, host));
      } else {
        output.appendChild(element('p', null, result.action && result.action.instruction || '学习行动已确认。'));
        output.appendChild(element('p', 'personal-agent-muted', '完成后请在 Agent Home 记录反馈。'));
        const cancel = element('button', 'personal-agent-button', '取消');
        cancel.type = 'button';
        cancel.addEventListener('click', () => {
          output.replaceChildren();
          renderStatus(host, '已取消当前行动，未执行任何修改。');
        });
        output.appendChild(cancel);
      }
      host.appendChild(output);
      renderStatus(host, '行动已确认。');
    }).catch(() => renderStatus(host, '学习行动暂时不可用，请稍后再试。'));
  }

  function submitAssessment(payload) {
    renderStatus(host, '正在提交评估...', true);
    service.submitAssessment(payload).then((result) => {
      const output = element('div', 'personal-agent-output personal-agent-feedback');
      output.append(
        element('h3', 'personal-agent-card-title', 'Feedback'),
        element('p', null, `评估完成：得分 ${Number(result.assessment.score || 0).toFixed(2)}`),
      );
      if (result.mastery) {
        output.appendChild(element('p', 'personal-agent-muted', `掌握状态：${stateLabel(result.mastery.state)}`));
      }
      host.appendChild(output);
      renderStatus(host, '反馈已更新。');
    }).catch(() => renderStatus(host, '评估提交暂时不可用，请稍后再试。'));
  }

  let currentData = null;

  function load() {
    renderLoading(host);
    return service.load().then((payload) => {
      const courses = payload.context && payload.context.courses && Array.isArray(payload.context.courses.value)
        ? payload.context.courses.value
        : [];
      if (!courses.length) {
        currentData = null;
        renderNoCourse(host);
        return { status: 'no_course' };
      }
      return service.learningAgentOverview(courses[0].courseId, availableMinutes).then((overview) => {
        currentData = { ...payload, overview };
        renderReady(host, currentData, { greeting }, { confirmProposal });
        return { status: 'ready', overview };
      });
    }).catch(() => {
      currentData = null;
      renderUnavailable(host);
      return { status: 'unavailable' };
    });
  }

  return { load };
}

export { createPersonalAgentExperience };
