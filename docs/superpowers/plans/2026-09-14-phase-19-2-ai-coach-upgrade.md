# Phase 19.2 AI Coach Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the AI from a data answering assistant to a warm, data-driven, read-only Growth Coach using a dedicated Coach behavior layer and layered prompts.

**Architecture:** Add `js/aiCoach.js` as a pure transformation layer from AI Context to Coach Prompt Context. `AIContext` will expose a compatible `coach` field, while `growthState` and all existing fields remain unchanged. The backend will send Context facts and Coach-derived insights as separate bounded prompt blocks.

**Tech Stack:** Native ES Modules, existing AI Context/Provider chain, Express backend, Vitest, Node.js test runner.

**Spec:** User request for Phase 19.2 at commit `30d7e51`.

## Global Constraints

- Keep the chain: `CGStore → Analytics → GoalEngine → Growth Intelligence → AI Context → AI Coach → Provider`.
- AI must not read `localStorage`, access the database, or mutate business data.
- AI must not bypass Analytics or create a second growth data source.
- No sync protocol or `CGStore` semantic changes.
- Keep `contextVersion` as `1.0` and preserve `growthState`.
- Reuse the AI page snapshot; do not repeatedly call `Store.get()` during initialization.
- Keep prompt persona warm, data-driven, non-anxious, specific, and autonomy-respecting.
- Provider failures, timeouts, empty replies, and auth errors remain user-safe.

---

### Task 1: Add AI Coach Module Tests

**Files:**

- Create: `tests/aiCoach.test.js`

**Interfaces:**

- Consumes: AI Context object.
- Produces: `buildCoachContext(context)` returning `{ version, role, persona, insights, recommendations, warnings, encouragement, dataSufficient, readOnly }`.

- [ ] Add tests for normal, empty, improving, declining, risk, recommendation, persona, and read-only cases.
- [ ] Assert the module has no Store, localStorage, Analytics, or GrowthIntelligence dependency.
- [ ] Run `npx vitest run tests/aiCoach.test.js`.

### Task 2: Implement AI Coach Module

**Files:**

- Create: `js/aiCoach.js`

**Interfaces:**

- Consumes: AI Context only.
- Produces: Coach Prompt Context.

- [ ] Map strengths to insights, risks to warnings, action proposals/recommended focus to recommendations.
- [ ] Generate supportive, non-judgmental encouragement.
- [ ] Return safe empty results when data is insufficient.
- [ ] Include Coach persona and read-only boundaries.

### Task 3: Upgrade AI Context

**Files:**

- Modify: `js/aiContext.js`
- Modify: `tests/aiContext.test.js`

**Interfaces:**

- Consumes: `AICoach.buildCoachContext(ctx)`.
- Produces: `ctx.coach` while preserving `ctx.growth`, `ctx.growthState`, and `ctx.insights`.

- [ ] Add a test asserting `coach` exists and `growthState` remains compatible.
- [ ] Attach Coach Prompt Context before trimming the context.
- [ ] Run focused AI Context tests.

### Task 4: Layer Provider Prompt

**Files:**

- Modify: `backend/src/services/promptBuilder.js`
- Modify: `backend/src/services/aiService.js`
- Modify: `backend/test/ai.test.js`

**Interfaces:**

- Produces: `buildCoachBlock(coach)` and a separate `<coach>` message block.

- [ ] Keep Context as raw facts and move Coach-derived analysis into `<coach>`.
- [ ] Prevent duplication by excluding `coach` from the serialized Context block.
- [ ] Test System → Context → Coach → History → User ordering.
- [ ] Test sensitive keys remain stripped and empty Coach data emits no extra block.

### Task 5: AI Page Conversation and Performance

**Files:**

- Modify: `pages/ai.js`
- Modify: `ai.html`
- Modify: `tests/ai.page.test.js`

**Interfaces:**

- Consumes: one AI page snapshot and the Coach field in AI Context.

- [ ] Reuse a stored snapshot for rendering and chat requests.
- [ ] Remove duplicate Growth Intelligence computation from panel rendering.
- [ ] Update quick questions to growth-coach prompts.
- [ ] Run AI page tests.

### Task 6: Full Verification, Review, and Report

**Files:**

- Create: `docs/AI_COACH_UPGRADE_REPORT.md`

- [ ] Run frontend tests, backend tests, production build, and `git diff --check`.
- [ ] Review architecture, security, prompt safety, performance, and compatibility.
- [ ] Commit as `feat: upgrade AI coach capability`.
