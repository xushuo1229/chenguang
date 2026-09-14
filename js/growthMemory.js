'use strict';

var VERSION = '1.0';
var LIMITS = {
  patterns: 12,
  milestones: 8,
  preferences: 6,
  insights: 8
};
var CONTEXT_LIMITS = {
  patterns: 4,
  milestones: 3,
  preferences: 3,
  insights: 4
};
var EVIDENCE_KEYS = [
  'type', 'id', 'goalId', 'strategyKey', 'span', 'metric', 'delta', 'current',
  'previous', 'percentage', 'minutes', 'activeDays', 'days', 'count', 'value'
];

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value).trim().slice(0, 220);
}

function number(value) {
  var n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampWeight(value) {
  return Math.max(0, Math.min(100, Math.round(number(value))));
}

function safeEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  var out = {};
  EVIDENCE_KEYS.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return;
    var item = value[key];
    if (item == null) return;
    if (typeof item === 'number' && Number.isFinite(item)) {
      out[key] = item;
      return;
    }
    if (typeof item === 'string') {
      var clean = item.trim().slice(0, 120);
      if (clean) out[key] = clean;
    }
  });
  return out;
}

function item(kind, id, statement, evidence, confidence) {
  var cleanStatement = text(statement);
  if (!cleanStatement) return null;
  return {
    id: text(id) || kind + ':' + cleanStatement.slice(0, 40),
    kind: kind,
    statement: cleanStatement,
    evidence: safeEvidence(evidence),
    confidence: ['low', 'medium', 'high'].indexOf(confidence) >= 0 ? confidence : 'low',
    weight: 50,
    status: 'active',
    createdAt: '',
    lastSeenAt: '',
    occurrences: 1
  };
}

function trendFor(context, span, metric) {
  var trends = (context.growth && context.growth.trends) || {};
  var range = trends[span + 'd'] || {};
  return range[metric] || range.learningTrend || {};
}

function summaryFor(context, domain) {
  var state = context.growthState || {};
  var publicName = domain.replace(/State$/, '');
  return ((state[domain] || state[publicName]) && (state[domain] || state[publicName]).summary) || {};
}

function sufficient(context) {
  var state = context.growthState || {};
  var score = (context.growth && context.growth.score) || {};
  return !((state.dataSufficiency && state.dataSufficiency.overall === false) ||
    score.dataSufficient === false);
}

function addUnique(list, candidate) {
  if (!candidate || list.some(function (item) { return item.id === candidate.id; })) return;
  if (list.length >= LIMITS[candidate.kind === 'habit_pattern' ? 'patterns' : candidate.kind === 'growth_milestone' ? 'milestones' : candidate.kind === 'preference' ? 'preferences' : 'insights']) return;
  list.push(candidate);
}

function buildHabitPatterns(context) {
  var out = [];
  var learning30 = trendFor(context, 30, 'study');
  var learning90 = trendFor(context, 90, 'study');
  var focus30 = trendFor(context, 30, 'focus');
  var english30 = trendFor(context, 30, 'english');
  var consistency = summaryFor(context, 'consistencyState');

  if (learning30.status === 'rising' && number(learning30.delta) >= 20) {
    addUnique(out, item('habit_pattern', 'pattern:study_rising_30d', '过去 30 天学习投入呈上升趋势。', { span: '30d', metric: 'study', delta: learning30.delta }, 'medium'));
  }
  if (learning90.status === 'rising' && number(learning90.delta) >= 20) {
    addUnique(out, item('habit_pattern', 'pattern:study_rising_90d', '过去 90 天学习节奏保持长期改善。', { span: '90d', metric: 'study', delta: learning90.delta }, 'medium'));
  }
  if (focus30.status === 'rising' && number(focus30.delta) >= 20) {
    addUnique(out, item('habit_pattern', 'pattern:focus_rising_30d', '专注练习在过去 30 天逐步增强。', { span: '30d', metric: 'focus', delta: focus30.delta }, 'medium'));
  }
  if (english30.status === 'rising' && number(english30.delta) >= 20) {
    addUnique(out, item('habit_pattern', 'pattern:english_rising_30d', '英语学习在过去 30 天形成上升节奏。', { span: '30d', metric: 'english', delta: english30.delta }, 'medium'));
  }
  if (number(consistency.activeDays30) >= 12 || number(consistency.currentStreak) >= 7) {
    addUnique(out, item('habit_pattern', 'pattern:consistent_execution', '你已经形成较稳定的执行习惯，活跃记录保持在 7 天以上。', { activeDays: consistency.activeDays30, days: consistency.currentStreak }, 'medium'));
  }
  return out;
}

function buildChallengePatterns(context) {
  var out = [];
  [30, 90].forEach(function (span) {
    ['study', 'focus', 'english', 'exercise'].forEach(function (metric) {
      var trend = trendFor(context, span, metric);
      if (trend.status !== 'falling' || number(trend.delta) > -20) return;
      addUnique(out, item('habit_pattern', 'pattern:' + metric + '_declining_' + span + 'd', text(metric + '学习容易在较长周期出现中断。') || '这项习惯在较长周期容易中断。', { span: span + 'd', metric: metric, delta: trend.delta }, 'medium'));
    });
  });
  return out;
}

function buildMilestones(context) {
  var out = [];
  var consistency = summaryFor(context, 'consistencyState');
  var learning = summaryFor(context, 'learningState');
  var focus = summaryFor(context, 'focusState');
  var goal = summaryFor(context, 'goalState');
  var streak = number(consistency.currentStreak);

  [7, 30, 90].forEach(function (threshold) {
    if (streak >= threshold) {
      addUnique(out, item('growth_milestone', 'milestone:streak_' + threshold, '连续成长 ' + threshold + ' 天。', { days: threshold }, 'high'));
    }
  });
  if (number(learning.minutes30) >= 600) {
    addUnique(out, item('growth_milestone', 'milestone:learning_600_30d', '近 30 天学习投入达到 600 分钟。', { minutes: learning.minutes30 }, 'high'));
  }
  if (number(focus.minutes30) >= 180) {
    addUnique(out, item('growth_milestone', 'milestone:focus_180_30d', '近 30 天专注投入达到 180 分钟。', { minutes: focus.minutes30 }, 'high'));
  }
  if (number(goal.completed) > 0) {
    addUnique(out, item('growth_milestone', 'milestone:goal_completed', '已完成 ' + number(goal.completed) + ' 个目标。', { count: goal.completed }, 'high'));
  }
  return out;
}

function buildPreferences(context) {
  var out = [];
  var facts = arr(context.coachContext && context.coachContext.facts);
  facts.forEach(function (fact) {
    if (!fact || typeof fact !== 'object') return;
    var statement = text(fact.statement);
    var key = text(fact.strategyKey) || text(fact.id);
    if (statement && key) {
      addUnique(out, item('preference', 'preference:' + key, statement, { strategyKey: key }, 'medium'));
    }
  });
  if (arr(context.growthState && context.growthState.actionProposals).some(function (item) { return item && text(item.title); })) {
    addUnique(out, item('preference', 'preference:short_term_actions', '你更容易从短期、具体的小行动开始推进。', { type: 'short_term_actions' }, 'low'));
  }
  return out;
}

function buildInsights(context) {
  var out = [];
  var learning30 = trendFor(context, 30, 'study');
  var score = (context.growth && context.growth.score) || {};
  if (learning30.status === 'rising' && number(learning30.delta) >= 20) {
    addUnique(out, item('growth_insight', 'insight:learning_30d_rising', '过去 30 天学习节奏持续改善，成长动力正在积累。', { span: '30d', delta: learning30.delta }, 'medium'));
  }
  if (number(score.value) >= 70) {
    addUnique(out, item('growth_insight', 'insight:stable_growth_score', '你的成长评分保持在稳定基础之上。', { value: score.value }, 'medium'));
  }
  return out;
}

function buildMemory(context, opts) {
  opts = opts || {};
  var source = context && typeof context === 'object' ? context : {};
  var today = text(opts.today) || text(source.today);
  var enriched = sufficient(source) ? {
    growth: source.growth || {},
    growthState: source.growthState || {},
    coachContext: source.coachContext || null
  } : { growth: {}, growthState: {}, coachContext: null };

  return {
    version: VERSION,
    updatedAt: today,
    patterns: buildHabitPatterns(enriched).concat(buildChallengePatterns(enriched)).slice(0, LIMITS.patterns),
    milestones: buildMilestones(enriched),
    preferences: buildPreferences(enriched),
    insights: buildInsights(enriched)
  };
}

function normalizeItem(raw, kind, today) {
  if (!raw || typeof raw !== 'object') return null;
  var clean = item(kind, raw.id, raw.statement, raw.evidence, raw.confidence);
  if (!clean) return null;
  clean.weight = clampWeight(raw.weight == null ? 50 : raw.weight);
  clean.status = raw.status === 'inactive' ? 'inactive' : 'active';
  clean.createdAt = text(raw.createdAt) || today;
  clean.lastSeenAt = text(raw.lastSeenAt) || today;
  clean.occurrences = Math.max(1, Math.round(number(raw.occurrences) || 1));
  return clean;
}

function mergeCategory(existing, next, kind, today) {
  var map = {};
  var out = [];
  arr(existing).forEach(function (raw) {
    var clean = normalizeItem(raw, kind, today);
    if (!clean) return;
    map[clean.id] = clean;
    out.push(clean);
  });
  arr(next).forEach(function (incoming) {
    var clean = normalizeItem(incoming, kind, today);
    if (!clean) return;
    var old = map[clean.id];
    if (!old) {
      clean.createdAt = today;
      clean.lastSeenAt = today;
      map[clean.id] = clean;
      out.push(clean);
      return;
    }
    old.statement = clean.statement;
    old.evidence = clean.evidence;
    old.confidence = clean.confidence;
    old.lastSeenAt = today;
    old.status = 'active';
    old.occurrences = old.occurrences + 1;
    old.weight = clampWeight(old.weight + 10);
  });
  out.forEach(function (item) {
    if (item.lastSeenAt === today) return;
    item.weight = clampWeight(item.weight - 10);
    if (item.weight < 20) item.status = 'inactive';
  });
  out.sort(function (a, b) {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.weight - a.weight;
  });
  return out.slice(0, LIMITS[kind === 'habit_pattern' ? 'patterns' : kind === 'growth_milestone' ? 'milestones' : kind === 'preference' ? 'preferences' : 'insights']);
}

function mergeMemory(existing, next, opts) {
  opts = opts || {};
  var today = text(opts.today) || text(next && next.updatedAt);
  var old = existing && typeof existing === 'object' ? existing : {};
  var fresh = next && typeof next === 'object' ? next : {};
  return {
    version: VERSION,
    updatedAt: today,
    patterns: mergeCategory(old.patterns, fresh.patterns, 'habit_pattern', today),
    milestones: mergeCategory(old.milestones, fresh.milestones, 'growth_milestone', today),
    preferences: mergeCategory(old.preferences, fresh.preferences, 'preference', today),
    insights: mergeCategory(old.insights, fresh.insights, 'growth_insight', today)
  };
}

function buildContextMemory(memory) {
  var source = memory && typeof memory === 'object' ? memory : {};
  function select(category, kind, limit) {
    return arr(source[category])
      .filter(function (item) { return item && item.status !== 'inactive'; })
      .sort(function (a, b) { return clampWeight(b.weight) - clampWeight(a.weight); })
      .slice(0, limit)
      .map(function (item) {
        return {
          id: text(item.id),
          kind: kind,
          statement: text(item.statement),
          evidence: safeEvidence(item.evidence),
          confidence: item.confidence === 'high' || item.confidence === 'medium' ? item.confidence : 'low'
        };
      });
  }
  return {
    patterns: select('patterns', 'habit_pattern', CONTEXT_LIMITS.patterns),
    milestones: select('milestones', 'growth_milestone', CONTEXT_LIMITS.milestones),
    preferences: select('preferences', 'preference', CONTEXT_LIMITS.preferences),
    insights: select('insights', 'growth_insight', CONTEXT_LIMITS.insights)
  };
}

function updateMemory(store, context, opts) {
  opts = opts || {};
  if (!store || typeof store.getUser !== 'function' || typeof store.setUser !== 'function') return buildMemory(context, opts);
  var current = store.getUser() || {};
  var today = text(opts.today) || text(context && context.today);
  if (current.memory && current.memory.updatedAt === today) return current.memory;
  var next = mergeMemory(current.memory, buildMemory(context, opts), { today: today });
  if (JSON.stringify(current.memory || {}) === JSON.stringify(next)) return current.memory || next;
  store.setUser({ memory: next });
  return next;
}

var GrowthMemory = {
  VERSION: VERSION,
  LIMITS: LIMITS,
  CONTEXT_LIMITS: CONTEXT_LIMITS,
  buildMemory: buildMemory,
  mergeMemory: mergeMemory,
  buildContextMemory: buildContextMemory,
  updateMemory: updateMemory
};

globalThis.CGGrowthMemory = GrowthMemory;
export default GrowthMemory;
export { buildMemory, mergeMemory, buildContextMemory, updateMemory };
