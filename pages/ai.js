import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/apiClient.js';
import { createAgentHomeService } from '../js/agentHomeService.js';
import { createPersonalAgentExperience } from '../js/personalAgentExperience.js';
import { metrics as agentMetrics, status as agentStatus, timeline as agentTimeline, emptyState as agentEmptyState } from '../js/agentUi.js';
import '../js/store.js';
import '../js/sync.js';
import Analytics from '../js/analytics.js';
import CGAIContext from '../js/aiContext.js';
import GrowthIntelligence from '../js/growthIntelligence.js';
import GrowthMemory from '../js/growthMemory.js';
import CoachMemory from '../js/coachMemory.js';
import GrowthReport from '../js/growthReport.js';
import { formatEvidence, formatLifecycle, formatMemoryType } from '../js/ui/memoryCopy.js';
import { setupServiceWorker } from '../js/serviceWorkerRegistration.js';
import { homeAuthHref } from '../js/utils/authNavigation.js';

// ====================================================================
// Zeno · 个人 Agent 页 (Phase 13 AI 2.0)
// ====================================================================
// 架构（Phase 13 冻结）：
//
//   CGStore → CGAnalytics → Goal Engine → AIContext Builder（只读）
//        → CGAPI.ai.chat({ message, history, context, contextVersion })
//        → 后端 Prompt Builder → Provider Adapter → 大模型
//        → { reply, mode:'coach', suggestions, actions }
//
// 【铁律】
//   - 本页只读：绝不写 CGStore / 绝不 revision++ / 绝不动业务数据。
//   - AI 回复一律用 textContent 渲染（第一版不做 Markdown / innerHTML）。
//   - actions 第一版只允许 { type:'navigate' }，且来自后端确定性派生。
//   - 对话历史 memory-first：只存内存 + sessionStorage，绝不进 CGStore /
//     chenguangData / user_data（不随业务数据同步、不进云端快照）。
//   - AI 不可用时展示友好提示，应用离线优先，不崩。
// ====================================================================

'use strict';

var Store = globalThis.CGStore;
var AIContext = globalThis.CGAIContext || CGAIContext;

/* ---------- 认证检查 ---------- */
function checkAuth() {
  var token = Store && Store.getToken ? Store.getToken() : localStorage.getItem('cg_token');
  if (!token) { toast('请先登录', 'error'); setTimeout(function () { window.location.href = homeAuthHref('ai.html'); }, 800); return false; }
  return true;
}

/* ---------- DOM 工具 ---------- */
function $(s) { return document.querySelector(s); }
function el(tag, className, text) {
  var n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

/* ---------- 状态开关 ---------- */
var loadingEl = $('#aiLoading'); var errorEl = $('#aiError'); var emptyEl = $('#aiEmpty');
var dashEl = $('#coachDashboard');

function hideAll() {
  [loadingEl, errorEl, emptyEl, dashEl].forEach(function (x) { if (x) x.hidden = true; });
}
function showLoading() { hideAll(); if (loadingEl) loadingEl.hidden = false; }
function showError() { hideAll(); if (errorEl) errorEl.hidden = false; }
function showEmpty() { hideAll(); if (emptyEl) emptyEl.hidden = false; }
function showDash() {
  hideAll();
  if ($('#agentWorkspace')) return;
  if (dashEl) dashEl.hidden = false;
}

/* ====================================================================
   上下文（AIContext Builder 产物，只读）
   ==================================================================== */

var currentContext = null;
var currentSnapshot = null;
var currentCoachContext = null;
var suppressNextMemoryUpdate = false;
var agentMode = 'personal';
var agentConversationId = 'agent-' + Math.random().toString(36).slice(2, 10);

function buildContext(store) {
  store = (store && typeof store === 'object') ? store : Store.get();
  currentSnapshot = store;
  currentContext = AIContext.buildContext(store);
  CoachMemory.observeOutcomes(store);
  currentCoachContext = CoachMemory.getCoachContext(store);
  return currentContext;
}

/* ====================================================================
   左列：今日状态 / 今日发现 / 目标风险 / AI 建议
   ==================================================================== */

function buildTodayStats(snap) {
  var today = todayStr();
  return {
    today: today,
    day: Analytics.getDateRangeSummary(today, today, snap),
    study: Analytics.getStudySummary(today, today, snap),
    exercise: Analytics.getExerciseSummary(today, today, snap),
    todos: Analytics.getTodoSummary(today, today, snap, today),
    streaks: Analytics.getStreaks(snap, { today: today })
  };
}

function renderToday(todayStats) {
  var grid = $('#todayGrid');
  if (!grid) return;
  grid.innerHTML = '';                         // 容器清空，条目全部 textContent 构建

  var today = todayStats.today;
  var day = todayStats.day;
  var study = todayStats.study;
  var ex = todayStats.exercise;
  var todos = todayStats.todos;
  var streaks = todayStats.streaks;

  var stats = [
    { icon: 'fas fa-calendar-check', label: '今日打卡', value: (streaks && streaks.todayDone) ? '✓' : '未', unit: '' },
    { icon: 'fas fa-stopwatch', label: '专注', value: fmtNum((day && day.focus && day.focus.minutes) || 0), unit: 'min' },
    { icon: 'fas fa-book-open', label: '学习', value: fmtNum((study && study.minutes) || 0), unit: 'min' },
    { icon: 'fas fa-dumbbell', label: '运动', value: fmtNum((ex && ex.minutes) || 0), unit: 'min' },
    { icon: 'fas fa-list-check', label: '待办完成', value: fmtNum((todos && todos.done) || 0) + '/' + fmtNum((todos && todos.total) || 0), unit: '' },
    { icon: 'fas fa-fire', label: '连续成长', value: fmtNum((streaks && streaks.currentStreak) || 0), unit: '天' }
  ];

  stats.forEach(function (s) {
    var item = el('div', 'today-stat');
    var lab = el('span', 'ts-label');
    var ic = el('i', s.icon); lab.appendChild(ic);
    lab.appendChild(document.createTextNode(s.label));
    var val = el('span', 'ts-value');
    val.appendChild(document.createTextNode(s.value));
    if (s.unit) val.appendChild(el('small', null, s.unit));
    item.appendChild(lab); item.appendChild(val);
    grid.appendChild(item);
  });
}

function fmtNum(n) {
  n = Number(n) || 0;
  return n.toLocaleString('zh-CN');
}

/* 洞察类型 → 图标 */
var INSIGHT_ICONS = {
  goal_risk: 'fas fa-bullseye',
  declining_trend: 'fas fa-arrow-trend-down',
  strong_habit: 'fas fa-fire',
  anomaly: 'fas fa-wave-square',
  opportunity: 'fas fa-wand-magic-sparkles',
  info: 'fas fa-circle-info'
};

function renderInsightList(container, insights, emptyText) {
  if (!container) return;
  container.innerHTML = '';
  if (!insights || !insights.length) {
    container.appendChild(el('div', 'mini-empty', emptyText));
    return;
  }
  insights.forEach(function (ins) {
    var sev = ins.severity === 'high' ? 'high' : ins.severity === 'medium' ? 'medium' : ins.severity === 'positive' ? 'positive' : 'low';
    var item = el('div', 'insight-item sev-' + sev);
    var ic = el('span', 'ii-icon');
    ic.appendChild(el('i', INSIGHT_ICONS[ins.type] || INSIGHT_ICONS.info));
    item.appendChild(ic);
    item.appendChild(el('span', 'ii-text', String(ins.reason || '')));   // textContent：用户内容不可信
    container.appendChild(item);
  });
}

function renderPanels(snap, todayStats) {
  var ctx = currentContext || {};
  var insights = Array.isArray(ctx.insights) ? ctx.insights : [];
  var growth = ctx.growthState || GrowthIntelligence.computeGrowthState(snap);
  var weekly = GrowthIntelligence.buildWeeklyReview(snap, {}, currentCoachContext);

  renderToday(todayStats);

  // 今日发现：非目标风险的确定性洞察
  renderInsightList(
    $('#findingsList'),
    insights.filter(function (i) { return i.type !== 'goal_risk'; }),
    '暂无特别发现，保持节奏，继续记录。'
  );

  // 目标风险：goal_risk 洞察
  var risks = insights.filter(function (i) { return i.type === 'goal_risk'; });
  renderInsightList($('#riskList'), risks, '当前没有需要警惕的目标风险。');
  var rc = $('#riskCount');
  if (rc) rc.textContent = risks.length ? risks.length + ' 项' : '';

  renderInsightList(
    $('#trendList'),
    growth.importantChanges.map(function (trend) {
      return {
        type: trend.status === 'falling' ? 'declining_trend' : 'opportunity',
        severity: trend.status === 'falling' ? 'medium' : 'positive',
        reason: '最近 ' + trend.span + '，' + trend.label + '从 ' + fmtNum(trend.previous) + ' 变为 ' + fmtNum(trend.current) + '（' + (trend.delta > 0 ? '+' : '') + trend.delta + '%）'
      };
    }),
    '当前数据不足，暂时无法判断长期趋势。'
  );

  renderAdvice(growth.actionProposals.map(function (proposal) {
    CoachMemory.addRecommendation(proposal);
    return { severity: 'high', text: proposal.title + '：' + proposal.why };
  }));
  renderCoachMemory();
  renderGrowthMemory();
  renderMemoryActivation();
  renderWeeklyReview(weekly);
}

var lastSuggestions = [];

function renderAdvice(suggestions) {
  lastSuggestions = Array.isArray(suggestions) ? suggestions : [];
  var items = lastSuggestions.map(function (s) {
    return { type: 'opportunity', severity: s.severity || 'low', reason: s.text || s.reason || '' };
  });
  renderInsightList($('#adviceList'), items, '与个人 Agent 对话，这里会显示针对你的建议。');
}

function renderCoachMemory() {
  var coach = currentCoachContext || (currentSnapshot ? CoachMemory.getCoachContext(currentSnapshot) : { facts: [] });
  renderInsightList($('#memoryList'), coach.facts.map(function (fact) {
    return { type: 'opportunity', severity: 'positive', reason: fact.statement };
  }), '暂无已验证的长期策略经验。连续采纳并完成建议后，这里会积累 Coach Memory。');
}

function renderGrowthMemory() {
  var confirmed = currentContext && currentContext.memory && currentContext.memory.confirmed;
  renderInsightList($('#confirmedMemoryList'), (confirmed || []).map(function (item) {
    var lifecycle = formatLifecycle(item.lifecycle);
    return { type: 'strong_habit', severity: 'positive', reason: formatMemoryType(item.type) + '：' + item.content + (lifecycle ? ' · ' + lifecycle : '') };
  }), '暂无确认的长期规律。确认候选后，这里会显示你保留的成长规律。');
}

function evidenceText(candidate) {
  return formatEvidence(candidate && candidate.evidence);
}

function renderMemoryActivation() {
  var card = $('#cardMemoryActivation');
  var list = $('#memoryActivationList');
  if (!card || !list) return;
  var candidates = currentContext && currentContext.memory &&
    Array.isArray(currentContext.memory.candidates) ? currentContext.memory.candidates.slice(0, 2) : [];
  card.hidden = !candidates.length;
  list.innerHTML = '';

  candidates.forEach(function (candidate) {
    var item = el('li', 'activation-item');
    item.appendChild(el('p', 'activation-title', candidate.content));
    item.appendChild(el('p', 'activation-semantic', formatMemoryType(candidate.type) + '：数据显示可能趋势，尚未确认。'));
    if (candidate.evidence && candidate.evidence.length) {
      item.appendChild(el('p', 'activation-evidence', '依据：' + evidenceText(candidate)));
    }
    var actions = el('div', 'activation-actions');
    var confirm = el('button', 'btn btn-sm', '确认');
    confirm.type = 'button';
    confirm.setAttribute('data-memory-action', 'confirm');
    confirm.setAttribute('data-memory-id', candidate.id);
    var reject = el('button', 'btn btn-sm', '先不确认');
    reject.type = 'button';
    reject.setAttribute('data-memory-action', 'reject');
    reject.setAttribute('data-memory-id', candidate.id);
    actions.appendChild(confirm);
    actions.appendChild(reject);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function refreshMemoryProjection(memory) {
  if (!currentContext || !memory) return;
  currentContext.memory = GrowthMemory.buildContextMemory(memory, {
    today: currentContext.today || todayStr()
  });
  renderGrowthMemory();
  renderMemoryActivation();
}

function renderWeeklyReview(review) {
  var container = $('#weeklyReview');
  if (!container) return;
  container.innerHTML = '';
  container.appendChild(el('div', 'insight-item sev-' + (review.dataSufficient ? 'positive' : 'low'), review.dataSufficient
    ? review.range.start + ' 至 ' + review.range.end + '：本周 ' + review.performance.activeDays + ' 天活跃，' + review.performance.studyMinutes + ' 分钟学习。'
    : '本周活跃数据不足，暂时无法做完整复盘。'));
  if (review.biggestProgress) {
    container.appendChild(el('div', 'insight-item sev-positive', '最大进步：' + review.biggestProgress.label + '环比 +' + review.biggestProgress.delta + '%'));
  }
  if (review.mainProblem) {
    container.appendChild(el('div', 'insight-item sev-medium', '主要问题：' + review.mainProblem.reason));
  }
  review.possibleCauses.forEach(function (cause) {
    container.appendChild(el('div', 'insight-item', cause));
  });
  review.nextFocus.forEach(function (focus) {
    container.appendChild(el('div', 'insight-item sev-low', '下周重点：' + focus.reason));
  });
}

/* ====================================================================
   右列：AI 对话（memory-first：内存 + sessionStorage）
   ==================================================================== */

var HISTORY_KEY = 'cg_ai_coach_history';
var MAX_HISTORY = 20;          // 内存里最多保留 20 条（10 轮）
var chatHistory = [];          // [{ role: 'user'|'assistant', content }]
var sending = false;

function loadHistory() {
  chatHistory = [];
  try {
    var raw = sessionStorage.getItem(HISTORY_KEY);
    if (raw) {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        chatHistory = arr.filter(function (m) {
          return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
        }).slice(-MAX_HISTORY);
      }
    }
  } catch (_) { chatHistory = []; }
  // 回放历史到界面
  chatHistory.forEach(function (m) { appendMsg(m.role, m.content); });
  renderConversationHistory();
}

function saveHistory() {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory.slice(-MAX_HISTORY))); } catch (_) {}
}

function renderConversationHistory() {
  var container = $('#conversationHistory');
  if (!container) return;
  container.innerHTML = '';
  var recent = chatHistory.filter(function (m) { return m.role === 'user'; }).slice(-5).reverse();
  if (!recent.length) {
    container.appendChild(el('div', 'agent-history-item', '暂无历史会话。'));
    return;
  }
  recent.forEach(function (message) {
    var text = String(message.content || '');
    container.appendChild(el('div', 'agent-history-item', text.length > 48 ? text.slice(0, 48) + '…' : text));
  });
}

function appendAgentMessage(role, text) {
  var box = $('#agentMessages');
  if (!box) return null;
  var wrap = el('div', 'msg msg-' + (role === 'user' ? 'user' : 'ai'));
  var content = el('div', 'msg-content');
  content.appendChild(el('div', 'msg-bubble', String(text == null ? '' : text)));
  wrap.appendChild(content);
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
  return content;
}

function appendAgentTyping() {
  return appendAgentMessage('assistant', '正在理解你的问题...');
}

function renderAgentEvidence(content, evidence) {
  if (!Array.isArray(evidence) || !evidence.length || !content) return;
  var details = el('details', 'agent-evidence');
  details.appendChild(el('summary', null, '基于你的学习记录'));
  evidence.slice(0, 5).forEach(function (item) {
    details.appendChild(el('p', 'agent-evidence-item', item.title + ' · ' + item.source));
  });
  content.appendChild(details);
}

function renderAgentActions(content, actions) {
  if (!Array.isArray(actions) || !actions.length || !content) return;
  actions.forEach(function (action) {
    if (!action || action.status !== 'proposal' || action.requiresConfirmation !== true) return;
    var proposal = el('div', 'agent-action-proposal');
    proposal.appendChild(el('p', null, action.title + '（需要你确认）'));
    var button = el('button', 'personal-agent-button primary', '确认行动');
    button.type = 'button';
    button.addEventListener('click', function () {
      button.disabled = true;
      globalThis.CGAPI.learningAgent.confirmNextAction(action.courseId).then(function (result) {
        appendAgentMessage('assistant', result && result.status === 'action_ready'
          ? '行动已确认，可以在 Agent Home 继续学习。'
          : '当前没有可确认的学习行动。');
      }).catch(function () {
        button.disabled = false;
        appendAgentMessage('assistant', '行动确认暂时不可用，请稍后再试。');
      });
    });
    proposal.appendChild(button);
    content.appendChild(proposal);
  });
}

function sendAgentMessage(text) {
  text = String(text || '').trim();
  if (!text || sending) return;
  appendAgentMessage('user', text);
  var input = $('#agentInput');
  if (input) input.value = '';
  var typing = appendAgentTyping();
  setBusy(true);
  globalThis.CGAPI.personalAgent.chat({
    message: text,
    mode: agentMode,
    conversationId: agentConversationId
  }).then(function (response) {
    typing.remove();
    var data = response && response.data ? response.data : {};
    var content = appendAgentMessage('assistant', data.answer || '当前没有生成回答。');
    if (agentMode === 'personal') renderAgentEvidence(content, data.evidence);
    renderAgentActions(content, data.actions);
    if (data.metadata && data.metadata.fallback) {
      appendAgentMessage('assistant', 'Provider 暂不可用，已使用安全兜底回答。');
    }
    chatHistory.push({ role: 'user', content: text });
    chatHistory.push({ role: 'assistant', content: data.answer || '' });
    chatHistory = chatHistory.slice(-MAX_HISTORY);
    saveHistory();
    renderConversationHistory();
  }).catch(function (err) {
    typing.remove();
    appendAgentMessage('assistant', friendlyAIError(err));
  }).finally(function () {
    setBusy(false);
  });
}

function renderAgentContextItem(container, label, value) {
  var item = el('div', 'agent-context-item');
  item.appendChild(el('p', 'agent-context-label', label));
  item.appendChild(el('p', 'agent-context-value', value));
  container.appendChild(item);
}

function renderAgentContext(context) {
  var container = $('#agentContextItems');
  if (!container) return;
  container.innerHTML = '';
  var behavior = context.context && context.context.behavior && context.context.behavior.value || {};
  var task = behavior.taskSummary || {};
  var focus = behavior.focusSummary || {};
  var knowledge = context.context && context.context.knowledgeStates && context.context.knowledgeStates.value || {};
  var course = context.context && context.context.courses && context.context.courses.value && context.context.courses.value[0];
  renderAgentContextItem(container, 'Today State', (task.completed || 0) + '/' + (task.total || 0) + ' 任务 · ' + (focus.minutes || 0) + ' 分钟专注');
  renderAgentContextItem(container, 'Learning State', (knowledge.weakTopics || []).length + ' 个薄弱 · ' + (knowledge.strongTopics || []).length + ' 个已掌握');
  renderAgentContextItem(container, 'Course', course ? course.name : '暂无课程');
  renderAgentContextItem(container, 'Review', context.review && context.review.nextBestRecommendation
    ? context.review.nextBestRecommendation.nodeTitle || '待复习'
    : '暂无复习项');
  renderAgentContextItem(container, 'Insights', context.previousInsights.length
    ? context.previousInsights.map(function (item) { return item.title; }).join('；')
    : '暂无结构化洞察');
  renderAgentIdentity(context);
  renderAgentExecutionTimeline(context);
  renderAgentContextPulse(context);
}

function boundaryValue(context, key) {
  var boundary = context && context.context && context.context[key];
  return boundary && boundary.value || {};
}

function renderAgentIdentityStatus(text, busy) {
  var host = $('#agentIdentityStatus');
  if (!host) return;
  host.replaceChildren(agentStatus({ text: text, busy: busy, meta: 'Read-only' }));
}

function renderAgentIdentity(context) {
  var behavior = boundaryValue(context, 'behavior');
  var knowledge = boundaryValue(context, 'knowledgeStates');
  var memoryBoundary = context && context.context && context.context.memories;
  var memory = memoryBoundary && memoryBoundary.growth && memoryBoundary.growth.value || {};
  var memoryItems = Array.isArray(memory.items) ? memory.items : [];
  var task = behavior.taskSummary || {};
  var focus = behavior.focusSummary || {};
  var weak = Array.isArray(knowledge.weakTopics) ? knowledge.weakTopics : [];
  var strong = Array.isArray(knowledge.strongTopics) ? knowledge.strongTopics : [];
  var host = $('#agentIdentityMetrics');
  if (!host) return;
  host.replaceChildren(agentMetrics([
    { label: 'Tasks', value: (task.completed || 0) + '/' + (task.total || 0), note: 'Today' },
    { label: 'Focus', value: (focus.minutes || 0) + 'm', note: 'Current session' },
    { label: 'Weak', value: String(weak.length), note: 'Knowledge nodes' },
    { label: 'Memory', value: String(memoryItems.length), note: 'Confirmed items' },
  ]));
}

function renderAgentExecutionTimeline(context) {
  var host = $('#agentExecutionTimeline');
  if (!host) return;
  var plan = context && context.plan;
  var actions = Array.isArray(context && context.actions) ? context.actions : [];
  var practice = context && context.practice && Array.isArray(context.practice.attempts)
    ? context.practice.attempts : [];
  var items = [];
  if (plan && Array.isArray(plan.blocks)) {
    plan.blocks.forEach(function (block) {
      items.push({
        title: block.nodeTitle || 'Learning action',
        meta: (block.minutes || 0) + ' min · ' + (block.reason || 'learning state'),
        badge: block.kind || 'plan',
        tone: 'accent',
      });
    });
  }
  actions.forEach(function (action) {
    items.push({
      title: action.title || 'Action proposal',
      meta: action.reason || 'Awaiting explicit confirmation',
      badge: 'Pending',
      tone: 'accent',
    });
  });
  practice.forEach(function (attempt) {
    items.push({
      title: 'Practice attempt',
      meta: attempt.createdAt || 'Completed practice evidence',
      badge: 'Evidence',
      tone: 'positive',
    });
  });
  host.replaceChildren(agentTimeline(items, '当前没有待执行或刚完成的 Agent 行动。'));
}

function renderAgentContextPulse(context) {
  var host = $('#agentContextPulse');
  if (!host) return;
  var knowledge = boundaryValue(context, 'knowledgeStates');
  var courseKnowledge = boundaryValue(context, 'courseKnowledge');
  var memoryBoundary = context && context.context && context.context.memories;
  var memory = memoryBoundary && memoryBoundary.growth && memoryBoundary.growth.value || {};
  var weak = Array.isArray(knowledge.weakTopics) ? knowledge.weakTopics : [];
  var strong = Array.isArray(knowledge.strongTopics) ? knowledge.strongTopics : [];
  var nodes = Array.isArray(courseKnowledge.nodes) ? courseKnowledge.nodes : [];
  var evidence = Array.isArray(courseKnowledge.evidence) ? courseKnowledge.evidence : [];
  var memoryItems = Array.isArray(memory.items) ? memory.items : [];
  var pulse = agentMetrics([
    { label: 'Course Nodes', value: String(nodes.length), note: 'Knowledge graph' },
    { label: 'Evidence', value: String(evidence.length), note: 'Bound facts' },
    { label: 'Weak', value: String(weak.length), note: 'Review pressure' },
    { label: 'Memory', value: String(memoryItems.length), note: 'Confirmed only' },
  ]);
  host.replaceChildren(pulse);
  if (!nodes.length && !evidence.length && !weak.length && !memoryItems.length) {
    host.appendChild(agentEmptyState({ text: '还没有足够的上下文信号，先补充学习记录。' }));
  }
}

function loadAgentContext() {
  return globalThis.CGAPI.personalAgent.context().then(function (response) {
    renderAgentContext(response && response.data ? response.data : {});
  }).catch(function () {
    renderAgentContext({ context: {}, previousInsights: [] });
  });
}

function clearGreeting() {
  var g = $('#chatGreeting');
  if (g) g.remove();
}

function appendMsg(role, text) {
  clearGreeting();
  var wrap = el('div', 'msg msg-' + (role === 'user' ? 'user' : 'ai'));
  var av = el('div', 'msg-avatar');
  av.appendChild(el('i', role === 'user' ? 'fas fa-user' : 'fas fa-compass'));
  var content = el('div', 'msg-content');
  var bubble = el('div', 'msg-bubble', String(text == null ? '' : text));   // textContent 渲染
  content.appendChild(bubble);
  wrap.appendChild(av); wrap.appendChild(content);
  var box = $('#chatMessages');
  if (box) box.appendChild(wrap);
  scrollChat();
  return content;
}

function appendSystem(text) {
  clearGreeting();
  var wrap = el('div', 'msg msg-system');
  var content = el('div', 'msg-content');
  content.appendChild(el('div', 'msg-bubble', String(text == null ? '' : text)));
  wrap.appendChild(content);
  var box = $('#chatMessages');
  if (box) box.appendChild(wrap);
  scrollChat();
}

function appendTyping() {
  clearGreeting();
  var wrap = el('div', 'msg msg-ai');
  var av = el('div', 'msg-avatar');
  av.appendChild(el('i', 'fas fa-compass'));
  var content = el('div', 'msg-content');
  var bubble = el('div', 'msg-bubble');
  var dots = el('span', 'typing-dots');
  for (var i = 0; i < 3; i++) dots.appendChild(el('span'));
  bubble.appendChild(dots);
  content.appendChild(bubble);
  wrap.appendChild(av); wrap.appendChild(content);
  var box = $('#chatMessages');
  if (box) box.appendChild(wrap);
  scrollChat();
  return wrap;
}

function scrollChat() {
  var box = $('#chatMessages');
  if (box) box.scrollTop = box.scrollHeight;
}

/* actions 第一版只允许 navigate */
var ACTION_LABELS = {
  goals: '查看目标', stats: '查看统计', workbench: '去工作台'
};
var ACTION_HREFS = {
  goals: 'goals.html', stats: 'stats.html', workbench: 'workbench.html'
};

function renderActions(container, actions) {
  if (!Array.isArray(actions)) return;
  actions.forEach(function (a) {
    if (!a || a.type !== 'navigate' || !ACTION_HREFS[a.target]) return;  // 白名单外直接丢弃
    var btn = el('button', 'action-btn', ACTION_LABELS[a.target]);
    btn.type = 'button';
    btn.addEventListener('click', function () { window.location.href = ACTION_HREFS[a.target]; });
    container.appendChild(btn);
  });
}

function renderSuggestionsInto(contentEl, suggestions) {
  if (!Array.isArray(suggestions) || !suggestions.length) return;
  var box = el('div', 'msg-suggestions');
  suggestions.forEach(function (s) {
    var chip = el('div', 'sugg-chip');
    chip.appendChild(el('i', 'fas fa-lightbulb'));
    chip.appendChild(el('span', null, String((s && (s.text || s.reason)) || '')));
    box.appendChild(chip);
  });
  contentEl.appendChild(box);
  scrollChat();
}

/* AI 不可用/失败 → 统一友好文案（不透出原始错误/密钥/堆栈/内部配置） */
function friendlyAIError(err) {
  var msg = err && typeof err.message === 'string' ? err.message : '';
  var code = err && err.data && err.data.error && err.data.error.code;
  // 未配置 Provider：明确告知 AI 暂未启用，同时指出页面数据分析仍然可用
  if (code === 'AI_NOT_CONFIGURED') {
    return '个人 Agent 的对话能力暂未启用，当前仍可以查看你的数据分析。';
  }
  if (err && (err.name === 'AbortError' || /abort/i.test(msg))) {
    return 'AI 响应超时，请稍后再试。';
  }
  if (/Failed to fetch|NetworkError|网络/i.test(msg) || (err && Number(err.status) === 0)) {
    return '暂时无法连接 AI 服务，请检查网络后重试。';
  }
  if (err && Number(err.status) === 429) {
    return 'AI 当前请求较多，请稍后再试。';
  }
  // 4xx 的 message 来自后端，本身就是面向用户的中文文案，可安全展示；
  // 5xx / 未知错误一律给通用文案，避免透出内部信息（纵深防御）
  if (err && Number(err.status) >= 500) {
    return 'AI 服务暂时不可用，请稍后再试。';
  }
  if (err && Number(err.status) >= 400 && msg) {
    return '个人 Agent 暂时不可用：' + msg;
  }
  return '个人 Agent 暂时不可用，请稍后再试。';
}

function setBusy(on) {
  sending = on;
  var input = $('#agentInput'); var send = $('#agentSend');
  if (input) input.disabled = on;
  if (send) send.disabled = on;
  renderAgentIdentityStatus(on ? '正在处理指令...' : 'Agent Runtime Ready', on);
}

function detectReportRequest(text) {
  var value = String(text || '').toLowerCase();
  if (/monthly report|这个月|本月|月度/.test(value)) return 'monthly';
  if (/weekly report|本周|一周/.test(value)) return 'weekly';
  if (/最近.*(变化|进步)|最近.*哪里/.test(value)) return 'changes';
  return null;
}

function sendMessage(text) {
  text = String(text || '').trim();
  if (!text || sending) return;
  if (!currentContext) { toast('数据还在加载中，请稍候', 'warn'); return; }

  appendMsg('user', text);
  var input = $('#chatInput');
  if (input) { input.value = ''; input.style.height = 'auto'; }   // 清空输入框
  var typing = appendTyping();
  setBusy(true);

  var historyToSend = chatHistory.slice(-10);   // 先取历史（不含本轮问题，避免重复）

  var reportIntent = detectReportRequest(text);
  if (reportIntent && currentContext) {
    var report = currentContext.report && currentContext.report[reportIntent];
    if (!report) report = GrowthReport.buildReport(currentContext, reportIntent === 'changes' ? 'weekly' : reportIntent);
    typing.remove();
    appendMsg('assistant', reportIntent === 'changes'
      ? (report.summary || '最近暂无足够的成长变化数据。')
      : GrowthReport.formatReport(report));
    recordUser();
    setBusy(false);
    return;
  }

  function recordUser() {
    chatHistory.push({ role: 'user', content: text });
    chatHistory = chatHistory.slice(-MAX_HISTORY);
    saveHistory();
  }

  var call;
  try {
    call = globalThis.CGAPI.ai.chat({
      message: text,
      history: historyToSend,
      context: AIContext.buildQueryContext(currentSnapshot, text, { baseContext: currentContext, coachContext: currentCoachContext }),
      contextVersion: AIContext.VERSION
    });
  } catch (e) {
    // apiClient 加载/执行异常：清掉 typing 气泡、解锁，不卡死界面
    typing.remove();
    var m0 = friendlyAIError(e);
    appendSystem(m0 + (m0.indexOf('仍可以查看') > -1 ? '' : '页面下方的数据分析仍然有效。'));
    setBusy(false);
    return;
  }

  call.then(function (res) {
    typing.remove();
    var d = (res && res.data) ? res.data : (res || {});
    var reply = typeof d.reply === 'string' && d.reply ? d.reply : '（个人 Agent 这次没有给出回复，换个问法试试？）';
    var content = appendMsg('assistant', reply);       // textContent 渲染

    renderSuggestionsInto(content, d.suggestions);
    if (Array.isArray(d.actions) && d.actions.length) {
      var actBox = el('div', 'msg-actions');
      renderActions(actBox, d.actions);
      content.appendChild(actBox);
    }

    recordUser();
    chatHistory.push({ role: 'assistant', content: reply });
    chatHistory = chatHistory.slice(-MAX_HISTORY);
    saveHistory();

    if (Array.isArray(d.suggestions) && d.suggestions.length) renderAdvice(d.suggestions);
    setBusy(false);
  }).catch(function (err) {
    typing.remove();
    var m = friendlyAIError(err);
    // 降级引导：失败时指出页面数据分析仍然有效，而不是让整页看起来「坏了」
    appendSystem(m + (m.indexOf('仍可以查看') > -1 ? '' : '页面下方的数据分析仍然有效。'));
    recordUser();   // 失败也入历史，保持 UI 与历史一致
    setBusy(false);
  });
}

/* ====================================================================
   加载流程
   ==================================================================== */

var loadToken = 0;

function afterPaint(callback) {
  setTimeout(callback, 0);
}

function loadAll() {
  var token = ++loadToken;
  showDash();
  afterPaint(function () {
    if (token !== loadToken) return;
    try {
      var snap = Store.get();
      var ctx = buildContext(snap);
      if (!AIContext.hasEvidence(ctx)) { showEmpty(); return; }
      renderPanels(snap, buildTodayStats(snap));
      showDash();
    } catch (e) {
      showError();
      console.warn('[AI] load failed:', e);
    }
  });
  loadAgentContext();
}

function loadPersonalAgentExperience() {
  var target = $('#personalAgentExperience');
  if (!target) return;
  var hour = new Date().getHours();
  var greeting = hour < 12 ? '早上好。' : hour < 18 ? '下午好。' : '晚上好。';
  createPersonalAgentExperience({
    target,
    service: createAgentHomeService(),
    greeting,
    availableMinutes: 60,
  }).load();
}

/* ---------- 事件绑定 ---------- */
function setupEvents() {
  var send = $('#agentSend'); if (send) send.addEventListener('click', function () { sendAgentMessage($('#agentInput') ? $('#agentInput').value : ''); });
  var input = $('#agentInput');
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAgentMessage(input.value); }
    });
    // 自适应高度
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    });
  }

  var newChat = $('#newAgentChat');
  if (newChat) newChat.addEventListener('click', function () {
    chatHistory = [];
    saveHistory();
    renderConversationHistory();
    var messages = $('#agentMessages');
    if (messages) messages.replaceChildren(el('div', 'mini-empty', '新会话已开始。'));
  });
  var personalMode = $('#agentModePersonal');
  var generalMode = $('#agentModeGeneral');
  if (personalMode) personalMode.addEventListener('click', function () {
    agentMode = 'personal';
    personalMode.classList.add('active'); personalMode.setAttribute('aria-pressed', 'true');
    generalMode.classList.remove('active'); generalMode.setAttribute('aria-pressed', 'false');
  });
  if (generalMode) generalMode.addEventListener('click', function () {
    agentMode = 'general';
    generalMode.classList.add('active'); generalMode.setAttribute('aria-pressed', 'true');
    personalMode.classList.remove('active'); personalMode.setAttribute('aria-pressed', 'false');
  });

  var refresh = $('#refreshBtn'); if (refresh) refresh.addEventListener('click', function () { loadAll(); toast('已刷新数据分析', 'success'); });
  var retry = $('#aiRetry'); if (retry) retry.addEventListener('click', loadAll);
  var go = $('#aiGoWorkbench'); if (go) go.addEventListener('click', function () { window.location.href = 'workbench.html'; });

  var activationList = $('#memoryActivationList');
  if (activationList) activationList.addEventListener('click', function (event) {
    var button = event.target.closest('[data-memory-action]');
    if (!button || !currentContext) return;
    var action = button.getAttribute('data-memory-action');
    var id = button.getAttribute('data-memory-id');
    var transition = action === 'confirm' ? GrowthMemory.confirmCandidate : GrowthMemory.rejectCandidate;
    var memory = transition(Store, id, { today: currentContext.today || todayStr() });
    if (!memory) {
      toast('这次没有保存成功，可以稍后再试。', 'error');
      return;
    }
    var persisted = (memory.candidates || []).find(function (item) { return item.id === id; });
    suppressNextMemoryUpdate = !!persisted &&
      persisted.status === (action === 'confirm' ? 'confirmed' : 'rejected');
    refreshMemoryProjection(memory);
    toast(action === 'confirm' ? '已记录这条成长规律。之后我会结合它提供建议。' : '已暂不记录。它不会进入长期规律。', 'success');
  });

  // 移动端侧边栏开关
  var mBtn = $('#mobileMenuBtn');
  if (mBtn) mBtn.addEventListener('click', function () { document.body.classList.toggle('sidebar-open'); });
  Array.prototype.forEach.call(document.querySelectorAll('.sidebar .nav-item'), function (a) {
    a.addEventListener('click', function () { document.body.classList.remove('sidebar-open'); });
  });
  // 移动端抽屉：点击侧边栏以外的区域关闭（此前抽屉打开后点外部不收起）
  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('sidebar-open')) return;
    if (e.target.closest && (e.target.closest('.sidebar') || e.target.closest('#mobileMenuBtn'))) return;
    document.body.classList.remove('sidebar-open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.body.classList.remove('sidebar-open');
  });

  window.addEventListener('chenguang:update', function () {
    if (suppressNextMemoryUpdate) {
      suppressNextMemoryUpdate = false;
      return;
    }
    // 数据同步后刷新画像（保持只读，不影响 revision）
    loadAll();
  });
}

/* ---------- 初始化 ---------- */
if (checkAuth()) {
  setupEvents();
  loadAll();
  loadHistory();
  loadPersonalAgentExperience();
}

/* visualViewport 高度 → --vvh：iOS 键盘弹出时视口缩小，
   .main 用它做实时高度，聊天输入框不被软键盘遮挡（Phase 15 P1；dvh 不支持的旧 iOS 也覆盖） */
if (window.visualViewport) {
  var vv = window.visualViewport;
  var applyVVH = function () {
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
  };
  vv.addEventListener('resize', applyVVH);
  applyVVH();
}

setupServiceWorker();
