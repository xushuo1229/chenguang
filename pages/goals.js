import '../js/utils/dom.js';
import '../js/utils/date.js';
import '../js/ui/toast.js';
import '../js/ui/modal.js';
import '../js/apiClient.js';
import '../js/store.js';
import '../js/sync.js';
import Analytics from '../js/analytics.js';
import GoalEngine from '../js/goals.js';

// ====================================================================
// 晨光自律台 · 目标系统 (Goals)
// ====================================================================
// 架构（Phase 12 冻结）：
//
//   用户行为数据 → CGStore → CGAnalytics → Goal Engine → Goals UI
//
// 【承诺】
//   - goals 是业务数据，存于 CGStore，随 Phase 8 同步体系穿越设备。
//   - 目标「当前进度 / 百分比 / 剩余 / 状态」全部是 Goal Engine 的实时派生值，
//     本页绝不写回 Store，也绝不自己扫描原始记录算统计。
//   - 打开 / 刷新 / 渲染页面不改 revision（纯计算 revision +0）。
// ====================================================================

'use strict';

var Store = globalThis.CGStore;

/* ---------- 目标类型展示元数据（icon 取自 fontawesome，标签复用 Goal Engine） ---------- */
var TYPE_ORDER = ['focus', 'exercise', 'reading', 'english', 'todo', 'checkin', 'course'];
var TYPE_ICON = {
  focus: 'fas fa-stopwatch', exercise: 'fas fa-dumbbell', reading: 'fas fa-book-open',
  english: 'fas fa-language', todo: 'fas fa-list-check', checkin: 'fas fa-calendar-check',
  course: 'fas fa-graduation-cap'
};

/* ---------- 认证检查 ---------- */
function checkAuth() {
  var token = Store && Store.getToken ? Store.getToken() : localStorage.getItem('cg_token');
  if (!token) { toast('请先登录', 'error'); setTimeout(function () { window.location.href = 'index.html'; }, 800); return false; }
  return true;
}

/* ---------- DOM 工具（复用全局） ---------- */
function $(s) { return document.querySelector(s); }
function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

/* ---------- 状态开关 ---------- */
var loadingEl = $('#goalsLoading'); var errorEl = $('#goalsError');
var emptyEl = $('#goalsEmpty'); var dashEl = $('#goalsDashboard');

function showLoading(on) { if (loadingEl) loadingEl.hidden = !on; }
function hideAll() { if (loadingEl) loadingEl.hidden = true; if (errorEl) errorEl.hidden = true; if (emptyEl) emptyEl.hidden = true; if (dashEl) dashEl.hidden = true; }
function showError() { hideAll(); if (errorEl) errorEl.hidden = false; }
function showEmpty() { hideAll(); if (emptyEl) emptyEl.hidden = false; }
function showDash() { hideAll(); if (dashEl) dashEl.hidden = false; }

/* ---------- 卡片渲染 ---------- */
function unitOf(g) { return GoalEngine.metricUnit(g && g.type, g && g.metric); }

function dueText(p) {
  if (p.status === 'archived') return '已归档';   // 归档卡不计剩余天数，避免与徽标语义冲突
  if (p.isComplete) return '✓ 已完成';
  if (p.isExpired) return '已过期';
  var d = p.daysRemaining;
  if (d <= 0) return '今天截止';
  return '剩余 ' + d + ' 天';
}

function badgeLabel(p) {
  switch (p.status) {
    case 'completed': return '✓ 已完成';
    case 'expired': return '已过期';
    case 'archived': return '已归档';
    default: return '进行中';
  }
}

function renderCard(p) {
  var g = p.goal || {};
  var unit = unitOf(g);
  var pct = Math.round(p.percentage);
  var over = (p.percentRaw > 100) ? '超额 ' + Math.round(p.percentRaw) + '%' : '';
  var remainingText = p.isComplete ? '目标已达成' : ('还差 ' + p.remaining + ' ' + unit);

  var actions = '';
  if (p.status === 'archived') {
    actions =
      '<button type="button" class="ga-btn" data-act="restore" data-id="' + esc(g.id) + '"><i class="fas fa-rotate-left"></i> 恢复</button>' +
      '<button type="button" class="ga-btn danger" data-act="delete" data-id="' + esc(g.id) + '"><i class="fas fa-trash"></i> 删除</button>';
  } else {
    actions =
      '<button type="button" class="ga-btn" data-act="edit" data-id="' + esc(g.id) + '"><i class="fas fa-pen"></i> 编辑</button>' +
      '<button type="button" class="ga-btn" data-act="archive" data-id="' + esc(g.id) + '"><i class="fas fa-archive"></i> 归档</button>';
  }

  return '' +
    '<div class="goal-card is-' + p.status + '" data-goal-id="' + esc(g.id) + '" data-status="' + p.status + '">' +
      '<div class="goal-head">' +
        '<h4 class="goal-title">' + esc(g.title || '未命名目标') + '</h4>' +
        '<span class="goal-badge badge-' + p.status + '">' + badgeLabel(p) + '</span>' +
      '</div>' +
      '<div class="goal-chips">' +
        '<span class="chip"><i class="' + (TYPE_ICON[g.type] || 'fas fa-tag') + '"></i> ' + esc(GoalEngine.typeLabel(g.type)) + '</span>' +
        '<span class="chip">' + esc(GoalEngine.periodLabel(g.period)) + '</span>' +
      '</div>' +
      '<div class="goal-progress-row">' +
        '<span class="goal-current"><b>' + fmtNum(p.currentValue) + '</b> / ' + fmtNum(p.targetValue) + ' ' + esc(unit) + '</span>' +
        '<span class="goal-pct">' + pct + '%</span>' +
      '</div>' +
      '<div class="progressbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + esc(g.title || '目标') + ' 完成度">' +
        '<div class="progressbar-fill" style="width:' + Math.min(100, pct) + '%;"></div>' +
      '</div>' +
      (over ? '<div class="goal-over">' + over + '</div>' : '') +
      '<div class="goal-foot">' +
        '<span>' + esc(remainingText) + '</span>' +
        '<span class="goal-due' + ((p.status === 'active' && p.isComplete === false && p.daysRemaining <= 2 && p.daysRemaining >= 0) ? ' due-warn' : '') + '">' + esc(dueText(p)) + '</span>' +
      '</div>' +
      '<div class="goal-actions">' + actions + '</div>' +
    '</div>';
}

function fmtNum(n) {
  n = Number(n) || 0;
  return n.toLocaleString('zh-CN');
}

function renderInto(el, list) {
  if (!el) return;
  el.innerHTML = list.map(renderCard).join('');
}

/* ---------- 整体渲染 ---------- */
function render(progressList, store) {
  var buckets = GoalEngine.classifyGoals(progressList);
  renderInto($('#activeGrid'), buckets.active);
  renderInto($('#completedGrid'), buckets.completed);
  renderInto($('#expiredGrid'), buckets.expired);
  renderInto($('#archivedGrid'), buckets.archived);

  if ($('#activeCount')) $('#activeCount').textContent = buckets.active.length ? buckets.active.length + ' 个' : '';
  if ($('#completedCount')) $('#completedCount').textContent = buckets.completed.length ? buckets.completed.length + ' 个' : '';
  if ($('#expiredCount')) $('#expiredCount').textContent = buckets.expired.length ? buckets.expired.length + ' 个' : '';
  if ($('#archivedCount')) $('#archivedCount').textContent = buckets.archived.length ? buckets.archived.length + ' 个' : '';

  if (!store.goals || !store.goals.length) { showEmpty(); return; }
  showDash();
}

/* ---------- 加载 ---------- */
function loadAll() {
  showLoading(true);
  try {
    var store = Store.get();              // 一次读取
    showLoading(false);

    var hasName = store.user && store.user.name;
    var nameEl = $('#welcomeName');
    if (nameEl) nameEl.textContent = hasName ? '· ' + store.user.name : '';

    var goals = Array.isArray(store.goals) ? store.goals : [];
    if (!goals.length) { showEmpty(); return; }

    var progress = GoalEngine.computeGoalsProgress(goals, store); // 全部目标一次算完
    render(progress, store);
  } catch (e) {
    // 计算层已对单条坏数据做隔离；到这里的通常是整体异常，统一进错误态
    try { showLoading(false); } catch (_) {}
    showError();
    console.warn('[Goals] render failed:', e);
  }
}

/* ---------- 表单 ---------- */
var editingId = null;

function populateTypeSelect() {
  var sel = $('#gType');
  if (!sel) return;
  sel.innerHTML = TYPE_ORDER.map(function (t) {
    return '<option value="' + t + '">' + esc(GoalEngine.typeLabel(t)) + '</option>';
  }).join('');
}
function populateMetricSelect(type) {
  var sel = $('#gMetric');
  if (!sel) return;
  var metrics = (GoalEngine.TYPE_METRICS && GoalEngine.TYPE_METRICS[type]) ? GoalEngine.TYPE_METRICS[type] : [];
  sel.innerHTML = metrics.map(function (m) {
    return '<option value="' + m + '">' + esc(GoalEngine.metricLabel(m)) + '</option>';
  }).join('');
  if (sel.options.length) sel.selectedIndex = 0;
}

function setFormDefaults() {
  var today = todayStr();
  var w = Analytics.thisWeek();            // 复用 Analytics 周界（周一~周日）
  if ($('#gStart')) $('#gStart').value = w[0];
  if ($('#gEnd')) $('#gEnd').value = w[1];
  if ($('#gPeriod')) $('#gPeriod').value = 'weekly';
  if ($('#gTitle')) $('#gTitle').value = '';
  if ($('#gTarget')) $('#gTarget').value = '';
}

function resetFormError() { var el = $('#goalFormError'); if (el) el.textContent = ''; }

function openNewModal() {
  editingId = null;
  if ($('#modalGoalTitle')) $('#modalGoalTitle').textContent = '新建目标';
  populateTypeSelect();
  var type = ($('#gType') && $('#gType').value) || 'focus';
  populateMetricSelect(type);
  setFormDefaults();
  resetFormError();
  openModal('modalGoal');
}

function openEditModal(goal) {
  editingId = goal.id;
  if ($('#modalGoalTitle')) $('#modalGoalTitle').textContent = '编辑目标';
  populateTypeSelect();
  if ($('#gTitle')) $('#gTitle').value = goal.title || '';
  if ($('#gType')) $('#gType').value = goal.type || 'focus';
  populateMetricSelect(goal.type || 'focus');
  if ($('#gMetric')) $('#gMetric').value = goal.metric || '';
  if ($('#gTarget')) $('#gTarget').value = goal.targetValue;
  if ($('#gPeriod')) $('#gPeriod').value = goal.period || 'custom';
  if ($('#gStart')) $('#gStart').value = goal.startDate || '';
  if ($('#gEnd')) $('#gEnd').value = goal.endDate || '';
  resetFormError();
  openModal('modalGoal');
}

function readForm() {
  return {
    title: ($('#gTitle') && $('#gTitle').value.trim()) || '',
    type: ($('#gType') && $('#gType').value) || '',
    metric: ($('#gMetric') && $('#gMetric').value) || '',
    targetValue: Number(($('#gTarget') && $('#gTarget').value) || 0),
    period: ($('#gPeriod') && $('#gPeriod').value) || '',
    startDate: ($('#gStart') && $('#gStart').value) || '',
    endDate: ($('#gEnd') && $('#gEnd').value) || ''
  };
}

function submitForm() {
  var def = readForm();
  var v = GoalEngine.validateGoal(def);
  var errEl = $('#goalFormError');
  if (!v.ok) {
    if (errEl) errEl.textContent = (v.errors && v.errors[0]) ? v.errors[0].message : '表单有误，请检查';
    return;
  }
  resetFormError();
  try {
    if (editingId) {
      var updated = Store.updateGoal(editingId, def);
      toast(updated ? '✅ 目标已更新' : '⚠️ 目标不存在', updated ? 'success' : 'warn');
    } else {
      var added = Store.addGoal(def);
      if (!added) { if (errEl) errEl.textContent = '目标值必须大于 0'; return; }
      toast('✅ 目标已创建', 'success');
    }
    closeModal('modalGoal');
    loadAll();   // 纯读取，revision 不变
  } catch (e) {
    if (errEl) errEl.textContent = '保存失败：' + e.message;
  }
}

/* ---------- 卡片操作 ---------- */
function onGridClick(e) {
  var btn = e.target.closest('[data-act]');
  if (!btn) return;
  var act = btn.getAttribute('data-act');
  var id = btn.getAttribute('data-id');
  if (!id) return;

  if (act === 'edit') {
    var g = Store.getGoal(id);
    if (g) openEditModal(g);
    return;
  }
  if (act === 'archive') {
    Store.archiveGoal(id);
    toast('📦 已归档目标', 'success');
    loadAll();
    return;
  }
  if (act === 'restore') {
    Store.unarchiveGoal(id);
    toast('↩️ 目标已恢复', 'success');
    loadAll();
    return;
  }
  if (act === 'delete') {
    var g2 = Store.getGoal(id);
    showConfirm('删除目标「' + esc(g2 ? (g2.title || '') : '') + '」将永久移除，且无法恢复。确认删除吗？', { title: '永久删除目标', confirmText: '删除', confirmColor: '#c4452e' })
      .then(function (ok) {
        if (ok) { Store.removeGoal(id); toast('🗑️ 目标已删除', 'success'); loadAll(); }
      });
  }
}

/* ---------- 事件绑定 ---------- */
function setupEvents() {
  var newBtn = $('#newGoalBtn'); if (newBtn) newBtn.addEventListener('click', openNewModal);
  var emptyNewBtn = $('#emptyNewGoalBtn'); if (emptyNewBtn) emptyNewBtn.addEventListener('click', openNewModal);

  var retry = $('#goalsRetry'); if (retry) retry.addEventListener('click', loadAll);

  var typeSel = $('#gType');
  if (typeSel) typeSel.addEventListener('change', function () { populateMetricSelect(typeSel.value); });

  var submit = $('#goalSubmit'); if (submit) submit.addEventListener('click', submitForm);

  $('#gTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitForm(); });

  ['activeGrid', 'completedGrid', 'expiredGrid', 'archivedGrid'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', onGridClick);
  });

  window.addEventListener('chenguang:update', loadAll);
}

/* ---------- 初始化 ---------- */
if (checkAuth()) {
  setupEvents();
  loadAll();
}

/* 注册 Service Worker（仅 http(s) 环境） */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').catch(function (e) { console.warn('[Goals] SW register failed:', e); });
  });
}