# Phase 27.6.5 Prompt Template Contract Independent Re-Audit

## Audit Scope

Independent post-implementation review covers doc-implementation conformance (registration-time contract rules 1–8, registry semantics, adapter delegation), byte-equivalent migration proof (golden baseline), payload closedness, frozen-surface integrity, security boundary, test quality and regression, scope containment, and the golden-permanence mechanism.

## Architecture Review

PASS. `agentPrompt/` is additive and isolated (3 modules). Registration-time validation enforces: shape `{version, buildMessages}` only; version pattern `/^agent-llm-provider-prompt-v\d+$/`; closedness probe ({} smoke + two distinct non-trivial payloads → three byte-identical system contents, `user content === JSON.stringify(payload)`, payload snapshot unchanged); five required semantic sections; forbidden-instruction scan (word-form extended); sensitive-text scan; `Object.freeze` last. The registry keeps `REGISTRY` module-private, rejects duplicate versions (`PROMPT_TEMPLATE_DUPLICATE`), fixes the active version at load time, and fails fast (`AGENT_PROMPT_ACTIVE_UNRESOLVED`) when the configured active version is unregistered. The adapter's `buildProviderMessages` is a pure delegation; `generateExplanation` call site and exports are unchanged.

The chain after 27.6.5:

```text
REASONING → [Prompt Template v1 (registered, frozen, golden-locked)] → Provider → VALIDATOR → USER
```

## Byte-Equivalence Review (golden baseline)

PASS. Programmatic evidence: the pre-migration inline system text was extracted from git HEAD (`git show HEAD:backend/src/services/agentProvider/openaiCompatibleProvider.js`), then compared against the test's `GOLDEN_SYSTEM_LINES` and the template module's `V1_SYSTEM_LINES` — three-way byte equality confirmed (19 lines each). The test asserts adapter output === registry output === golden and is annotated as permanently retained; any in-place v1 drift now trips the golden assertion, mechanically enforcing the "wording evolution requires a version bump" rule together with duplicate-version rejection and freeze.

## Closedness Review

PASS. `checkClosedness` runs the {} smoke call plus two distinct non-trivial probe payloads: three system contents byte-identical, user content exactly `JSON.stringify(payload)`, and a JSON snapshot comparison proving the payload is not mutated (mutation would also corrupt downstream evidence-binding snapshot comparison). Negative tests genuinely trigger `PROMPT_TEMPLATE_NOT_CLOSED` for both payload-interpolation-into-system and payload-mutation templates.

## Frozen-Surface Review

PASS. `providerContract`, `agentGateway/`, `agentFirewall/`, `agentOutputValidator/`, and `routes/` are untouched (git status empty for all). The change set matches architecture §0.2 exactly: 3 new agentPrompt modules, 1 additive env line (`agentLlmPromptVersion`), adapter delegation, 1 test-whitelist line, the new test file, and doc revisions. Envelope `promptVersion` still comes from the frozen `PROVIDER_PROMPT_VERSION` constant; the consistency lock test asserts `PROVIDER_PROMPT_VERSION === active template version === env default`.

## Security Review

PASS. Sensitive scanning is a case-insensitive text regex over system content + version (not the firewall's object-key `containsSensitiveKey`, which is a no-op on strings). The forbidden pattern matches the architecture doc verbatim, and word-form coverage is empirically locked by tests (`writes to`, `executable`, `retrievals`, `tooling`, `planners` all rejected). `promptTemplates.js` has zero requires (physically cannot read config/DB/env). `REGISTRY` is not exported. No new network/file/DB access surface.

## Regression Review

PASS.

| Check | Result |
| --- | --- |
| Backend tests | 228/228 PASS (211 baseline + 17 prompt-contract, zero regression) |
| agentPrompt tests | 17/17 PASS (9 groups; fail-fast finally-block restores env + require.cache, confirmed unpolluted by the full suite) |
| Frontend tests | 609/609 PASS |
| Build | PASS |
| `git diff --check` | PASS |
| Desktop browser 1920x1080 | PASS (6 pages, 0 errors) |
| Mobile browser 375x812 | PASS (6 pages, 0 errors) |
| Console / page / HTTP ≥ 400 / overflow errors | 0 |

## Scope Review

PASS. No new routes, no Chat/Planner/Memory/write-path/CGStore/Analytics/Goals/Sync/KnowledgeState changes, no second prompt system (the old inline text was deleted, not kept alongside — `ZHIXING agent home` appears exactly once in backend/src).

## Findings

### Critical

None.

### High

None.

### Medium

None.

### Low

- L-1 — Architecture doc §0.3 referenced "§4.4 consistency lock" (dangling; actual section is §4.3). Fixed in the freeze commit.
- L-2 — Validation execution order is shape → version → closedness (rules 3+7 merged) → sections → forbidden → sensitive → freeze, short-circuiting on the first violation; a multi-violation template may surface a different 400 code than the table order suggests. All eight rules are enforced and freeze runs last. Documented in the architecture doc (execution-order note) in the freeze commit.
- L-3 — Payload non-mutation uses a `JSON.stringify` snapshot comparison, equivalent to deep-equal for JSON-safe payloads (probes and firewall projections are JSON-safe); a future template version admitting non-JSON-safe values would need structural deep-equal.

## Final Verdict

READY_TO_FREEZE
