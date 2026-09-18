# Phase 27.6.2.3 Semantic Validation Implementation

## Baseline

- Evidence Binding Validator: Phase 27.6.2.2
- Output Contract: Phase 27.6.2.1
- Implementation commit: `c798db3 feat: add semantic validation layer`

## Contract

`agent-semantic-validator-v1` is a pure validation layer after Evidence Binding. It verifies whether an explanation is consistent with the values, periods, and reasoning confidence available in `agent-llm-context-v1`.

Success result:

```js
{
  version: 'agent-semantic-validator-v1',
  valid: true,
  violations: [],
  fallback: null
}
```

Any violation returns:

```js
{
  available: false,
  reason: 'semantic_validation_failed'
}
```

## Validation Rules

### Numerical Validation

Numbers in explanation text must be supported by:

- numeric `evidence.value`
- numeric values embedded in string evidence
- day counts represented by the referenced evidence `period`

Unsupported numbers return `NUMERIC_MISMATCH`.

### Temporal Validation

ISO dates and relative periods such as `最近 3 天`, `过去 7 天`, and `最近一个月` must match the referenced evidence period or date-bearing evidence. Unsupported ranges return `TEMPORAL_MISMATCH`.

### Semantic Scope Validation

Fact and interpretation text may not escalate deterministic observations into ability, personality, intelligence, universal, or absolute conclusions. Violations return `SEMANTIC_SCOPE_VIOLATION`.

### Confidence Validation

The frozen Output Contract intentionally forbids `generationConfidence` on `fact`; fact confidence remains inherited from deterministic evidence and reasoning. For `interpretation`, confidence is required, bounded to `0..1`, and cannot exceed the related reasoning confidence. Escalation returns `CONFIDENCE_ESCALATION`.

## Boundary

New implementation:

- `backend/src/services/agentSemanticValidator/semanticValidatorContract.js`

New tests:

- `backend/test/agentSemanticValidation.test.js`

The validator does not access database, network, provider SDK, API routes, UI, or filesystem. It does not mutate firewall context, output, Insight, Evidence, Knowledge State, Memory, or any source system.

The complete output gate becomes:

```text
Output Contract Validator
→ Evidence Binding Validator
→ Semantic Validator
→ Validated Explanation
```

## Test Results

- Backend: 162/162 PASS
- Frontend: 598/598 PASS
- Build: PASS
- Scoped staged `git diff --check`: PASS
- Desktop browser smoke 1920x1080: PASS
- Mobile browser smoke 375x812: PASS
- Console errors / page errors / HTTP >= 400 / horizontal overflow: 0

## Limitations

Semantic scope detection uses deterministic lexical rules rather than an LLM judge. This prevents model-driven scoring and keeps the gate deterministic, but sophisticated unsupported generalizations may require additional rule coverage in a later additive phase.
