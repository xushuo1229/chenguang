# Phase 27.6.4 LLM Runtime Gateway Independent Re-Audit

## Audit Scope

Independent post-implementation review covers pipeline conformance (single entry, in-gateway firewall construction, fixed validator order parse → Output Contract → Evidence Binding → Semantic), the §0.1 frozen-contract repair, M-1 whole-entry reference governance, boundary isolation, test quality, scope containment, and regression validation.

## Architecture Review

PASS. `agentGateway/` is additive and isolated (3 modules). `runExplanation` is the only public entry; the firewall context is built inside the gateway from the three deterministic layer outputs (structurally impossible to bypass the Context Firewall); the context snapshot id is computed internally and passed as `expectedSnapshotId` (callers cannot mismatch snapshots). The failure taxonomy matches architecture §4 line-by-line; all reasons ∈ `FALLBACK_REASONS`.

The chain after 27.6.4:

```text
INSIGHT/EVIDENCE/REASONING → Context Firewall → Runtime Gateway (Provider + 3 Validators)
  → validated output | deterministic fallback
```

## Frozen-Contract Repair Review (§0.1)

PASS. `validateOutputContract` now validates fallback explanations exclusively by `validateFallbackExplanation` (deterministic reasoning structure, per the 27.6.2.1 spec intent); `validated`/`partial` paths are unchanged. Five regression tests lock the behavior: non-empty fallback explanations pass; claim-shaped fallback entries are still rejected; validated output with fallback fields is still rejected; partial status unchanged; >5 fallback entries still rejected (`TOO_MANY_EXPLANATIONS`).

## Reference Governance Review (M-1)

PASS. `translateEvidenceRefs` drops the whole entry when any ref is malformed, drifts to another insight, is unresolvable (missing insight or index out of range), or when surviving refs violate density (`ref.index === array position`). `evidenceId` is always `<insightId>:<array position>`. The historical sparse-ref path to `GATEWAY_INVARIANT_BROKEN` (provable with legitimate firewall input under the old per-ref filter) is closed; the zero-drop tripwire on real projected data holds.

## Security Review

PASS. No database/store/sync dependency in the three gateway modules (static require-whitelist scan). Inputs are read-only (deep-freeze + deep-compare). The result envelope carries no secrets, no upstream details, no raw reply; `containsSensitiveKey` + meta field whitelist double guard. A throwing provider is defensively converged to `llm_unavailable` (Gateway total-function rule); an injected malformed provider shape throws `GATEWAY_PROVIDER_INVALID` (input contract violation); registry-null resolves to the `llm_not_configured` empty-state envelope (`provider:'none'`). `GATEWAY_INVARIANT_BROKEN` is reachable only via test-side stubbing (see Findings M-1 for the one remaining theoretical path and its sanctioned resolution).

## Regression Review

PASS.

| Check | Result |
| --- | --- |
| Backend tests | 211/211 PASS (184 baseline + 22 gateway + 5 output-contract regression, zero regression) |
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

- M-1 — An injected provider returning a `failed` envelope with a non-contract `reason` (e.g. `totally_bogus_reason`) currently propagates into `buildFallbackOutput` and trips `GATEWAY_INVARIANT_BROKEN` (fail-closed 500). Unreachable by any production path (the 27.6.3 provider envelope factories only emit `FAIL_REASONS` vocabulary; registry is closed), so it does not block freezing. Resolution adopted at freeze (option ② sanctioned by the re-audit): the frozen architecture doc now explicitly declares this residual path and forbids wiring non-contract providers in Phase 27.7; the one-line reason-whitelist guard (option ①) is the designated alternative if 27.7 needs it.

### Low

- L-1 — No direct end-to-end gateway test for a `partial` candidate (locked at contract level; same code branch as validated; risk negligible). Recommended alongside the 27.7 M-1 guard.
- L-2 — Failed-envelope `reason` acceptance is the full `FALLBACK_REASONS` set, slightly wider than the architecture §4 table note ("⊆ FAIL_REASONS"); harmless wording drift.
- L-3 — The gateway test dependency whitelist allows `node:util`, which no module uses (over-permissive, harmless).

## Final Verdict

READY_TO_FREEZE
