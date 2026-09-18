'use strict';

const {
  ACTION_LEVEL,
  AUTHORITIES,
  FIREWALL_VERSION,
  validateFirewallInput,
} = require('./contextContract');

const CONSTRAINTS = {
  maxBytes: 8192,
  maxInsights: 6,
  maxEvidencePerInsight: 3,
  maxReasoning: 6,
  maxTextChars: 240,
  maxEvidenceTextChars: 160,
  maxSourceReferences: 12,
};

function boundedText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const text = value
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, maxLength);
  return text;
}

function boundedEvidenceValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return boundedText(value, CONSTRAINTS.maxEvidenceTextChars);
  return null;
}

function sortByIdAndType(left, right) {
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  return left.type < right.type ? -1 : left.type > right.type ? 1 : 0;
}

function projectSource(boundary, key) {
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) return null;
  if (typeof boundary.source !== 'string' || !boundary.source) return null;
  if (!AUTHORITIES.has(boundary.authority)) return null;
  if (typeof boundary.confidence !== 'number' || !Number.isFinite(boundary.confidence)) return null;
  if (boundary.confidence < 0 || boundary.confidence > 1) return null;
  return {
    key: boundedText(key, 60),
    source: boundedText(boundary.source, 120),
    authority: boundedText(boundary.authority, 60),
    type: boundedText(boundary.type, 80),
    confidence: boundary.confidence,
  };
}

function projectSources(context) {
  const sourceKeys = ['courses', 'courseKnowledge', 'knowledgeStates', 'behavior'];
  return sourceKeys
    .map((key) => projectSource(context[key], key))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.authority !== right.authority) return left.authority < right.authority ? -1 : 1;
      return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
    })
    .slice(0, CONSTRAINTS.maxSourceReferences);
}

function projectInsights(insights) {
  return insights.insights
    .slice(0, CONSTRAINTS.maxInsights)
    .map((insight) => {
      const evidence = insight.evidence
        .slice(0, CONSTRAINTS.maxEvidencePerInsight)
        .map((item, index) => ({
          evidenceId: `${insight.id}:${index}`,
          source: boundedText(item.source, 120),
          authority: boundedText(item.authority, 60),
          metric: boundedText(item.metric, 120),
          period: boundedText(item.period, 20),
          value: boundedEvidenceValue(item.value),
        }));
      const explanation = boundedText(insight.explanation, CONSTRAINTS.maxTextChars);
      return {
        id: boundedText(insight.id, 120),
        type: boundedText(insight.type, 60),
        title: boundedText(insight.title, CONSTRAINTS.maxTextChars),
        explanation,
        source: boundedText(insight.source, 120),
        authority: boundedText(insight.authority, 60),
        confidence: insight.confidence,
        actionLevel: ACTION_LEVEL,
        evidence,
        truncated: explanation.length < String(insight.explanation || '').trim().length,
      };
    })
    .filter((insight) => insight.id && insight.type && insight.title && insight.evidence.length)
    .sort(sortByIdAndType);
}

function projectReasoning(reasoning) {
  return reasoning.explanations
    .slice(0, CONSTRAINTS.maxReasoning)
    .map((explanation) => {
      const why = boundedText(explanation.why, CONSTRAINTS.maxTextChars);
      return {
        id: `reasoning:${explanation.insightId}`,
        insightId: boundedText(explanation.insightId, 120),
        title: boundedText(explanation.title, CONSTRAINTS.maxTextChars),
        why,
        evidenceRefs: explanation.evidenceRefs
          .slice(0, CONSTRAINTS.maxEvidencePerInsight)
          .map((ref) => ({
            insightId: boundedText(ref.insightId, 120),
            index: ref.index,
            metric: boundedText(ref.metric, 120),
            period: boundedText(ref.period, 20),
            source: boundedText(ref.source, 120),
          }))
          .filter((ref) => ref.insightId && Number.isInteger(ref.index) && ref.index >= 0),
        confidence: explanation.confidence,
        actionLevel: ACTION_LEVEL,
        truncated: why.length < String(explanation.why || '').trim().length,
      };
    })
    .filter((explanation) => explanation.insightId && explanation.title && explanation.why && explanation.evidenceRefs.length)
    .sort((left, right) => (left.insightId < right.insightId ? -1 : left.insightId > right.insightId ? 1 : 0));
}

function serializedSize(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function fitToBudget(result) {
  if (serializedSize(result) <= CONSTRAINTS.maxBytes) return result;
  while (result.reasoning.length && serializedSize(result) > CONSTRAINTS.maxBytes) {
    result.reasoning.pop();
  }
  while (result.insights.length && serializedSize(result) > CONSTRAINTS.maxBytes) {
    result.insights.pop();
  }
  if (serializedSize(result) > CONSTRAINTS.maxBytes) {
    const error = new Error('FIREWALL_CONTEXT_TOO_LARGE');
    error.code = 'FIREWALL_CONTEXT_TOO_LARGE';
    error.statusCode = 400;
    throw error;
  }
  result.available = result.insights.length > 0;
  result.truncated = true;
  return result;
}

function buildLlmContext({ context, insights, reasoning, task = 'explain_daily' }) {
  validateFirewallInput({ context, insights, reasoning, task });
  const projectedInsights = projectInsights(insights);
  const projectedReasoning = projectReasoning(reasoning);
  const result = {
    version: FIREWALL_VERSION,
    ownerUserId: context.userId,
    task,
    available: projectedInsights.length > 0,
    truncated: false,
    sources: projectSources(context),
    insights: projectedInsights,
    reasoning: projectedReasoning,
    constraints: { ...CONSTRAINTS },
    metadata: {
      readOnly: true,
      actionLevel: ACTION_LEVEL,
      providerIndependent: true,
    },
  };
  return fitToBudget(result);
}

function toProviderPayload(firewallContext) {
  if (!firewallContext || firewallContext.version !== FIREWALL_VERSION) {
    const error = new Error('INVALID_FIREWALL_CONTEXT');
    error.code = 'INVALID_FIREWALL_CONTEXT';
    error.statusCode = 400;
    throw error;
  }
  return {
    version: firewallContext.version,
    task: firewallContext.task,
    available: firewallContext.available,
    truncated: firewallContext.truncated,
    sources: firewallContext.sources,
    insights: firewallContext.insights,
    reasoning: firewallContext.reasoning,
    constraints: firewallContext.constraints,
    metadata: firewallContext.metadata,
  };
}

module.exports = {
  CONSTRAINTS,
  buildLlmContext,
  toProviderPayload,
};
