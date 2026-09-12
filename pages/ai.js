import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';
import Analytics from '../js/analytics.js';
import CGAIContext from '../js/aiContext.js';

// ====================================================================
// 晨光自律台 · AI 教练页 (Phase 13 AI 2.0)
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
  if (!token) { toast('请先登录', 'error'); setTimeout(function () { window.location.href = 'index.html'; }, 800); return false; }
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
function showDash() { hideAll(); if (dashEl) dashEl.hidden = false; }

/* ====================================================================
   上下文（AIContext Builder 产物，只读）
   ==================================================================== */

var currentContext = null;

function buildContext() {
  var store = Store.get();                     // 只读一次
  currentContext = AIContext.buildContext(store);
  return currentContext;
}

/* ====================================================================
   左列：今日状态 / 今日发现 / 目标风险 / AI 建议
   ==================================================================== */

function renderToday() {
  var grid = $('#todayGrid');
  if (!grid) return;
  grid.innerHTML = '';                         // 容器清空，条目全部 textContent 构建

  var today = todayStr();
  var snap = Store.get();
  var day = Analytics.getDateRangeSummary(today, today, snap);
  var study = Analytics.getStudySummary(today, today, snap);
  var ex = Analytics.getExerciseSummary(today, today, snap);
  var todos = Analytics.getTodoSummary(today, today, snap, today);
  var streaks = Analytics.getStreaks(snap, { today: today });

  var stats = [
    { icon: 'fas fa-calendar-check', label: '今日打卡', value: (streaks && streaks.todayDone) ? '✓' : '未', unit: '' },
    { icon: 'fas fa-stopwatch', label: '专注', value: fmtNum((day && day.focus && day.focus.minutes) || 0), unit: 'min' },
    { icon: 'fas fa-book-open', label: '学习', value: fmtNum((study && study.minutes) || 0), unit: 'min' },
    { icon: 'fas fa-dumbbell', label: '运动', value: fmtNum((ex && ex.minutes) || 0), unit: 'min' },
    { icon: 'fas fa-list-check', label: '待办完成', value: fmtNum((todos && todos.done) || 0) + '/' + fmtNum((todos && todos.total) || 0), unit: '' },
    { icon: 'fas fa-fire', label: '连续自律', value: fmtNum((streaks && streaks.currentStreak) || 0), unit: '天' }
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

function renderPanels() {
  var ctx = currentContext || {};
  var insights = Array.isArray(ctx.insights) ? ctx.insights : [];

  renderToday();

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

  // AI 建议：初始为确定性建议，AI 回复后由 response.suggestions 更新
  renderAdvice(ctx && ctx.insights ? ctx.insights.slice(0, 3) : []);
}

var lastSuggestions = [];

function renderAdvice(suggestions) {
  lastSuggestions = Array.isArray(suggestions) ? suggestions : [];
  var items = lastSuggestions.map(function (s) {
    return { type: 'opportunity', severity: s.severity || 'low', reason: s.text || s.reason || '' };
  });
  renderInsightList($('#adviceList'), items, '和教练聊聊，这里会显示针对你的建议。');
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
}

function saveHistory() {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory.slice(-MAX_HISTORY))); } catch (_) {}
}

function clearGreeting() {
  var g = $('#chatGreeting');
  if (g) g.remove();
}

function appendMsg(role, text) {
  clearGreeting();
  var wrap = el('div', 'msg msg-' + (role === 'user' ? 'user' : 'ai'));
  var av = el('div', 'msg-avatar');
  av.appendChild(el('i', role === 'user' ? 'fas fa-user' : 'fas fa-robot'));
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
  av.appendChild(el('i', 'fas fa-robot'));
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
    return 'AI 教练暂未启用，当前仍可以查看你的数据分析。';
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
    return 'AI 教练暂时不可用：' + msg;
  }
  return 'AI 教练暂时不可用，请稍后再试。';
}

function setBusy(on) {
  sending = on;
  var input = $('#chatInput'); var send = $('#chatSend');
  if (input) input.disabled = on;
  if (send) send.disabled = on;
  var qs = document.querySelectorAll('.quick-q');
  Array.prototype.forEach.call(qs, function (b) { b.disabled = on; });
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
      context: currentContext,
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
    var reply = typeof d.reply === 'string' && d.reply ? d.reply : '（教练这次没有给出回复，换个问法试试？）';
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

function loadAll() {
  showLoading();
  try {
    var ctx = buildContext();
    if (!AIContext.hasEvidence(ctx)) { showEmpty(); return; }
    renderPanels();
    showDash();
  } catch (e) {
    showError();
    console.warn('[AI] load failed:', e);
  }
}

/* ---------- 事件绑定 ---------- */
function setupEvents() {
  var send = $('#chatSend'); if (send) send.addEventListener('click', function () { sendMessage($('#chatInput') ? $('#chatInput').value : ''); });
  var input = $('#chatInput');
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); }
    });
    // 自适应高度
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    });
  }

  // 快捷问题（5 个固定问题）
  Array.prototype.forEach.call(document.querySelectorAll('.quick-q'), function (b) {
    b.addEventListener('click', function () { sendMessage(b.getAttribute('data-q') || ''); });
  });

  var refresh = $('#refreshBtn'); if (refresh) refresh.addEventListener('click', function () { loadAll(); toast('已刷新数据分析', 'success'); });
  var retry = $('#aiRetry'); if (retry) retry.addEventListener('click', loadAll);
  var go = $('#aiGoWorkbench'); if (go) go.addEventListener('click', function () { window.location.href = 'workbench.html'; });

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
    // 数据同步后刷新画像（保持只读，不影响 revision）
    loadAll();
  });
}

/* ---------- 初始化 ---------- */
if (checkAuth()) {
  setupEvents();
  loadAll();
  loadHistory();
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

/* 注册 Service Worker（仅 http(s) 环境） */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').catch(function (e) { console.warn('[AI] SW register failed:', e); });
  });
}
