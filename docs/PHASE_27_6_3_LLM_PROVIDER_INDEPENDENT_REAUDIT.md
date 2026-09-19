# Phase 27.6.3 LLM Provider Abstraction Independent Re-Audit

## Audit Scope

Independent post-implementation review covers contract conformance (input `agent-llm-context-v1` + `task`, frozen raw-response envelope, verbatim reply passthrough), boundary-level timeout policy, failure taxonomy containment (`FAIL_REASONS ⊆ FALLBACK_REASONS`), security isolation (no database/store/sync/memory dependency, immutable input, secret isolation), shared-transport additive extensions, test quality, scope containment, and regression validation.

## Architecture Review

PASS. `agentProvider/` is additive and isolated under `backend/src/services/agentProvider/` (3 modules). The provider is a total function: operational failures return a `failed` envelope, only contract violations throw (`PROVIDER_*`, statusCode 400). `reply` is passed through verbatim (no parse / no code-fence strip / no repair / no truncation — proven by the malformed-boundary test with a fenced truncated text passing byte-identical). The validator chain remains the only path to the user.

The chain after 27.6.3:

```text
Output Contract Validator → Evidence Binding Validator → Semantic Validator
          ▲
Context Firewall (agent-llm-context-v1) → agentProvider → raw envelope
```

## Contract Review

PASS. `validateProviderInput` enforces version, `task ∈ contextContract.TASKS` (reused set, not copied), positive-integer `ownerUserId`, `metadata.readOnly/actionLevel`, sensitive-key scan (reused `containsSensitiveKey`, depth ≤ 6), and byte budget ≤ `CONSTRAINTS.maxBytes` (8192). `validateProviderOutput` enforces the envelope field whitelist, ok/failed exclusivity, and sensitive-key scan. `FAIL_REASONS` (5 values) ⊆ `outputContract.FALLBACK_REASONS`, locked by a dedicated test.

## Timeout Review

PASS. Timeout is enforced at the provider boundary via `Promise.race`, effective for any injected transport (the design defect "injected transport bypasses the shared-transport AbortController" was found by TDD during implementation and fixed per architecture §4; the hanging-transport test is its regression lock). Timers are cleared in `finally` at both the boundary and the shared transport.

## Security Review

PASS. Static require-whitelist scan forbids db/sqlite/store/sync/repository/memory dependencies in all three provider modules. Input immutability is proven by deep-freeze + deep-compare. Secrets flow only as call parameters into the transport; neither the envelope nor the prompt contains key material. `err.upstreamStatus` is a plain instance property; `middleware/error.js` serializes only `code`/`message`/`details`, so it cannot reach API responses. Envelope failures can never deliver a bad envelope downstream (self-check + fail-closed mapping).

## Shared Transport Review

PASS. Both extensions are conditional/additive: `temperature` enters the body only when explicitly passed with `0 < t < 2`; AI Coach call sites pass no temperature, so request bodies are byte-identical to before. The known dormant `knowledgeExtractionProvider` defect (missing `baseUrl/apiKey/model` params) predates this phase, is disclosed in architecture §3.3, and is tracked as a separate ticket.

## Regression Review

PASS.

| Check | Result |
| --- | --- |
| Backend tests | 184/184 PASS (162 existing + 22 new, zero regression) |
| Frontend tests | 609/609 PASS |
| Build | PASS |
| `git diff --check` | PASS |
| Desktop browser 1920x1080 | PASS (6 pages, 0 errors) |
| Mobile browser 375x812 | PASS (6 pages, 0 errors) |
| Console / page / HTTP ≥ 400 / overflow errors | 0 |

## Findings

### Critical

None.

### High

None.

### Medium

None.

### Low

- L-001 — Architecture §2.2 wording says `validateProviderInput` "returns the projected payload" while the implementation returns `true` and the adapter passes the full firewall context (including `ownerUserId`) to the prompt builder. No boundary or security impact (`ownerUserId` is an acknowledged provider-visible field and is included in the byte budget). Addressed by docs-only wording alignment in the freeze commit.
- L-002 — §5 literal gap: a raw `AbortError` (not wrapped by the shared transport) would map to `llm_unavailable` instead of `llm_timeout`. Unreachable with the shared transport; fail-closed direction is correct. Future hardening: add an explicit AbortError branch.
- L-003 — Envelope self-check failures (`PROVIDER_ENVELOPE_INVALID`, e.g. oversized reply) are caught and mapped to `llm_unavailable` rather than rethrown. Actual behavior is safe (bad envelope never reaches downstream; deterministic fallback), but a future catch-clause rethrow for `PROVIDER_*` errors would match §2.3 wording exactly.
- L-004 — Registry wording: §3.2 says "unconfigured/unknown → null" while the implementation falls back to `'openaiCompatible'` when the config value is falsy (unreachable because env.js always defaults it; end state equivalent). Addressed by docs-only wording alignment in the freeze commit.
- L-005 — Existing dormant defect in `knowledgeExtractionProvider.extract` (missing transport params) is tracked separately per architecture §3.3; not introduced or regressed by this phase.

## Final Verdict

READY_TO_FREEZE
