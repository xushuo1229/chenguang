/**
 * Zeno · 今日计划页
 * 数据来源：CGStore.getTodosByDate(todayStr())
 * 所有增删改查通过 CGStore API，不直接读写 localStorage。
 */
import '../js/store.js';
import '../js/analytics.js';
import { todayStr, fmtDate } from '../js/utils/date.js';
import { homeAuthHref } from '../js/utils/authNavigation.js';

var $ = function (sel) { return document.querySelector(sel); };

function esc(s) {
  var div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

function getStore() {
  return globalThis.CGStore || window.CGStore;
}

function checkAuth() {
  var token = localStorage.getItem('cg_token');
  if (!token) {
    setTimeout(function () { window.location.href = homeAuthHref('today.html'); }, 800);
    return false;
  }
  return true;
}

function render() {
  var store = getStore();
  var today = todayStr();
  var todos = store.getTodosByDate(today);

  $('#todayDate').textContent = fmtDate(new Date());

  var total = todos.length;
  var done = todos.filter(function (t) { return t.done; }).length;
  var pending = total - done;
  var rate = total > 0 ? Math.round((done / total) * 100) : 0;

  $('#statTotal').textContent = total;
  $('#statDone').textContent = done;
  $('#statPending').textContent = pending;
  $('#statRate').textContent = rate + '%';
  $('#progressFill').style.width = rate + '%';

  renderTasks(todos);
}

function renderTasks(todos) {
  var host = $('#taskList');
  host.innerHTML = '';

  if (!todos.length) {
    host.innerHTML =
      '<div class="tp-empty">' +
      '<i class="fas fa-clipboard-list"></i>' +
      '<p>今天还没有计划。添加一件小事，让今天有方向。</p>' +
      '</div>';
    return;
  }

  todos.forEach(function (t) {
    var row = document.createElement('div');
    row.className = 'tp-task-row' + (t.done ? ' done' : '');

    var meta = [];
    if (t.time) meta.push('<span class="tp-tag"><i class="fas fa-clock"></i> ' + esc(t.time) + '</span>');
    if (t.priority && t.priority !== 'normal') meta.push('<span class="tp-tag">' + esc(t.priority) + '</span>');

    row.innerHTML =
      // 注意：必须用 <button> 而非 <div>。iOS Safari 对非交互元素（div）的 tap 不合成 click，
      // 手指点勾选会静默失效；button 原生可交互，touch 合成 click 可靠。
      '<button type="button" class="tp-task-check' + (t.done ? ' checked' : '') + '" data-toggle="' + t.id + '" title="点击切换完成" aria-label="切换完成状态" aria-pressed="' + (t.done ? 'true' : 'false') + '">' + (t.done ? '<i class="fas fa-check"></i>' : '') + '</button>' +
      '<div class="tp-task-body">' +
      '<div class="tp-task-text">' + esc(t.text) + '</div>' +
      (meta.length ? '<div class="tp-task-meta">' + meta.join('') + '</div>' : '') +
      '</div>' +
      '<div class="tp-task-actions">' +
      '<button class="edit" data-edit="' + t.id + '" title="编辑" aria-label="编辑计划"><i class="fas fa-pen"></i></button>' +
      '<button class="del" data-del="' + t.id + '" title="删除" aria-label="删除计划"><i class="fas fa-trash"></i></button>' +
      '</div>';
    host.appendChild(row);
  });
}

function addTask() {
  var store = getStore();
  var input = $('#newTaskText');
  var timeInput = $('#newTaskTime');
  var text = input.value.trim();
  if (!text) return;

  var item = { text: text, date: todayStr(), done: false };
  if (timeInput.value) item.time = timeInput.value;

  store.addTodo(item);
  input.value = '';
  timeInput.value = '';
  render();
}

function bindEvents() {
  $('#addTaskBtn').addEventListener('click', addTask);
  $('#newTaskText').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addTask();
  });

  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      getStore().toggleTodo(toggle.getAttribute('data-toggle'));
      render();
      return;
    }

    var del = e.target.closest('[data-del]');
    if (del) {
      getStore().removeTodo(del.getAttribute('data-del'));
      render();
      return;
    }

    var edit = e.target.closest('[data-edit]');
    if (edit) {
      var id = edit.getAttribute('data-edit');
      var store = getStore();
      var todo = store.getTodos().find(function (t) { return t.id === id; });
      if (!todo) return;
      var newText = prompt('编辑计划：', todo.text);
      if (newText !== null && newText.trim() && newText.trim() !== todo.text) {
        store.updateTodo(id, { text: newText.trim() });
        render();
      }
    }
  });

  globalThis.addEventListener('chenguang:update', render);
}

if (checkAuth()) {
  bindEvents();
  render();
}
