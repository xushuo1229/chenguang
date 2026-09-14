'use strict';

var VERSION = 1;
var STORAGE_KEY = 'cg_ai_coach_memory_v1';
var MAX_RECOMMENDATIONS = 100;
var MAX_MEMORIES = 80;
var FEEDBACK_WINDOW_DAYS = 14;
var MIN_EVIDENCE_SAMPLE = 3;
var ACTION_TYPES = ['add_todo', 'check_in', 'review_goal', 'navigate'];

function readIdentity(store) {
  var account = {};
  try { account = JSON.parse(globalThis.localStorage.getItem('cg_user') || 'null') || {}; } catch (_) {}
  var user = (store && typeof store.getUser === 'function') ? (store.getUser() || {}) : ((store && store.user) || {});
  var id = account.id || account.email || account.username || user.email || user.name;
  if (!id) return null;
  return { key: String(id).slice(0, 128) };
}

function emptyStore() {
  return { version: VERSION, users: {} };
}

function emptyUser() {
  return { recommendations: [], memories: [], updatedAt: null };
}

function readStore() {
  var parsed = emptyStore();
  try {
    var raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return parsed;
    parsed = JSON.parse(raw);
  } catch (_) {
    return emptyStore();
  }
  if (!parsed || parsed.version !== VERSION || typeof parsed.users !== 'object' || !parsed.users) return emptyStore();
  return parsed;
}

function saveStore(store, identity) {
  store.updatedAt = new Date().toISOString();
  var user = store.users[identity.key] || emptyUser();
  user.recommendations = user.recommendations.slice(-MAX_RECOMMENDATIONS);
  user.memories = user.memories.slice(-MAX_MEMORIES);
  store.users[identity.key] = user;
  var userKeys = Object.keys(store.users);
  if (userKeys.length > 20) {
    userKeys.sort(function (a, b) {
      return String((store.users[a] || {}).updatedAt || '').localeCompare(String((store.users[b] || {}).updatedAt || ''));
    }).slice(0, userKeys.length - 20).forEach(function (key) { delete store.users[key]; });
  }
  try { globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (_) {}
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function strategyKey(proposal) {
  var text = String((proposal && (proposal.title || proposal.why)) || '').toLowerCase();
  if (/英语|英文|单词|english/.test(text)) return 'english_practice';
  if (/专注|番茄|focus/.test(text)) return 'short_focus';
  if (/阅读|book|read/.test(text)) return 'reading';
  if (/运动|锻炼|exercise/.test(text)) return 'exercise';
  if (/待办|任务|todo/.test(text)) return 'critical_task';
  return 'general_execution';
}

function sanitizeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return null;
  var id = String(proposal.id || '').trim();
  var type = String(proposal.type || '').trim();
  if (!id || id.length > 80 || ACTION_TYPES.indexOf(type) < 0) return null;
  return {
    recommendationId: id,
    type: type,
    title: String(proposal.title || '').slice(0, 120),
    strategyKey: strategyKey(proposal),
    why: String(proposal.why || '').slice(0, 240),
    evidence: proposal.evidence && typeof proposal.evidence === 'object' ? { source: 'growth_intelligence' } : {},
    action: {
      type: type,
      title: String(proposal.title || '').slice(0, 120),
      date: String(proposal.date || '').slice(0, 10),
      priority: String(proposal.priority || 'normal').slice(0, 10)
    }
  };
}

function findUser(store, identity) {
  if (!store.users[identity.key]) store.users[identity.key] = emptyUser();
  return store.users[identity.key];
}

function expireStale(user) {
  var cutoff = isoDaysAgo(FEEDBACK_WINDOW_DAYS);
  user.recommendations.forEach(function (item) {
    if (item.status === 'proposed' && item.createdAt < cutoff) {
      item.status = 'expired';
      item.outcome = 'expired_without_action';
      item.effectiveness = 0;
      item.expiredAt = new Date().toISOString();
    } else if (item.status === 'accepted' && item.acceptedAt < cutoff) {
      item.status = 'expired';
      item.outcome = 'expired_without_completion';
      item.effectiveness = 0;
      item.expiredAt = new Date().toISOString();
    }
  });
}

function addRecommendation(proposal) {
  var identity = readIdentity(null);
  if (!identity) return { persisted: false, reason: 'unauthenticated' };
  var clean = sanitizeProposal(proposal);
  if (!clean) return { persisted: false, reason: 'invalid_proposal' };
  var store = readStore();
  var user = findUser(store, identity);
  var existing = user.recommendations.find(function (item) { return item.recommendationId === clean.recommendationId; });
  var now = new Date().toISOString();
  if (!existing) {
    existing = Object.assign(clean, { createdAt: now, status: 'proposed', effectiveness: null, outcome: null });
    user.recommendations.push(existing);
  }
  user.updatedAt = now;
  saveStore(store, identity);
  return { persisted: true, recommendation: existing };
}

function acceptProposal(proposal) {
  var identity = readIdentity(null);
  if (!identity) return { persisted: false, reason: 'unauthenticated' };
  var clean = sanitizeProposal(proposal);
  if (!clean) return { persisted: false, reason: 'invalid_proposal' };
  var store = readStore();
  var user = findUser(store, identity);
  var recommendation = user.recommendations.find(function (item) { return item.recommendationId === clean.recommendationId; });
  var now = new Date().toISOString();
  if (!recommendation) {
    recommendation = Object.assign(clean, { createdAt: now });
    user.recommendations.push(recommendation);
  }
  recommendation.status = 'accepted';
  recommendation.acceptedAt = now;
  recommendation.action = clean.action;
  recommendation.outcome = 'business_action_requested';
  recommendation.effectiveness = null;
  recommendation.completedAt = null;
  user.updatedAt = now;
  saveStore(store, identity);
  return { persisted: true, recommendation: recommendation };
}

function rejectProposal(proposal, reason) {
  var identity = readIdentity(null);
  if (!identity) return { persisted: false, reason: 'unauthenticated' };
  var clean = sanitizeProposal(proposal);
  if (!clean) return { persisted: false, reason: 'invalid_proposal' };
  var store = readStore();
  var user = findUser(store, identity);
  var recommendation = user.recommendations.find(function (item) { return item.recommendationId === clean.recommendationId; });
  var now = new Date().toISOString();
  if (!recommendation) {
    recommendation = Object.assign(clean, { createdAt: now });
    user.recommendations.push(recommendation);
  }
  recommendation.status = 'rejected';
  recommendation.rejectedAt = now;
  recommendation.outcome = 'explicit_user_rejection';
  recommendation.effectiveness = 0;
  user.updatedAt = now;
  saveStore(store, identity);
  return { persisted: true, recommendation: recommendation };
}

function summarizeFeedback(user, today) {
  var cutoffDate = new Date(Date.now() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  var groups = {};
  user.recommendations.forEach(function (item) {
    var observedAt = item.completedAt || item.expiredAt || item.rejectedAt;
    if (!observedAt || observedAt < cutoffDate) return;
    if (['completed', 'expired'].indexOf(item.status) < 0) return;
    if (!groups[item.strategyKey]) groups[item.strategyKey] = { attempts: [], ids: [] };
    groups[item.strategyKey].attempts.push(item.status === 'completed' ? 1 : 0);
    groups[item.strategyKey].ids.push(item.recommendationId);
  });
  return Object.keys(groups).map(function (key) {
    var sampleCount = groups[key].attempts.length;
    var completedCount = groups[key].attempts.reduce(function (sum, value) { return sum + value; }, 0);
    var completionRate = sampleCount ? Math.round((completedCount / sampleCount) * 100) : 0;
    var enough = sampleCount >= MIN_EVIDENCE_SAMPLE;
    return {
      strategyKey: key,
      sampleCount: sampleCount,
      completedCount: completedCount,
      completionRate: completionRate,
      insufficientEvidence: !enough,
      effectiveness: !enough ? 'unknown' : (completionRate >= 70 ? 'high' : (completionRate <= 30 ? 'low' : 'mixed')),
      statement: enough ? key + ' 策略近 14 天完成率 ' + completionRate + '%（样本 ' + sampleCount + '）。' : '',
      recommendationIds: groups[key].ids,
      observedAt: today
    };
  });
}

function deriveMemories(user, today, summaries) {
  summaries.filter(function (summary) { return !summary.insufficientEvidence; }).forEach(function (summary) {
    var memoryId = 'strategy:' + summary.strategyKey;
    var memory = user.memories.find(function (item) { return item.id === memoryId; });
    if (!memory) {
      memory = { id: memoryId, kind: 'strategy_effectiveness', strategyKey: summary.strategyKey, createdAt: today, periodStart: today };
      user.memories.push(memory);
    }
    memory.periodEnd = today;
    memory.evidence = {
      sampleCount: summary.sampleCount,
      completedCount: summary.completedCount,
      completionRate: summary.completionRate,
      recommendationIds: summary.recommendationIds
    };
    memory.statement = summary.statement;
    memory.confidence = summary.sampleCount >= 5 ? 'medium' : 'low';
    memory.updatedAt = today;
  });
}

function observeOutcomes(storeData) {
  var identity = readIdentity(storeData);
  if (!identity) return { persisted: false, outcomes: [], feedbackSummary: [] };
  var store = readStore();
  var user = findUser(store, identity);
  var now = new Date().toISOString();
  expireStale(user);
  var todos = Array.isArray(storeData && storeData.todos) ? storeData.todos : [];
  var outcomes = [];
  user.recommendations.forEach(function (item) {
    if (item.status !== 'accepted') return;
    var matched = todos.filter(function (todo) { return todo && todo.__aiProposalId === item.recommendationId; });
    if (!matched.length) return;
    var done = matched.some(function (todo) { return !!todo.done; });
    if (done) {
      item.status = 'completed';
      item.completedAt = now;
      item.outcome = 'business_data_confirmed';
      item.effectiveness = 1;
    } else {
      item.outcome = 'business_action_created';
      item.executionStatus = 'in_progress';
    }
    outcomes.push({
      recommendationId: item.recommendationId,
      type: item.type,
      strategyKey: item.strategyKey,
      status: item.status,
      observedAt: now
    });
  });
  var summaries = summarizeFeedback(user, now);
  deriveMemories(user, now, summaries);
  user.updatedAt = now;
  saveStore(store, identity);
  return { persisted: true, outcomes: outcomes, feedbackSummary: summaries };
}

function getCoachContext(storeData) {
  var identity = readIdentity(storeData);
  if (!identity) return { version: VERSION, source: 'coach_memory', available: false, facts: [], feedbackSummary: [] };
  var store = readStore();
  var user = findUser(store, identity);
  expireStale(user);
  return {
    version: VERSION,
    source: 'coach_memory',
    available: user.memories.length > 0 || user.recommendations.length > 0,
    facts: user.memories.slice(-12),
    feedbackSummary: summarizeFeedback(user, new Date().toISOString())
  };
}

function clear() {
  try { globalThis.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

var CoachMemory = {
  VERSION: VERSION,
  addRecommendation: addRecommendation,
  acceptProposal: acceptProposal,
  rejectProposal: rejectProposal,
  observeOutcomes: observeOutcomes,
  getCoachContext: getCoachContext,
  clear: clear
};

globalThis.CGCoachMemory = CoachMemory;
export default CoachMemory;
export { addRecommendation, acceptProposal, rejectProposal, observeOutcomes, getCoachContext, clear };
