'use strict';

var HANDLERS = {
  add_todo: function (store, proposal) {
    if (typeof store.addTodo !== 'function') return null;
    return store.addTodo({
      text: String(proposal.title || '').slice(0, 120),
      date: proposal.date,
      priority: ['high', 'normal', 'low'].indexOf(proposal.priority) >= 0 ? proposal.priority : 'normal',
      __aiProposalId: proposal.id
    });
  },
  check_in: function (store, proposal) {
    if (typeof store.addCheckin !== 'function') return null;
    return store.addCheckin(proposal.date, 'done');
  },
  review_goal: function (store, proposal) {
    return { navigation: 'goals', goalId: proposal.evidence && proposal.evidence.goalId };
  },
  navigate: function (store, proposal) {
    return { navigation: proposal.target };
  }
};

var feedbackLog = [];

function validateProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return null;
  var id = String(proposal.id || '').trim();
  var type = String(proposal.type || '').trim();
  if (!id || id.length > 80 || !HANDLERS[type]) return null;
  if (type === 'add_todo') {
    var title = String(proposal.title || '').trim();
    if (!title || title.length > 120) return null;
  }
  if (proposal.requiresConfirmation === false) return null;
  return { id: id, type: type };
}

function applyProposal(store, proposal) {
  if (!store || typeof store.get !== 'function') throw new TypeError('Business store is required');
  var clean = validateProposal(proposal);
  if (!clean) return { accepted: false, reason: 'unsupported_or_unconfirmed' };
  var before = JSON.stringify(store.get());
  var result = HANDLERS[clean.type](store, proposal);
  if (result == null) return { accepted: false, reason: 'action_unavailable' };
  feedbackLog.push({
    id: clean.id,
    type: clean.type,
    title: clean.type === 'add_todo' ? String(proposal.title || '').slice(0, 120) : '',
    acceptedAt: new Date().toISOString(),
    outcome: clean.type === 'add_todo' ? 'created' : 'opened'
  });
  return { accepted: true, before: before, result: result, feedback: feedbackLog[feedbackLog.length - 1] };
}

function observeOutcome(store, sinceDate) {
  var snap = store && store.get ? store.get() : {};
  var todos = Array.isArray(snap.todos) ? snap.todos : [];
  return feedbackLog.map(function (item) {
    var matched = todos.filter(function (todo) {
      return todo && todo.__aiProposalId === item.id;
    });
    var done = matched.some(function (todo) { return todo.done; });
    return {
      id: item.id,
      type: item.type,
      status: done ? 'completed' : (matched.length ? 'in_progress' : 'pending'),
      observedAt: new Date().toISOString()
    };
  }).filter(function (item) { return !sinceDate || item.observedAt >= sinceDate; });
}

function clearFeedback() {
  feedbackLog = [];
}

var AIActions = { applyProposal: applyProposal, observeOutcome: observeOutcome, clearFeedback: clearFeedback };
globalThis.CGAIActions = AIActions;
export default AIActions;
export { applyProposal, observeOutcome, clearFeedback };
