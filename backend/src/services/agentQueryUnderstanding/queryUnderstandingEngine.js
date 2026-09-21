'use strict';

const crypto = require('node:crypto');

const {
  deterministicUuid,
  sha256,
  validateControlPlane,
  validateQueryUnderstanding,
} = require('../agentContextSelection/contextSelectionContract');

const INPUT_FIELDS = new Set([
  'query',
  'currentCourseContext',
  'userProvidedContext',
  'conversationContext',
  'referenceTime',
]);

const QUERY_POLICY_VERSION = 'query-understanding-policy-v1';
const MAX_QUERY_CHARS = 1000;
const MAX_COURSE_REFS = 3;
const MAX_KNOWLEDGE_REFS = 5;
const MAX_USER_CONTEXT_ITEMS = 3;
const MAX_USER_CONTEXT_CHARS = 400;
const MAX_USER_CONTEXT_TOTAL_CHARS = 1200;
const MAX_CONVERSATION_TURNS = 3;
const MAX_CONVERSATION_TURN_CHARS = 400;
const MAX_CONVERSATION_TOTAL_CHARS = 1200;
const MAX_SERIALIZED_DATA_PLANE_BYTES = 4096;

const COURSE_LABELS = [
  '高等数学',
  '高数',
  '线性代数',
  '线代',
  '操作系统',
  '大学物理',
  '大学英语',
];

const KNOWLEDGE_LABELS = [
  '二阶导数',
  '牛顿第二定律',
  '换元积分',
  'TCP三次握手',
  '三次握手',
  '时间复杂度',
];

const UNSUPPORTED_PATTERNS = [
  ['planner', /(?:制定|安排).{0,12}(?:计划|日程|学习任务)|学习计划/],
  ['action', /自动(?:执行|操作|完成)|帮我(?:执行|操作|完成)/],
  ['autonomous_agent', /autonomous\s+agent|自主执行/],
  ['memory_mutation', /修改(?:记忆|memory)|删除(?:记忆|memory)/],
  ['tutor', /(?:帮我|自动)(?:教学|纠错)|tutor\s+mode/],
  ['external_tool', /(?:外部工具|打开应用|tool\s+call|执行工具)/],
  ['unrestricted_data', /(?:无限制|全部|所有).{0,8}数据/],
  ['provider_or_credential_access', /(?:api\s*key|provider|凭证|密钥)/i],
  ['health_or_mental_diagnosis', /(?:抑郁|焦虑|心理诊断|医疗诊断|健康诊断)/],
];

const USER_CONTEXT_KINDS = [
  ['preference', /我喜欢|偏好|希望/],
  ['constraint', /(?:只能|必须|不要|限制)/],
  ['learning_condition', /睡眠|状态|环境|效率|注意力/],
  ['self_report', /我/],
];

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(value, fields) {
  const actual = new Set(Object.keys(value));
  return fields.every((field) => actual.has(field)) && actual.size === fields.length;
}

function validateInput(input) {
  if (!isPlainObject(input) || !hasExactFields(input, Object.keys(input).filter((key) => INPUT_FIELDS.has(key)))) {
    throw invalid('UNKNOWN_FIELD');
  }
  if (typeof input.query !== 'string' || input.query.length === 0
    || input.query.trim().length === 0 || input.query.length > MAX_QUERY_CHARS) {
    throw invalid(input.query && input.query.length > MAX_QUERY_CHARS ? 'QUERY_TOO_LARGE' : 'EMPTY_QUERY');
  }
  if (/[\u0000-\u001f\u007f]/.test(input.query)) throw invalid('INVALID_QUERY');
  if (input.currentCourseContext !== undefined) {
    if (!isPlainObject(input.currentCourseContext)
      || !hasExactFields(input.currentCourseContext, ['displayLabel'])
      || typeof input.currentCourseContext.displayLabel !== 'string'
      || input.currentCourseContext.displayLabel.trim().length === 0
      || input.currentCourseContext.displayLabel.length > 120) {
      throw invalid('MALFORMED_INPUT');
    }
  }
  if (input.userProvidedContext !== undefined) {
    if (!Array.isArray(input.userProvidedContext)
      || input.userProvidedContext.length > MAX_USER_CONTEXT_ITEMS
      || input.userProvidedContext.some((item) => typeof item !== 'string'
        || item.trim().length === 0
        || item.length > MAX_USER_CONTEXT_CHARS)) {
      throw invalid('MALFORMED_INPUT');
    }
    const totalChars = input.userProvidedContext.reduce((sum, item) => sum + item.length, 0);
    if (totalChars > MAX_USER_CONTEXT_TOTAL_CHARS) throw invalid('USER_CONTEXT_TOO_LARGE');
  }
  if (input.conversationContext !== undefined) {
    if (!Array.isArray(input.conversationContext)
      || input.conversationContext.length > MAX_CONVERSATION_TURNS
      || input.conversationContext.some((turn) => !isPlainObject(turn)
        || !hasExactFields(turn, ['role', 'text'])
        || typeof turn.role !== 'string' || turn.role.length === 0 || turn.role.length > 20
        || typeof turn.text !== 'string' || turn.text.length === 0 || turn.text.length > MAX_CONVERSATION_TURN_CHARS)) {
      throw invalid('MALFORMED_INPUT');
    }
    const totalChars = input.conversationContext.reduce((sum, turn) => sum + turn.text.length, 0);
    if (totalChars > MAX_CONVERSATION_TOTAL_CHARS) throw invalid('CONVERSATION_CONTEXT_TOO_LARGE');
  }
  if (input.referenceTime !== undefined
    && (typeof input.referenceTime !== 'string' || input.referenceTime.length > 40
      || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2}|Z))?$/.test(input.referenceTime))) {
    throw invalid('INVALID_REFERENCE_TIME');
  }
  return input;
}

function normalizeQuery(raw) {
  const normalized = raw.normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[。！!？?]+$/g, '');
  const applied = ['unicode_nfc', 'trim_edge_whitespace', 'collapse_whitespace'];
  if (normalized.length !== raw.normalize('NFC').trim().replace(/\s+/g, ' ').length) {
    applied.push('terminal_punctuation_removal');
  }
  return {
    contractVersion: 'query-model-v1',
    raw,
    normalized,
    charCount: raw.length,
    normalizedCharCount: normalized.length,
    languageScripts: [
      ...(/[\p{Script=Han}]/u.test(raw) ? ['Han'] : []),
      ...(/[\p{Script=Latin}]/u.test(raw) ? ['Latin'] : []),
    ],
    containsMixedLanguage: /[\p{Script=Han}]/u.test(raw) && /[\p{Script=Latin}]/u.test(raw),
    normalizationApplied: applied,
  };
}

function deterministicRefId(label) {
  return deterministicUuid(sha256(label.toLowerCase()));
}

function uniqueMatches(text, labels) {
  const found = new Map();
  labels.forEach((label) => {
    const index = text.indexOf(label);
    if (index >= 0 && !found.has(label)) {
      found.set(label, { label, index });
    }
  });
  return [...found.values()].sort((a, b) => a.index - b.index || a.label.localeCompare(b.label));
}

function createCourseRef(label, index, source, explicit) {
  return {
    contractVersion: 'course-ref-v1',
    refId: deterministicRefId(label),
    displayLabel: label,
    resolvedCourseId: null,
    matchStatus: 'pending_selection_resolution',
    source,
    explicit,
    confidence: explicit ? 1 : 0.85,
    provenance: {
      origin: explicit ? 'query_text' : 'current_course_context',
      startOffset: explicit ? index : null,
      endOffset: explicit ? index + label.length : null,
    },
  };
}

function extractCourseRefs(query, currentCourseContext) {
  const refs = uniqueMatches(query, COURSE_LABELS)
    .map((match) => createCourseRef(match.label, match.index, 'user_explicit', true));
  const queryHasReference = refs.length > 0;
  if (!currentCourseContext) return refs;
  const contextLabel = currentCourseContext.displayLabel.trim();
  const contextLabelMatchesQuery = refs.some((ref) => ref.displayLabel === contextLabel
    || query.includes(contextLabel));
  if (contextLabelMatchesQuery) return refs;
  if (refs.length >= MAX_COURSE_REFS) throw invalid('TOO_MANY_REFERENCES');
  const contextualRef = createCourseRef(contextLabel, -1, 'system_context', true);
  return queryHasReference ? [...refs, contextualRef] : [contextualRef];
}

function knowledgeKind(label) {
  if (/定理|定律/.test(label)) return 'definition';
  if (/(?:导数|积分|复杂度)/.test(label)) return 'concept';
  if (/握手|算法|步骤/.test(label)) return 'procedure';
  return 'topic';
}

function createKnowledgeRef(label, source = 'user_explicit', explicit = true) {
  return {
    contractVersion: 'knowledge-ref-v1',
    refId: deterministicRefId(label),
    kind: knowledgeKind(label),
    displayLabel: label,
    resolvedKnowledgeNodeId: null,
    matchStatus: 'pending_selection_resolution',
    source,
    explicit,
    confidence: explicit ? 1 : 0.8,
    provenance: { origin: explicit ? 'query_text' : 'system_inference' },
  };
}

function extractKnowledgeRefs(query) {
  const matched = uniqueMatches(query, KNOWLEDGE_LABELS);
  if (matched.length > MAX_KNOWLEDGE_REFS) throw invalid('TOO_MANY_REFERENCES');
  const refs = matched.map((match) => createKnowledgeRef(match.label));
  const generic = query.match(/(?:解释|什么是|如何理解|定位|找一下)\s*([\p{Script=Han}\p{Script=Latin}0-9][\p{Script=Han}\p{Script=Latin}0-9\s-]{1,59})/u);
  const isDemonstrativeReference = generic && /^(?:这|那|该|它)/.test(generic[1].trim());
  if (!generic || isDemonstrativeReference) return refs;
  const label = generic[1].trim().replace(/\s+/g, ' ');
  if (COURSE_LABELS.includes(label)
    || KNOWLEDGE_LABELS.some((known) => label.includes(known))
    || refs.some((ref) => ref.displayLabel === label)) return refs;
  refs.push(createKnowledgeRef(label));
  if (refs.length > MAX_KNOWLEDGE_REFS) throw invalid('TOO_MANY_REFERENCES');
  return refs;
}

function detectUnsupported(query) {
  return UNSUPPORTED_PATTERNS.find(([, pattern]) => pattern.test(query));
}

function classifyIntent(query, unsupported) {
  if (unsupported) {
    return { value: 'unsupported', support: 'unsupported', unsupportedCapability: unsupported[0] };
  }
  if (/(?:比较|对比|区别)/.test(query)) return { value: 'compare', support: 'supported', unsupportedCapability: null };
  if (/(?:总结|汇总)/.test(query)) return { value: 'summarize', support: 'supported', unsupportedCapability: null };
  if (/(?:回顾|复习)/.test(query)) return { value: 'review', support: 'supported', unsupportedCapability: null };
  if (/(?:学习效果|学习效率|学习表现|为什么.*学(?:得|的)?(?:不好|差)|效率(?:低|下降))/.test(query)) {
    return { value: 'diagnose_learning', support: 'supported', unsupportedCapability: null };
  }
  if (/(?:反思|复盘|拖延)/.test(query)) return { value: 'reflect', support: 'supported', unsupportedCapability: null };
  if (/(?:定位|找一下|哪个章节)/.test(query)) return { value: 'locate_knowledge', support: 'supported', unsupportedCapability: null };
  if (/这个为什么不对/.test(query)) return { value: 'clarify', support: 'supported', unsupportedCapability: null };
  if (/(?:解释|为什么|怎么理解|如何理解|是什么|举个例子)/.test(query)) {
    return { value: 'explain', support: 'supported', unsupportedCapability: null };
  }
  return { value: 'unknown', support: 'unknown', unsupportedCapability: null };
}

function classifyQueryType(query, intent, ambiguityLevel, courseRefs, knowledgeRefs) {
  if (intent.value === 'unsupported') return 'unsupported_question';
  if (intent.value === 'compare') return 'comparison_question';
  if (intent.value === 'diagnose_learning') return 'learning_performance_question';
  if (intent.value === 'reflect') return 'reflection_question';
  if (ambiguityLevel === 'high') return 'ambiguous_question';
  if (intent.value === 'locate_knowledge') return 'course_navigation_question';
  if (intent.value === 'review') return knowledgeRefs.length > 0 ? 'conceptual_question' : 'reflection_question';
  if (courseRefs.length > 0 && /(?:进度|完成)/.test(query)) return 'course_navigation_question';
  if (/(?:怎么做|如何计算|步骤|操作方法)/.test(query)) return 'procedural_question';
  if (/(?:为什么|如何理解|怎么理解|含义|概念)/.test(query) || knowledgeRefs.length > 0) return 'conceptual_question';
  return 'factual_learning_question';
}

function extractTimeScope(query, referenceTime) {
  const base = {
    contractVersion: 'time-scope-v1',
    value: 'none',
    source: 'system_inferred',
    referenceTime: referenceTime || null,
    referenceTimeSource: referenceTime ? 'server_context' : null,
    timezone: referenceTime ? 'Asia/Shanghai' : null,
    explicitStart: null,
    explicitEnd: null,
    rangeDays: null,
    ambiguity: 'none',
  };
  if (/(?:昨天|昨日)/.test(query)) return { ...base, value: 'yesterday' };
  if (/(?:今天|当日)/.test(query)) return { ...base, value: 'today' };
  if (/(?:上周|上个星期)/.test(query)) return { ...base, value: 'last_week', rangeDays: 7 };
  if (/(?:这周|本周|这个星期)/.test(query)) {
    return referenceTime
      ? { ...base, value: 'this_week', source: 'user_explicit', rangeDays: 7 }
      : { ...base, value: 'ambiguous_period', ambiguity: 'missing_reference_time' };
  }
  if (/这个月|本月/.test(query)) return { ...base, value: 'current_month', rangeDays: null };
  const range = query.match(/(\d{4}-\d{2}-\d{2})\s*(?:至|到|~)\s*(\d{4}-\d{2}-\d{2})/);
  if (range) return { ...base, value: 'explicit_date_range', source: 'user_explicit', explicitStart: range[1], explicitEnd: range[2], rangeDays: null };
  const date = query.match(/\d{4}-\d{2}-\d{2}/);
  if (date) return { ...base, value: 'explicit_date', source: 'user_explicit' };
  if (/(?:最近|过去\d+天|上周和|本月和)/.test(query)) {
    return { ...base, value: 'relative_period', ambiguity: referenceTime ? 'none' : 'missing_reference_time' };
  }
  return base;
}

function detectAmbiguity(query, courseRefs, knowledgeRefs, timeScope, hasCurrentCourse, unsupported) {
  const details = [];
  const sources = [];
  const add = (source, target, reasonCode) => {
    sources.push(source);
    details.push({ kind: source, target, reasonCode });
  };
  if (courseRefs.length > 2) add('ambiguous_course', 'course_reference', 'too_many_candidates');
  if (/这个|它|那个/.test(query) && courseRefs.length === 0 && knowledgeRefs.length === 0) {
    add('ambiguous_reference', query.slice(0, 120), 'missing_antecedent');
  }
  if (timeScope.ambiguity === 'missing_reference_time') add('ambiguous_time', 'relative_time', 'missing_reference_time');
  if (!unsupported && intentSupportsAmbiguous(query) === false && courseRefs.length === 0 && knowledgeRefs.length === 0
    && timeScope.value === 'none' && !hasCurrentCourse && query.length <= 20) {
    add('ambiguous_intent', 'query', 'insufficient_learning_signals');
  }
  const conflictPresent = courseRefs.filter((ref) => ref.source === 'user_explicit').length > 0
    && courseRefs.some((ref) => ref.source === 'system_context');
  if (conflictPresent) add('multiple_possible_interpretations', 'course_scope', 'explicit_and_contextual_conflict');
  const level = details.length === 0 ? 'none' : details.length === 1 && details[0].kind === 'ambiguous_reference' ? 'high' : details.some((item) => item.kind !== 'ambiguous_intent') ? 'high' : 'medium';
  return {
    contractVersion: 'ambiguity-v1',
    level,
    sources: [...new Set(sources)],
    details,
    conflictPresent,
  };
}

function intentSupportsAmbiguous(query) {
  return /(?:解释|比较|为什么|总结|反思|学习效果|效率|高数|线代|二阶导数|牛顿第二定律)/.test(query);
}

function createClarification(ambiguity) {
  if (ambiguity.level !== 'high') {
    return {
      contractVersion: 'clarification-v1',
      required: false,
      reason: null,
      round: 0,
      maxRounds: 1,
      questions: [],
      fallback: 'safe_unknown',
    };
  }
  const reason = ambiguity.sources[0] || 'multiple_possible_interpretations';
  return {
    contractVersion: 'clarification-v1',
    required: true,
    reason,
    round: 1,
    maxRounds: 1,
    questions: [],
    fallback: 'safe_unknown',
  };
}

function createScope(courseRefs, knowledgeRefs, timeScope, currentCourseContext, conflictPresent) {
  const hasCourse = courseRefs.length > 0;
  const hasKnowledge = knowledgeRefs.length > 0;
  const hasTime = timeScope.value !== 'none';
  let kind = 'no_scope';
  if (hasCourse && courseRefs.length > 1) kind = 'multiple_courses';
  else if (hasCourse && courseRefs.every((ref) => ref.source === 'user_explicit')) kind = 'explicit_course';
  else if (hasCourse && currentCourseContext) kind = 'current_course';
  if (hasKnowledge) kind = hasCourse || hasTime ? 'mixed_scope' : 'explicit_knowledge';
  else if (hasCourse && hasTime) kind = 'mixed_scope';
  else if (!hasCourse && hasTime && ['this_week', 'last_week', 'current_month'].includes(timeScope.value)) {
    kind = timeScope.value === 'this_week' ? 'current_learning_period' : 'explicit_time_period';
  } else if (!hasCourse && hasTime) kind = 'explicit_time_period';
  if (conflictPresent) kind = 'ambiguous_scope';
  const source = courseRefs.some((ref) => ref.source === 'user_explicit') || hasKnowledge
    ? 'user_explicit'
    : currentCourseContext ? 'system_context' : 'system_inferred';
  return {
    contractVersion: 'query-scope-v1',
    kind,
    source,
    courseScope: {
      kind: courseRefs.length > 1 ? 'multiple_courses' : hasCourse ? 'explicit_course' : 'no_scope',
      courseRefs: courseRefs.map((ref) => ref.refId),
    },
    timeScope: hasTime ? timeScope : null,
    knowledgeScope: {
      kind: hasKnowledge ? 'explicit_knowledge' : 'no_scope',
      knowledgeRefs: knowledgeRefs.map((ref) => ref.refId),
    },
    conflict: { present: conflictPresent, type: conflictPresent ? 'explicit_and_contextual_course' : null },
  };
}

function requestedExplanation(query, intent, queryType, knowledgeRefs) {
  const direction = intent.value === 'compare' ? 'compare'
    : intent.value === 'summarize' ? 'summarize'
    : intent.value === 'locate_knowledge' ? 'locate'
    : intent.value === 'reflect' ? 'review'
    : intent.value === 'review' ? 'review'
    : /为什么/.test(query) ? 'why'
    : /(?:怎么做|如何计算|怎么理解|如何理解)/.test(query) ? 'how'
    : /(?:什么是|是什么)/.test(query) ? 'what' : 'none';
  const target = queryType === 'learning_performance_question' ? 'learning_performance'
    : queryType === 'reflection_question' ? 'reflection_summary'
    : queryType === 'course_navigation_question' ? 'course_progress'
    : intent.value === 'compare' ? 'comparison_result'
    : intent.value === 'summarize' ? 'general_learning_status'
    : knowledgeRefs.length > 0 ? 'knowledge_concept' : 'general_learning_status';
  const comparisonTarget = intent.value === 'compare' ? query.slice(0, 60) : null;
  return {
    contractVersion: 'requested-explanation-v1',
    target,
    direction,
    comparisonTarget,
    source: 'deterministic_parser',
  };
}

function createUserContext(items) {
  const contextItems = items.map((text) => {
    const matchedKind = USER_CONTEXT_KINDS.find(([, pattern]) => pattern.test(text));
    return {
      itemId: deterministicUuid(sha256(text)),
      kind: matchedKind ? matchedKind[0] : 'self_report',
      text,
      authority: 'user_provided',
      provenance: { origin: 'query_text', source: 'user_explicit' },
      retention: { persistent: false },
    };
  });
  return {
    contractVersion: 'user-provided-context-v1',
    items: contextItems,
    totalChars: contextItems.reduce((sum, item) => sum + item.text.length, 0),
    persistent: false,
  };
}

function selectionHints(courseRefs, knowledgeRefs, timeScope, intent) {
  const preferred = intent.value === 'unsupported' ? []
    : ['learning_performance_question', 'reflection_question'].includes(intent.value) || intent.value === 'diagnose_learning'
      ? ['deterministic_fact', 'approved_insight', 'approved_reasoning', 'evidence']
      : knowledgeRefs.length > 0 ? ['course_knowledge', 'evidence']
      : ['course_knowledge', 'deterministic_fact'];
  const comparisonCourseIds = intent.value === 'compare' && courseRefs.length > 1
    ? courseRefs.map((ref) => ref.refId) : [];
  return {
    contractVersion: 'selection-hints-v1',
    preferredCourseScope: courseRefs.map((ref) => ref.refId),
    preferredKnowledgeRefs: knowledgeRefs.map((ref) => ref.refId),
    requestedTimeRange: { value: timeScope.value },
    preferredSourceTypes: preferred,
    comparisonScope: {
      courseRefIds: comparisonCourseIds,
      target: intent.value === 'compare' ? 'mastery' : null,
    },
    userConstraints: [],
    priority: ambiguityPriority(intent) ? 'high' : 'normal',
  };
}

function ambiguityPriority(intent) {
  return ['diagnose_learning', 'reflect'].includes(intent.value);
}

function createConversationContext(turns) {
  return {
    contractVersion: 'conversation-context-v1',
    enabled: turns.length > 0,
    turns,
    totalChars: turns.reduce((sum, turn) => sum + turn.text.length, 0),
    persistent: false,
    provenance: 'ephemeral_request_context',
  };
}

function createDataPlane(input, controlPlane) {
  const query = normalizeQuery(input.query);
  const unsupported = detectUnsupported(query.normalized);
  const intent = classifyIntent(query.normalized, unsupported);
  const courseRefs = extractCourseRefs(query.normalized, input.currentCourseContext);
  if (courseRefs.length > MAX_COURSE_REFS) throw invalid('TOO_MANY_REFERENCES');
  const knowledgeRefs = extractKnowledgeRefs(query.normalized);
  const timeScope = extractTimeScope(query.normalized, input.referenceTime);
  const hasCurrentCourse = Boolean(input.currentCourseContext);
  const conflictPresent = courseRefs.some((ref) => ref.source === 'user_explicit')
    && courseRefs.some((ref) => ref.source === 'system_context');
  const ambiguity = detectAmbiguity(query.normalized, courseRefs, knowledgeRefs, timeScope, hasCurrentCourse, unsupported);
  const queryType = classifyQueryType(query.normalized, intent, ambiguity.level, courseRefs, knowledgeRefs);
  const dataPlane = {
    contractVersion: 'query-understanding-v1',
    interpretationId: '00000000-0000-4000-8000-000000000000',
    query,
    normalizedQuery: query,
    intent: {
      contractVersion: 'query-intent-v1',
      value: intent.value,
      support: intent.support,
      source: 'deterministic_parser',
      unsupportedCapability: intent.unsupportedCapability,
    },
    queryType: {
      contractVersion: 'query-type-v1',
      value: queryType,
      source: 'deterministic_parser',
    },
    scope: createScope(courseRefs, knowledgeRefs, timeScope, hasCurrentCourse, conflictPresent),
    courseRefs,
    knowledgeRefs,
    requestedExplanation: requestedExplanation(query.normalized, intent, queryType, knowledgeRefs),
    userProvidedContext: createUserContext(input.userProvidedContext || []),
    ambiguity,
    clarification: createClarification(ambiguity),
    selectionHints: selectionHints(courseRefs, knowledgeRefs, timeScope, intent),
    confidence: createConfidence(queryType, courseRefs, knowledgeRefs, ambiguity, timeScope),
    conversationContext: createConversationContext(input.conversationContext || []),
    metadata: { parserPolicyVersion: QUERY_POLICY_VERSION, fingerprint: '' },
  };
  dataPlane.interpretationId = deterministicUuid(sha256(dataPlane));
  dataPlane.metadata.fingerprint = sha256(dataPlane);
  dataPlane.interpretationId = deterministicUuid(sha256(dataPlane));
  validateQueryUnderstanding(dataPlane);
  const serialized = JSON.stringify(dataPlane);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_DATA_PLANE_BYTES) {
    throw invalid('DATA_PLANE_TOO_LARGE');
  }
  if (containsForbiddenControlPlaneKey(dataPlane)) {
    throw invalid('CONTROL_PLANE_FIELD_FORBIDDEN');
  }
  return dataPlane;
}

function containsForbiddenControlPlaneKey(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenControlPlaneKey);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, child]) => /(?:ownerUserId|apiKey|accessToken|password|sessionSecret)/i.test(key)
    || containsForbiddenControlPlaneKey(child));
}

function createConfidence(queryType, courseRefs, knowledgeRefs, ambiguity, timeScope) {
  const components = {
    intent: 0.95,
    queryType: 0.95,
    scope: timeScope.ambiguity === 'none' ? 0.92 : 0.72,
    courseRefs: courseRefs.length === 0 ? 0.9 : courseRefs.every((ref) => ref.source === 'user_explicit') ? 1 : 0.85,
    knowledgeRefs: knowledgeRefs.length === 0 ? 0.9 : 1,
  };
  const penalty = ambiguity.level === 'none' ? 0 : ambiguity.level === 'medium' ? 0.1 : 0.35;
  const overall = Math.max(0, Math.round((Math.min(...Object.values(components)) - penalty) * 100) / 100);
  return {
    contractVersion: 'confidence-v1',
    overall,
    components,
    source: 'deterministic_parser',
  };
}

function understandQuery(input, controlPlane) {
  const safeInput = validateInput(input);
  validateControlPlane(controlPlane);
  const dataPlane = createDataPlane(safeInput, controlPlane);
  return {
    controlPlane: {
      requestId: controlPlane.requestId,
      ownerUserId: controlPlane.ownerUserId,
      authorization: { ...controlPlane.authorization },
    },
    dataPlane,
  };
}

module.exports = {
  QUERY_POLICY_VERSION,
  understandQuery,
};
