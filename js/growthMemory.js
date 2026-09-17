'use strict';

var VERSION = '2.1';
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
var CANDIDATE_TYPES = ['Preference', 'Habit', 'Pattern', 'Risk', 'Achievement', 'GoalHistory'];
var CANDIDATE_STATUSES = ['pending', 'confirmed', 'rejected', 'expired'];
var CANDIDATE_SOURCES = ['Analytics', 'GrowthIntelligence', 'Goals'];
var CANDIDATE_LIMIT = 12;
var CANDIDATE_EVIDENCE_LIMIT = 3;
var CANDIDATE_TTL_DAYS = 30;
var SENSITIVE_PATTERN = /api[_-]?key|token|password|secret|authorization|prompt|聊天|<context>|<\/context>|ignore\s+(previous|above)|system\s*[:：]|assistant\s*[:：]/i;
var EVIDENCE_KEYS = [
  'type', 'id', 'goalId', 'strategyKey', 'span', 'metric', 'delta', 'current',
  'previous', 'percentage', 'minutes', 'activeDays', 'days', 'count', 'value'
];
var MEMORY_TYPES = {
  preference: 'Preference',
  habit_pattern: 'Habit',
  growth_milestone: 'Achievement',
  growth_insight: 'Pattern'
};
var CONFIDENCE_LEVELS = { low: 0.3, medium: 0.5, high: 0.9 };
var CONTEXT_RELATION_LIMIT = 8;

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, maxLength) {
  return value == null ? '' : String(value).trim().slice(0, maxLength || 220);
}

function number(value) {
  var n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampWeight(value) {
  return Math.max(0, Math.min(100, Math.round(number(value))));
}

function clampConfidence(value) {
  if (value == null) return 0.3;
  var mapped = CONFIDENCE_LEVELS[String(value).toLowerCase()];
  if (mapped != null) return mapped;
  var confidence = number(value);
  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
}

function cleanEvidenceObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
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
  return Object.keys(out).length ? out : null;
}

function safeEvidence(value) {
  if (!value) return [];
  var values = Array.isArray(value) ? value : [value];
  return values.map(cleanEvidenceObject).filter(Boolean).slice(0, 5);
}

function ageDays(lastSeenAt, today) {
  var last = String(lastSeenAt || today || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last) || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return 0;
  var lastDate = new Date(+last.slice(0, 4), +last.slice(5, 7) - 1, +last.slice(8, 10));
  var todayDate = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  if (Number.isNaN(lastDate.getTime()) || Number.isNaN(todayDate.getTime())) return 0;
  return Math.max(0, Math.round((todayDate - lastDate) / 86400000));
}

function buildLifecycle(raw, status, confidence, today) {
  var source = raw && typeof raw === 'object' ? raw : {};
  var createdAt = text(source.createdAt) || today;
  var lastSeenAt = text(source.lastSeenAt) || today;
  var age = ageDays(lastSeenAt, today);
  var stage = status === 'inactive'
    ? 'expired'
    : confidence >= 0.8 ? 'confirmed'
      : age >= 7 ? 'aging' : 'active';
  return {
    stage: stage,
    createdAt: createdAt,
    lastSeenAt: lastSeenAt,
    updatedAt: today,
    ageDays: age
  };
}

function addDays(dateValue, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return '';
  var date = new Date(+dateValue.slice(0, 4), +dateValue.slice(5, 7) - 1, +dateValue.slice(8, 10));
  date.setDate(date.getDate() + days);
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

function isExpired(expiresAt, today) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(expiresAt || '')) && String(expiresAt) < String(today);
}

function safeCandidateContent(value) {
  var content = text(value, 220);
  return content && !SENSITIVE_PATTERN.test(content) ? content : '';
}

function safeMemoryContent(value) {
  return safeCandidateContent(value);
}

function runtimeEvidence(value, today) {
  var rows = Array.isArray(value) ? value : (value && typeof value === 'object' ? [value] : []);
  var hasInvalidSource = false;
  var out = [];
  rows.slice(0, CANDIDATE_EVIDENCE_LIMIT).forEach(function (row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    var source = text(row.source, 40);
    if (source && CANDIDATE_SOURCES.indexOf(source) < 0) {
      hasInvalidSource = true;
      return;
    }
    if (!source) source = 'Analytics';
    var metric = text(row.metric, 60) || 'growth';
    var metricValue = row.value;
    if (metricValue == null) metricValue = row.delta;
    if (metricValue == null) metricValue = row.current;
    if (metricValue == null) metricValue = row.percentage;
    if (metricValue == null) metricValue = row.count;
    if (metricValue == null) metricValue = row.activeDays;
    if (metricValue == null) metricValue = row.days;
    if (metricValue == null) metricValue = row.minutes;
    if (metricValue == null) metricValue = row.completionRate;
    if (metricValue == null) return;
    if (typeof metricValue === 'number' && !Number.isFinite(metricValue)) return;
    if (typeof metricValue === 'string') {
      metricValue = text(metricValue, 80);
      if (!metricValue || SENSITIVE_PATTERN.test(metricValue)) return;
    }
    var timestamp = text(row.timestamp, 10) || today;
    out.push({ source: source, metric: metric, value: metricValue, timestamp: timestamp });
  });
  return hasInvalidSource ? [] : out.slice(0, CANDIDATE_EVIDENCE_LIMIT);
}

function latestEvidenceAt(item, today) {
  var timestamps = runtimeEvidence(item && item.evidence, today)
    .map(function (row) { return text(row.timestamp, 10); })
    .filter(function (value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); });
  if (!timestamps.length) {
    timestamps = [text(item && (item.lastSeenAt || item.updatedAt || item.createdAt), 10) || today];
  }
  return timestamps.sort()[timestamps.length - 1];
}

function runtimeLifecycle(item, today) {
  var lastEvidenceAt = latestEvidenceAt(item, today);
  var age = ageDays(lastEvidenceAt, today);
  return {
    stage: age < 30 ? 'confirmed' : age < 90 ? 'aging' : 'expired',
    ageDays: age,
    lastEvidenceAt: lastEvidenceAt
  };
}

function evidenceStrength(evidence) {
  if (!evidence.length) return 0;
  var strongest = evidence.reduce(function (max, row) {
    return Math.max(max, Math.abs(number(row.value)));
  }, 0);
  var base = Math.min(1, 0.35 + strongest / 60);
  return Math.min(1, Math.round((base + (evidence.length - 1) * 0.1) * 100) / 100);
}

function calculateConfidence(item, opts) {
  var source = item && typeof item === 'object' ? item : {};
  var options = opts && typeof opts === 'object' ? opts : {};
  var today = text(options.today, 10) || text(source.updatedAt, 10);
  var status = text(source.status, 20).toLowerCase();
  var evidence = runtimeEvidence(source.evidence, today);
  var confirmationWeight = status === 'confirmed' ? 1 : status === 'rejected' ? 0.4 : 0.75;
  var evidenceScore = evidenceStrength(evidence);
  var lastEvidenceAt = latestEvidenceAt(source, today);
  var age = ageDays(lastEvidenceAt, today);
  var recencyWeight = status === 'expired' ? 0 :
    Math.max(0, 1 - Math.min(1, age / 90) * 0.8);
  recencyWeight = Math.round(recencyWeight * 100) / 100;
  var confidence = status === 'expired' || !evidence.length || age >= 90
    ? 0
    : evidenceScore * recencyWeight * confirmationWeight;

  return {
    confidence: Math.max(0, Math.min(1, Math.round(confidence * 100) / 100)),
    confidenceMeta: {
      evidenceScore: evidenceScore,
      recencyWeight: recencyWeight,
      confirmationWeight: confirmationWeight,
      calculatedAt: today
    }
  };
}

function normalizeCandidateEvidence(raw, fallbackSource, fallbackMetric, today) {
  var rows = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);
  var out = [];
  rows.slice(0, CANDIDATE_EVIDENCE_LIMIT).forEach(function (row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    var source = text(row.source, 40) || fallbackSource;
    if (CANDIDATE_SOURCES.indexOf(source) < 0) return;
    var metric = text(row.metric, 60) || fallbackMetric;
    var value = row.value;
    if (value == null) value = row.delta;
    if (value == null) value = row.current;
    if (value == null) value = row.percentage;
    if (value == null) value = row.count;
    if (value == null) value = row.activeDays;
    if (value == null) value = row.days;
    if (value == null) value = row.minutes;
    if (value == null) value = row.completionRate;
    if (value == null) return;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    if (typeof value === 'string') {
      value = text(value, 80);
      if (!value || SENSITIVE_PATTERN.test(value)) return;
    }
    var timestamp = text(row.timestamp, 10) || today;
    out.push({ source: source, metric: metric, value: value, timestamp: timestamp });
  });
  return out;
}

function candidateMetric(signal) {
  var type = text(signal && signal.type, 80).toLowerCase();
  if (/focus/.test(type)) return 'focus';
  if (/english/.test(type)) return 'english';
  if (/exercise|sport/.test(type)) return 'exercise';
  if (/course/.test(type)) return 'course';
  if (/todo|execution/.test(type)) return 'todo';
  if (/goal/.test(type)) return 'goal';
  if (/study|learning/.test(type)) return 'study';
  return 'growth';
}

function candidateId(type, signal) {
  var parts = [signal && signal.type, signal && signal.span, signal && signal.metric]
    .map(function (part) { return text(part, 60).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'); })
    .filter(Boolean);
  return 'candidate:' + (parts.length ? parts.join('_') : text(type, 40).toLowerCase());
}

function candidateFromSignal(signal, type, today) {
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return null;
  var content = safeCandidateContent(signal.reason || signal.message || signal.statement);
  if (!content) return null;
  var source = type === 'GoalHistory' ? 'Goals' : 'GrowthIntelligence';
  var evidence = normalizeCandidateEvidence(signal.evidence, source, candidateMetric(signal), today);
  if (!evidence.length) return null;
  return {
    id: candidateId(type, signal),
    type: type,
    content: content,
    confidence: 0.3,
    status: 'pending',
    evidence: evidence,
    createdAt: today,
    updatedAt: today,
    expiresAt: addDays(today, CANDIDATE_TTL_DAYS)
  };
}

function generateCandidates(input, opts) {
  opts = opts || {};
  var today = text(opts.today, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  var source = input && typeof input === 'object' ? input : {};
  var growth = source.growth && typeof source.growth === 'object' ? source.growth : {};
  var growthState = source.growthState && typeof source.growthState === 'object' ? source.growthState : {};
  var out = [];

  arr(growth.strengths).forEach(function (signal) {
    var type = signal && signal.type === 'goal_achieved' ? 'Achievement'
      : signal && signal.type === 'focus_habit_forming' ? 'Habit' : 'Pattern';
    var candidate = candidateFromSignal(signal, type, today);
    if (candidate && !out.some(function (item) { return item.id === candidate.id; })) out.push(candidate);
  });

  arr(growth.risks).forEach(function (signal) {
    var candidate = candidateFromSignal(signal, 'Risk', today);
    if (candidate && !out.some(function (item) { return item.id === candidate.id; })) out.push(candidate);
  });

  var completedGoals = number(growthState.goalState && growthState.goalState.summary && growthState.goalState.summary.completed);
  if (completedGoals > 0) {
    out.push({
      id: 'candidate:goal_history_completed',
      type: 'GoalHistory',
      content: '已完成 ' + completedGoals + ' 个目标。',
      confidence: 0.3,
      status: 'pending',
      evidence: [{ source: 'Goals', metric: 'completed_goals', value: completedGoals, timestamp: today }],
      createdAt: today,
      updatedAt: today,
      expiresAt: addDays(today, CANDIDATE_TTL_DAYS)
    });
  }

  var currentStreak = number(source.overview && source.overview.currentStreak);
  if (currentStreak >= 7) {
    out.push({
      id: 'candidate:consistent_execution',
      type: 'Habit',
      content: '你已经连续记录成长 ' + currentStreak + ' 天。',
      confidence: 0.3,
      status: 'pending',
      evidence: [{ source: 'Analytics', metric: 'current_streak', value: currentStreak, timestamp: today }],
      createdAt: today,
      updatedAt: today,
      expiresAt: addDays(today, CANDIDATE_TTL_DAYS)
    });
  }

  return out.slice(0, CANDIDATE_LIMIT);
}

function normalizeCandidate(raw, today) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  var type = text(raw.type, 40);
  var status = text(raw.status, 20);
  var content = safeCandidateContent(raw.content);
  if (CANDIDATE_TYPES.indexOf(type) < 0 || CANDIDATE_STATUSES.indexOf(status) < 0 || !content) return null;
  var source = type === 'GoalHistory' ? 'Goals' : 'GrowthIntelligence';
  var evidence = normalizeCandidateEvidence(raw.evidence, source, candidateMetric(raw), today);
  if (!evidence.length) return null;
  var createdAt = text(raw.createdAt, 10) || today;
  var expiresAt = text(raw.expiresAt, 10) || addDays(createdAt, CANDIDATE_TTL_DAYS);
  var nextStatus = status === 'pending' && isExpired(expiresAt, today) ? 'expired' : status;
  return {
    id: text(raw.id, 120) || type.toLowerCase() + ':' + content.slice(0, 40),
    type: type,
    content: content,
    confidence: clampConfidence(raw.confidence),
    status: nextStatus,
    evidence: evidence,
    createdAt: createdAt,
    updatedAt: text(raw.updatedAt, 10) || today,
    expiresAt: expiresAt
  };
}

function mergeCandidates(existing, incoming, today) {
  var map = {};
  var out = [];
  arr(existing).forEach(function (raw) {
    var clean = normalizeCandidate(raw, today);
    if (!clean || map[clean.id]) return;
    map[clean.id] = clean;
    out.push(clean);
  });
  arr(incoming).forEach(function (raw) {
    var clean = normalizeCandidate(raw, today);
    if (!clean) return;
    var old = map[clean.id];
    if (!old) {
      map[clean.id] = clean;
      out.push(clean);
      return;
    }
    if (old.status === 'pending' && clean.status === 'pending') {
      old.content = clean.content;
      old.evidence = clean.evidence;
      old.confidence = clampConfidence(Math.min(0.9, old.confidence + 0.1));
      old.updatedAt = today;
    }
  });
  return out.slice(0, CANDIDATE_LIMIT);
}

function item(kind, id, statement, evidence, confidence) {
  var cleanStatement = text(statement);
  if (!cleanStatement) return null;
  return {
    id: text(id) || kind + ':' + cleanStatement.slice(0, 40),
    kind: kind,
    type: MEMORY_TYPES[kind] || 'pattern',
    statement: cleanStatement,
    content: cleanStatement,
    evidence: safeEvidence(evidence),
    confidence: clampConfidence(confidence),
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

  var memory = {
    version: VERSION,
    updatedAt: today,
    patterns: buildHabitPatterns(enriched).concat(buildChallengePatterns(enriched)).slice(0, LIMITS.patterns),
    milestones: buildMilestones(enriched),
    preferences: buildPreferences(enriched),
    insights: buildInsights(enriched)
  };
  ['patterns', 'milestones', 'preferences', 'insights'].forEach(function (category) {
    arr(memory[category]).forEach(function (item) {
      item.updatedAt = today;
      item.lifecycle = buildLifecycle(item, item.status, item.confidence, today);
    });
  });
  return memory;
}

function normalizeItem(raw, kind, today) {
  if (!raw || typeof raw !== 'object') return null;
  var clean = item(kind, raw.id, raw.statement, raw.evidence, raw.confidence);
  if (!clean) return null;
  clean.weight = clampWeight(raw.weight == null ? 50 : raw.weight);
  clean.type = MEMORY_TYPES[kind] || 'pattern';
  clean.status = raw.status === 'inactive' ? 'inactive' : 'active';
  clean.createdAt = text(raw.createdAt) || today;
  clean.lastSeenAt = text(raw.lastSeenAt) || today;
  clean.updatedAt = today;
  clean.lifecycle = buildLifecycle(raw, clean.status, clean.confidence, today);
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
    old.content = clean.content;
    old.evidence = clean.evidence;
    old.type = clean.type;
    old.confidence = clean.confidence;
    old.lastSeenAt = today;
    old.updatedAt = today;
    old.status = 'active';
    old.lifecycle = buildLifecycle(old, 'active', old.confidence, today);
    old.occurrences = old.occurrences + 1;
    old.weight = clampWeight(old.weight + 10);
  });
  out.forEach(function (item) {
    if (item.lastSeenAt === today) return;
    item.weight = clampWeight(item.weight - 10);
    if (item.weight < 20) item.status = 'inactive';
    item.updatedAt = today;
    item.lifecycle = buildLifecycle(item, item.status, item.confidence, today);
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
    insights: mergeCategory(old.insights, fresh.insights, 'growth_insight', today),
    candidates: mergeCandidates(old.candidates, fresh.candidates, today)
  };
}

function normalizeMemory(memory, opts) {
  return mergeMemory({}, memory, opts);
}

function buildContextMemory(memory, opts) {
  var source = memory && typeof memory === 'object' ? memory : {};
  var today = text(opts && opts.today, 10) || text(source.updatedAt, 10);
  function confirmedFromCategory(category, kind, limit) {
    return arr(source[category])
      .filter(function (item) {
        return item && item.status !== 'inactive' &&
          (!item.lifecycle || item.lifecycle.stage !== 'expired');
      })
      .sort(function (a, b) { return clampWeight(b.weight) - clampWeight(a.weight); })
      .slice(0, limit)
      .map(function (item) {
        var confidence = calculateConfidence(item, { today: today });
        return {
          id: text(item.id),
          kind: kind,
          type: MEMORY_TYPES[kind] || 'pattern',
          content: safeMemoryContent(item.content || item.statement),
          evidence: runtimeEvidence(item.evidence, today),
          confidence: confidence.confidence,
          confidenceMeta: confidence.confidenceMeta,
          lifecycle: runtimeLifecycle(item, today)
        };
      })
      .filter(function (item) { return item.content && item.lifecycle.stage !== 'expired'; });
  }
  var confirmed = confirmedFromCategory('patterns', 'habit_pattern', CONTEXT_LIMITS.patterns)
    .concat(confirmedFromCategory('milestones', 'growth_milestone', CONTEXT_LIMITS.milestones))
    .concat(confirmedFromCategory('preferences', 'preference', CONTEXT_LIMITS.preferences))
    .concat(confirmedFromCategory('insights', 'growth_insight', CONTEXT_LIMITS.insights));
  confirmed = confirmed.concat(arr(source.candidates)
    .filter(function (item) { return item && item.status === 'confirmed'; })
    .sort(function (a, b) { return clampConfidence(b.confidence) - clampConfidence(a.confidence); })
    .slice(0, CONTEXT_LIMITS.patterns + CONTEXT_LIMITS.milestones + CONTEXT_LIMITS.preferences + CONTEXT_LIMITS.insights)
    .map(function (item) {
      var confidence = calculateConfidence(item, { today: today });
      return {
        id: text(item.id, 120),
        type: text(item.type, 40),
        content: safeCandidateContent(item.content),
        confidence: confidence.confidence,
        confidenceMeta: confidence.confidenceMeta,
        evidence: runtimeEvidence(item.evidence, today),
        lifecycle: runtimeLifecycle(item, today)
      };
    })
    .filter(function (item) { return item.content && item.evidence.length && item.lifecycle.stage !== 'expired'; }));
  var candidates = arr(source.candidates)
    .filter(function (item) { return item && item.status === 'pending'; })
    .sort(function (a, b) { return clampConfidence(b.confidence) - clampConfidence(a.confidence); })
    .slice(0, 3)
    .map(function (item) {
      var confidence = calculateConfidence(item, { today: today });
      return {
        id: text(item.id, 120),
        type: text(item.type, 40),
        content: safeCandidateContent(item.content),
        confidence: confidence.confidence,
        confidenceMeta: confidence.confidenceMeta,
        status: 'pending',
        evidence: runtimeEvidence(item.evidence, today),
        lifecycle: runtimeLifecycle(item, today)
      };
    })
    .filter(function (item) { return item.content && item.evidence.length && item.lifecycle.stage !== 'expired'; });

  var insights = confirmed.slice(0, 3).map(function (item) {
    return {
      id: 'memory-insight:' + item.id,
      type: 'MemoryInsight',
      content: '长期记录显示：' + item.content,
      confidence: item.confidence,
      sourceIds: [item.id],
      evidence: item.evidence
    };
  });

  var nodes = confirmed.concat(candidates);
  var relations = [];
  nodes.forEach(function (sourceNode) {
    var sourceMetrics = {};
    arr(sourceNode.evidence).forEach(function (row) {
      sourceMetrics[row.metric] = number(row.value);
    });
    var sourceRelations = [];
    nodes.forEach(function (targetNode) {
      if (sourceRelations.length >= 3 || !targetNode || targetNode.id === sourceNode.id) return;
      var sharedMetric = arr(targetNode.evidence).find(function (row) {
        return Object.prototype.hasOwnProperty.call(sourceMetrics, row.metric);
      });
      if (!sharedMetric) return;
      var targetValue = number(sharedMetric.value);
      var sourceValue = sourceMetrics[sharedMetric.metric];
      var type = sourceValue * targetValue < 0 ? 'conflicts'
        : sourceNode.type === targetNode.type ? 'reinforces' : 'correlates';
      var strength = Math.round(Math.min(1, Math.max(0.25, sourceNode.confidence * targetNode.confidence)) * 100) / 100;
      sourceRelations.push({ sourceId: sourceNode.id, targetId: targetNode.id, type: type, strength: strength });
    });
    relations = relations.concat(sourceRelations);
  });

  return {
    confirmed: confirmed,
    candidates: candidates,
    insights: insights,
    relations: relations.slice(0, CONTEXT_RELATION_LIMIT)
  };
}

function updateMemory(store, context, opts) {
  opts = opts || {};
  if (!store || typeof store.getUser !== 'function' || typeof store.setUser !== 'function') return normalizeMemory(null, opts);
  var current = store.getUser() || {};
  var today = text(opts.today, 10) || text(context && context.today, 10);
  if (current.memory && current.memory.updatedAt === today) return current.memory;
  var next = mergeMemory(current.memory, { candidates: generateCandidates(context, { today: today }) }, { today: today });
  if (JSON.stringify(current.memory || {}) === JSON.stringify(next)) return current.memory || next;
  store.setUser({ memory: next });
  return next;
}

function transitionCandidate(store, id, opts, nextStatus) {
  if (!store || typeof store.getUser !== 'function' || typeof store.setUser !== 'function') return null;
  var today = text(opts && opts.today, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  var targetId = text(id, 120);
  var current = store.getUser() || {};
  var memory = normalizeMemory(current.memory, { today: today });
  var changed = false;
  memory.candidates = arr(memory.candidates).map(function (item) {
    if (item.id !== targetId || item.status !== 'pending') return item;
    changed = true;
    return Object.assign({}, item, {
      status: nextStatus,
      confidence: nextStatus === 'confirmed' ? clampConfidence(item.confidence + 0.2) : item.confidence,
      updatedAt: today
    });
  });
  if (!changed) return memory;
  memory.updatedAt = today;
  store.setUser({ memory: memory });
  return memory;
}

function confirmCandidate(store, id, opts) {
  return transitionCandidate(store, id, opts, 'confirmed');
}

function rejectCandidate(store, id, opts) {
  return transitionCandidate(store, id, opts, 'rejected');
}

var GrowthMemory = {
  VERSION: VERSION,
  LIMITS: LIMITS,
  CONTEXT_LIMITS: CONTEXT_LIMITS,
  calculateConfidence: calculateConfidence,
  buildMemory: buildMemory,
  generateCandidates: generateCandidates,
  normalizeMemory: normalizeMemory,
  mergeMemory: mergeMemory,
  buildContextMemory: buildContextMemory,
  updateMemory: updateMemory,
  confirmCandidate: confirmCandidate,
  rejectCandidate: rejectCandidate
};

globalThis.CGGrowthMemory = GrowthMemory;
export default GrowthMemory;
export {
  buildMemory,
  generateCandidates,
  normalizeMemory,
  mergeMemory,
  calculateConfidence,
  buildContextMemory,
  updateMemory,
  confirmCandidate,
  rejectCandidate
};
