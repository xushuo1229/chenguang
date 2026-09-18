'use strict';

const FIREWALL_VERSION = 'agent-llm-context-v1';
const TASKS = new Set(['explain_daily', 'explain_insights', 'summarize_learning_context']);
const AUTHORITIES = new Set(['source', 'deterministic_projection', 'derived_memory', 'unavailable']);
const CONTEXT_VERSION = 'learning-context-v1';
const INSIGHT_VERSION = 'agent-insight-v1';
const REASONING_VERSION = 'agent-reasoning-v1';
const ACTION_LEVEL = 'insight_only';
const SENSITIVE_KEY_PATTERN = /(jwt|authtoken|accesstoken|refreshtoken|apikey|api_key|password|secret|credential|cookie|authorization|sessionid)/i;
const SENSITIVE_KEYS = [
  'jwt', 'accessToken', 'refreshToken', 'apiKey', 'api_key', 'password',
  'secret', 'credential', 'cookie', 'authorization',
];

function containsSensitiveKey(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveKey(item, depth + 1));
  }
  return Object.keys(value).some((key) => {
    if (SENSITIVE_KEY_PATTERN.test(key.replace(/[-_\s]/g, ''))) return true;
    return containsSensitiveKey(value[key], depth + 1);
  });
}

function invalid(message) {
  const error = new Error(message);
  error.code = message;
  error.statusCode = 400;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOwnerId(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isFiniteUnit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function rejectSensitive(value) {
  if (containsSensitiveKey(value)) {
    throw invalid('SENSITIVE_FIREWALL_INPUT');
  }
}

function validateContext(context) {
  if (!isObject(context) || context.version !== CONTEXT_VERSION) {
    throw invalid('INVALID_LEARNING_CONTEXT');
  }
  if (!isOwnerId(context.userId) || context.readOnly !== true || context.actionLevel !== ACTION_LEVEL) {
    throw invalid('INVALID_LEARNING_CONTEXT');
  }
  if (!isObject(context.permissions) || !Array.isArray(context.permissions.write) || context.permissions.write.length > 0) {
    throw invalid('INVALID_CONTEXT_PERMISSIONS');
  }
  if (!Array.isArray(context.permissions.read) || context.permissions.read.length > 20) {
    throw invalid('INVALID_CONTEXT_PERMISSIONS');
  }
  rejectSensitive(context);
  return context;
}

function validateInsights(insights, ownerUserId) {
  if (!isObject(insights) || insights.version !== INSIGHT_VERSION || insights.scope !== 'agent_home') {
    throw invalid('INVALID_AGENT_INSIGHTS');
  }
  if (!isOwnerId(insights.userId) || insights.userId !== ownerUserId) {
    throw invalid('FIREWALL_OWNERSHIP_MISMATCH');
  }
  if (!isObject(insights.metadata) || insights.metadata.readOnly !== true || insights.metadata.actionLevel !== ACTION_LEVEL) {
    throw invalid('INVALID_AGENT_INSIGHTS');
  }
  if (!Array.isArray(insights.insights) || insights.insights.length > 10) {
    throw invalid('INVALID_AGENT_INSIGHTS');
  }
  const valid = insights.insights.every((insight) => {
    if (!isObject(insight)) return false;
    if (typeof insight.id !== 'string' || !insight.id) return false;
    if (typeof insight.type !== 'string' || !insight.type) return false;
    if (typeof insight.source !== 'string' || !insight.source) return false;
    if (typeof insight.title !== 'string' || !insight.title || insight.title.length > 240) return false;
    if (typeof insight.explanation !== 'string' || !insight.explanation || insight.explanation.length > 240) return false;
    if (!AUTHORITIES.has(insight.authority)) return false;
    if (!isFiniteUnit(insight.confidence) || insight.actionLevel !== ACTION_LEVEL) return false;
    if (!Array.isArray(insight.evidence) || !insight.evidence.length || insight.evidence.length > 10) return false;
    return insight.evidence.every((evidence) => (
      isObject(evidence)
      && typeof evidence.source === 'string' && evidence.source
      && AUTHORITIES.has(evidence.authority)
      && typeof evidence.metric === 'string' && evidence.metric
      && typeof evidence.period === 'string' && evidence.period
    ));
  });
  if (!valid) throw invalid('INVALID_AGENT_INSIGHTS');
  rejectSensitive(insights);
  return insights;
}

function validateReasoning(reasoning, ownerUserId) {
  if (!isObject(reasoning) || reasoning.version !== REASONING_VERSION || reasoning.scope !== 'agent_home') {
    throw invalid('INVALID_AGENT_REASONING');
  }
  if (!isOwnerId(reasoning.userId) || reasoning.userId !== ownerUserId) {
    throw invalid('FIREWALL_OWNERSHIP_MISMATCH');
  }
  if (typeof reasoning.available !== 'boolean') {
    throw invalid('INVALID_AGENT_REASONING');
  }
  if (!isObject(reasoning.permissions) || !Array.isArray(reasoning.permissions.write) || reasoning.permissions.write.length > 0) {
    throw invalid('INVALID_AGENT_REASONING');
  }
  if (!isObject(reasoning.metadata) || reasoning.metadata.readOnly !== true || reasoning.metadata.actionLevel !== ACTION_LEVEL) {
    throw invalid('INVALID_AGENT_REASONING');
  }
  if (!Array.isArray(reasoning.explanations) || reasoning.explanations.length > 10) {
    throw invalid('INVALID_AGENT_REASONING');
  }
  if (reasoning.available === false && reasoning.explanations.length > 0) {
    throw invalid('INVALID_AGENT_REASONING');
  }
  const valid = reasoning.explanations.every((explanation) => {
    if (!isObject(explanation)) return false;
    if (typeof explanation.insightId !== 'string' || !explanation.insightId) return false;
    if (typeof explanation.title !== 'string' || !explanation.title) return false;
    if (typeof explanation.why !== 'string' || !explanation.why) return false;
    if (!isFiniteUnit(explanation.confidence) || explanation.actionLevel !== ACTION_LEVEL) return false;
    if (!Array.isArray(explanation.evidenceRefs) || !explanation.evidenceRefs.length) return false;
    return explanation.evidenceRefs.every((ref) => (
      isObject(ref)
      && typeof ref.insightId === 'string' && ref.insightId
      && Number.isInteger(ref.index) && ref.index >= 0
    ));
  });
  if (!valid) throw invalid('INVALID_AGENT_REASONING');
  rejectSensitive(reasoning);
  return reasoning;
}

function validateFirewallInput({ context, insights, reasoning, task }) {
  if (task !== undefined && (typeof task !== 'string' || !TASKS.has(task))) {
    throw invalid('INVALID_FIREWALL_TASK');
  }
  const owner = validateContext(context);
  validateInsights(insights, owner.userId);
  validateReasoning(reasoning, owner.userId);
  return true;
}

module.exports = {
  ACTION_LEVEL,
  AUTHORITIES,
  CONTEXT_VERSION,
  FIREWALL_VERSION,
  INSIGHT_VERSION,
  REASONING_VERSION,
  SENSITIVE_KEYS,
  TASKS,
  isFiniteUnit,
  isObject,
  isOwnerId,
  validateFirewallInput,
};
