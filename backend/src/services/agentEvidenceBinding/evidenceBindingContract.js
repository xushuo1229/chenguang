'use strict';

const crypto = require('node:crypto');
const { OUTPUT_SCHEMA_VERSION, validateOutputContract } = require('../agentOutputValidator/outputContract');

const BINDING_VERSION = 'agent-evidence-binding-v1';
const FALLBACK_REASON = 'evidence_binding_failed';

function invalid(code, path) {
  return { path, code };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateInsightReference(context, insightId) {
  if (typeof insightId !== 'string' || !insightId) {
    return { type: 'insight', id: insightId, verified: false, code: 'MISSING_INSIGHT_REFERENCE' };
  }
  const verified = Array.isArray(context.insights) && context.insights.some((insight) => insight && insight.id === insightId);
  return {
    type: 'insight',
    id: insightId,
    verified,
    code: verified ? undefined : 'MISSING_INSIGHT_REFERENCE',
  };
}

function validateEvidenceReference(context, ref) {
  if (!isObject(ref)) {
    return { type: 'evidence', id: null, verified: false, code: 'MALFORMED_EVIDENCE_REFERENCE' };
  }
  if (typeof ref.insightId !== 'string' || !ref.insightId || typeof ref.evidenceId !== 'string' || !ref.evidenceId) {
    return { type: 'evidence', id: ref.evidenceId || null, verified: false, code: 'MALFORMED_EVIDENCE_REFERENCE' };
  }

  const insight = Array.isArray(context.insights)
    ? context.insights.find((item) => item && item.id === ref.insightId)
    : null;
  if (!insight) {
    return { type: 'evidence', id: ref.evidenceId, insightId: ref.insightId, verified: false, code: 'MISSING_INSIGHT_REFERENCE' };
  }

  const verified = Array.isArray(insight.evidence)
    && insight.evidence.some((evidence) => evidence && evidence.evidenceId === ref.evidenceId);
  return {
    type: 'evidence',
    id: ref.evidenceId,
    insightId: ref.insightId,
    verified,
    code: verified ? undefined : 'FAKE_EVIDENCE_REFERENCE',
  };
}

function validateReasoningReference(context, ref) {
  if (!isObject(ref)) {
    return { type: 'reasoning', id: null, verified: false, code: 'MALFORMED_REASONING_REFERENCE' };
  }
  if (typeof ref.insightId !== 'string' || !ref.insightId || typeof ref.reasoningId !== 'string' || !ref.reasoningId) {
    return { type: 'reasoning', id: ref.reasoningId || null, verified: false, code: 'MALFORMED_REASONING_REFERENCE' };
  }
  if (ref.reasoningId !== `reasoning:${ref.insightId}`) {
    return { type: 'reasoning', id: ref.reasoningId, insightId: ref.insightId, verified: false, code: 'WRONG_REFERENCE_TYPE' };
  }

  const insightExists = Array.isArray(context.insights)
    && context.insights.some((insight) => insight && insight.id === ref.insightId);
  const reasoningExists = Array.isArray(context.reasoning)
    && context.reasoning.some((reasoning) => reasoning && reasoning.id === ref.reasoningId && reasoning.insightId === ref.insightId);
  const verified = insightExists && reasoningExists;
  return {
    type: 'reasoning',
    id: ref.reasoningId,
    insightId: ref.insightId,
    verified,
    code: verified ? undefined : 'MISSING_REASONING_REFERENCE',
  };
}

function validateUserOwnership(ownerUserId, output) {
  if (typeof ownerUserId !== 'number' || !Number.isInteger(ownerUserId)) {
    return { verified: false, code: 'CONTEXT_OWNER_MISSING' };
  }
  if (output.ownerUserId === undefined) {
    return { verified: true, code: undefined };
  }
  if (output.ownerUserId !== ownerUserId) {
    return { verified: false, code: 'CROSS_USER_REFERENCE' };
  }
  return { verified: true, code: undefined };
}

function computeContextSnapshotId(firewallContext) {
  if (!isObject(firewallContext)) return '';
  return crypto.createHash('sha256').update(JSON.stringify(firewallContext)).digest('hex');
}

function validateContextSnapshot(firewallContext, expectedSnapshotId) {
  const actualSnapshotId = computeContextSnapshotId(firewallContext);
  if (typeof expectedSnapshotId !== 'string' || !expectedSnapshotId) {
    return { verified: false, actualSnapshotId, code: 'MISSING_CONTEXT_SNAPSHOT' };
  }
  const verified = actualSnapshotId === expectedSnapshotId;
  return {
    verified,
    actualSnapshotId,
    code: verified ? undefined : 'CONTEXT_SNAPSHOT_MISMATCH',
  };
}

function collectReferences(output) {
  const references = [];
  (Array.isArray(output.explanations) ? output.explanations : []).forEach((explanation, explanationIndex) => {
    if (!isObject(explanation)) return;
    (Array.isArray(explanation.evidenceRefs) ? explanation.evidenceRefs : []).forEach((ref, refIndex) => {
      references.push({ path: `explanations[${explanationIndex}].evidenceRefs[${refIndex}]`, kind: 'evidence', ref });
    });
    (Array.isArray(explanation.reasoningRefs) ? explanation.reasoningRefs : []).forEach((ref, refIndex) => {
      references.push({ path: `explanations[${explanationIndex}].reasoningRefs[${refIndex}]`, kind: 'reasoning', ref });
    });
    if ((explanation.type === 'fact' || explanation.type === 'interpretation')) {
      if (!Array.isArray(explanation.evidenceRefs) || explanation.evidenceRefs.length === 0) {
        references.push({ path: `explanations[${explanationIndex}].evidenceRefs`, kind: 'empty', ref: null });
      }
      if (explanation.type === 'fact' && (!Array.isArray(explanation.reasoningRefs) || explanation.reasoningRefs.length === 0)) {
        references.push({ path: `explanations[${explanationIndex}].reasoningRefs`, kind: 'empty', ref: null });
      }
    }
    if ((explanation.type === 'suggestion' || explanation.type === 'uncertainty')) {
      if (Array.isArray(explanation.evidenceRefs) && explanation.evidenceRefs.length) {
        references.push({ path: `explanations[${explanationIndex}].evidenceRefs`, kind: 'forbidden', ref: explanation.evidenceRefs[0] });
      }
      if (Array.isArray(explanation.reasoningRefs) && explanation.reasoningRefs.length) {
        references.push({ path: `explanations[${explanationIndex}].reasoningRefs`, kind: 'forbidden', ref: explanation.reasoningRefs[0] });
      }
    }
  });
  return references;
}

function validateEvidenceBinding({ firewallContext, output, expectedSnapshotId, ownerUserId }) {
  const violations = [];
  const verifiedReferences = [];

  if (!isObject(firewallContext) || firewallContext.version !== 'agent-llm-context-v1') {
    violations.push(invalid('INVALID_CONTEXT_SNAPSHOT', 'firewallContext'));
  }
  if (!isObject(output) || output.schemaVersion !== OUTPUT_SCHEMA_VERSION) {
    violations.push(invalid('MALFORMED_OUTPUT', 'output'));
  }
  if (isObject(output) && (output.status === 'fallback' || output.available === false)) {
    violations.push(invalid('FALLBACK_NOT_BINDABLE', 'output.status'));
  }

  const outputContractResult = isObject(output) ? validateOutputContract(output) : { valid: false, errors: [] };
  if (!outputContractResult.valid) {
    violations.push(invalid('MALFORMED_OUTPUT', 'output'));
  }

  const ownership = isObject(firewallContext) && isObject(output)
    ? validateUserOwnership(ownerUserId, output)
    : { verified: false, code: 'CONTEXT_OWNER_MISSING' };
  if (!ownership.verified) violations.push(invalid(ownership.code, 'output.ownerUserId'));

  let snapshot;
  if (isObject(firewallContext)) {
    snapshot = validateContextSnapshot(firewallContext, expectedSnapshotId);
    if (!snapshot.verified) violations.push(invalid(snapshot.code, 'expectedSnapshotId'));
  } else {
    snapshot = { verified: false, actualSnapshotId: '', code: 'INVALID_CONTEXT_SNAPSHOT' };
  }

  if (isObject(firewallContext) && isObject(output)) {
    const seen = new Set();
    collectReferences(output).forEach(({ path, kind, ref }) => {
      if (kind === 'empty') {
        violations.push(invalid('EMPTY_REFERENCES', path));
        return;
      }
      if (kind === 'forbidden') {
        violations.push(invalid('WRONG_REFERENCE_TYPE', path));
        return;
      }

      const result = kind === 'evidence'
        ? validateEvidenceReference(firewallContext, ref)
        : validateReasoningReference(firewallContext, ref);
      const dedupeKey = `${result.type}:${result.id || ''}:${result.insightId || ''}`;
      if (seen.has(dedupeKey)) {
        violations.push(invalid('DUPLICATE_REFERENCE', path));
      }
      seen.add(dedupeKey);

      if (result.verified) {
        verifiedReferences.push({
          type: result.type,
          id: result.id,
          insightId: result.insightId,
          verified: true,
        });
      } else {
        violations.push(invalid(result.code, path));
        verifiedReferences.push({
          type: result.type,
          id: result.id,
          insightId: result.insightId,
          verified: false,
          code: result.code,
        });
      }
    });
  }

  const valid = violations.length === 0;
  return {
    version: BINDING_VERSION,
    valid,
    contextSnapshotId: snapshot ? snapshot.actualSnapshotId : '',
    references: verifiedReferences,
    violations,
    fallback: valid ? null : {
      available: false,
      reason: FALLBACK_REASON,
    },
  };
}

module.exports = {
  BINDING_VERSION,
  FALLBACK_REASON,
  collectReferences,
  computeContextSnapshotId,
  validateContextSnapshot,
  validateEvidenceBinding,
  validateEvidenceReference,
  validateInsightReference,
  validateReasoningReference,
  validateUserOwnership,
};
