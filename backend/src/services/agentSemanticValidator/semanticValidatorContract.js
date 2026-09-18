'use strict';

const { OUTPUT_SCHEMA_VERSION, validateOutputContract } = require('../agentOutputValidator/outputContract');

const SEMANTIC_VALIDATOR_VERSION = 'agent-semantic-validator-v1';
const FALLBACK_REASON = 'semantic_validation_failed';
const CLAIM_TYPES_WITH_EVIDENCE = new Set(['fact', 'interpretation']);
const OVERGENERALIZATION_PATTERN = /(?:学习|认知|专注|整体)?能力(?:强|弱|差|不足|下降|提升|衰退)|智力|天赋|人格|性格|所有|全部|总是|永远/g;

function invalid(code, path) {
  return { path, code };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteUnit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseChineseNumber(value) {
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return Number(value);
  if (value === '十') return 10;
  if (/^十[一二三四五六七八九]$/.test(value)) return 10 + digits[value[1]];
  if (/^[一二三四五六七八九]十$/.test(value)) return digits[value[0]] * 10;
  if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(value)) {
    return digits[value[0]] * 10 + digits[value[2]];
  }
  return digits[value];
}

function periodToDays(period) {
  if (typeof period !== 'string') return null;
  const match = period.match(/(\d+(?:\.\d+)?)d$/i);
  if (match) return Number(match[1]);
  if (period === 'current' || period === 'today' || period === 'daily') return 1;
  return null;
}

function extractDates(text) {
  return text.match(/(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])/g) || [];
}

function extractRelativePeriods(text) {
  const pattern = /(?:最近|近|过去|此前|之前)\s*([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)\s*(天|日|周|星期|月|年)/g;
  const values = [];
  let match = pattern.exec(text);
  while (match) {
    const amount = parseChineseNumber(match[1]);
    if (amount != null && Number.isFinite(amount)) {
      const unit = match[2];
      const days = unit === '周' || unit === '星期' ? amount * 7
        : unit === '月' ? amount * 30
          : unit === '年' ? amount * 365
            : amount;
      values.push(days);
    }
    match = pattern.exec(text);
  }
  return values;
}

function resolveEvidence(firewallContext, ref) {
  if (!isObject(ref) || typeof ref.insightId !== 'string' || typeof ref.evidenceId !== 'string') return null;
  const insight = Array.isArray(firewallContext.insights)
    ? firewallContext.insights.find((item) => item && item.id === ref.insightId)
    : null;
  if (!insight || !Array.isArray(insight.evidence)) return null;
  return insight.evidence.find((evidence) => evidence && evidence.evidenceId === ref.evidenceId) || null;
}

function resolveReasoningConfidence(firewallContext, explanation) {
  const insightIds = new Set();
  (Array.isArray(explanation.reasoningRefs) ? explanation.reasoningRefs : []).forEach((ref) => {
    if (isObject(ref) && typeof ref.insightId === 'string') insightIds.add(ref.insightId);
  });
  const confidenceValues = (Array.isArray(firewallContext.reasoning) ? firewallContext.reasoning : [])
    .filter((reasoning) => reasoning && insightIds.has(reasoning.insightId) && isFiniteUnit(reasoning.confidence))
    .map((reasoning) => reasoning.confidence);
  return confidenceValues.length ? Math.max(...confidenceValues) : null;
}

function validateNumericalConsistency(explanation, evidence, violations, path) {
  const text = typeof explanation.text === 'string' ? explanation.text : '';
  const dates = extractDates(text);
  const textWithoutDates = dates.reduce((value, date) => value.replace(date, ' '), text);
  const allowedValues = new Set();
  evidence.forEach((item) => {
    if (item && typeof item.value === 'number' && Number.isFinite(item.value)) allowedValues.add(item.value);
    if (item && typeof item.value === 'string') {
      extractDates(item.value).forEach((date) => allowedValues.add(date));
    }
    const days = item ? periodToDays(item.period) : null;
    if (days != null) allowedValues.add(days);
  });

  const numbers = textWithoutDates.match(/\d+(?:\.\d+)?/g) || [];
  numbers.forEach((number) => {
    const value = Number(number);
    if (!allowedValues.has(value)) {
      violations.push(invalid('NUMERIC_MISMATCH', `${path}.text`));
    }
  });
}

function validateTemporalConsistency(explanation, evidence, violations, path) {
  const text = typeof explanation.text === 'string' ? explanation.text : '';
  const allowedDates = new Set();
  const allowedDays = new Set();
  evidence.forEach((item) => {
    if (!item) return;
    if (typeof item.value === 'string') extractDates(item.value).forEach((date) => allowedDates.add(date));
    const days = periodToDays(item.period);
    if (days != null) allowedDays.add(days);
  });

  extractDates(text).forEach((date) => {
    if (!allowedDates.has(date)) violations.push(invalid('TEMPORAL_MISMATCH', `${path}.text`));
  });
  extractRelativePeriods(text).forEach((days) => {
    if (!allowedDays.has(days)) violations.push(invalid('TEMPORAL_MISMATCH', `${path}.text`));
  });
}

function validateSemanticScope(explanation, violations, path) {
  const text = typeof explanation.text === 'string' ? explanation.text : '';
  if (explanation.type === 'fact' || explanation.type === 'interpretation') {
    if (OVERGENERALIZATION_PATTERN.test(text)) {
      violations.push(invalid('SEMANTIC_SCOPE_VIOLATION', `${path}.text`));
    }
  }
}

function validateConfidence(explanation, firewallContext, violations, path) {
  if (explanation.type !== 'interpretation') return;
  if (!isFiniteUnit(explanation.generationConfidence)) {
    violations.push(invalid('MISSING_CONFIDENCE', `${path}.generationConfidence`));
    return;
  }
  const reasoningConfidence = resolveReasoningConfidence(firewallContext, explanation);
  if (reasoningConfidence == null) {
    violations.push(invalid('MISSING_REASONING_REFERENCE', `${path}.reasoningRefs`));
    return;
  }
  if (explanation.generationConfidence > reasoningConfidence) {
    violations.push(invalid('CONFIDENCE_ESCALATION', `${path}.generationConfidence`));
  }
}

function validateExplanation(explanation, firewallContext, violations, index) {
  const path = `explanations[${index}]`;
  if (!isObject(explanation)) {
    violations.push(invalid('MALFORMED_EXPLANATION', path));
    return;
  }
  if (typeof explanation.text !== 'string' || !explanation.text.trim()) {
    violations.push(invalid('EMPTY_EXPLANATION', `${path}.text`));
  }
  if (!CLAIM_TYPES_WITH_EVIDENCE.has(explanation.type)) return;

  const evidence = (Array.isArray(explanation.evidenceRefs) ? explanation.evidenceRefs : [])
    .map((ref) => resolveEvidence(firewallContext, ref))
    .filter(Boolean);
  if (!evidence.length) {
    violations.push(invalid('MISSING_EVIDENCE_REFERENCE', `${path}.evidenceRefs`));
    return;
  }

  validateNumericalConsistency(explanation, evidence, violations, path);
  validateTemporalConsistency(explanation, evidence, violations, path);
  validateSemanticScope(explanation, violations, path);
  validateConfidence(explanation, firewallContext, violations, path);
}

function validateSemanticValidation({ firewallContext, output }) {
  const violations = [];

  if (!isObject(firewallContext)
    || firewallContext.version !== 'agent-llm-context-v1'
    || !isObject(firewallContext.metadata)
    || firewallContext.metadata.readOnly !== true
    || firewallContext.metadata.actionLevel !== 'insight_only') {
    violations.push(invalid('INVALID_FIREWALL_CONTEXT', 'firewallContext'));
  }

  const outputContractResult = isObject(output) ? validateOutputContract(output) : { valid: false };
  if (!isObject(output) || !outputContractResult.valid) {
    violations.push(invalid('MALFORMED_OUTPUT', 'output'));
  }
  if (isObject(output) && (output.status === 'fallback' || output.available === false)) {
    violations.push(invalid('FALLBACK_NOT_BINDABLE', 'output.status'));
  }

  if (isObject(output)) {
    if (!Array.isArray(output.explanations) || output.explanations.length === 0) {
      violations.push(invalid('EMPTY_EXPLANATION', 'explanations'));
    } else {
      output.explanations.forEach((explanation, index) => {
        validateExplanation(explanation, firewallContext, violations, index);
      });
    }
  }

  const valid = violations.length === 0;
  return {
    version: SEMANTIC_VALIDATOR_VERSION,
    valid,
    violations,
    fallback: valid ? null : {
      available: false,
      reason: FALLBACK_REASON,
    },
  };
}

module.exports = {
  CLAIM_TYPES_WITH_EVIDENCE,
  FALLBACK_REASON,
  SEMANTIC_VALIDATOR_VERSION,
  validateSemanticValidation,
};
