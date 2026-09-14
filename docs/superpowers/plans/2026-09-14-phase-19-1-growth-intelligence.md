# Phase 19.1 Growth Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Growth Intelligence into an explainable long-term growth analysis foundation with weighted Growth Score, 7/30/90-day trends, strengths, risks, AI Context integration, and a Workbench insight card.

**Architecture:** Extend the existing pure `GrowthIntelligence` module and consume only an Analytics-derived snapshot plus GoalEngine-derived goals. Add a compatibility `growth` object to AI Context while preserving the existing `growthState`. Render insights through the existing Workbench card without introducing a second data or state system.

**Tech Stack:** Native ES Modules, existing Analytics/GoalEngine, Vitest, Vite MPA.

**Spec:** User request for Phase 19.1 at commit `a34b8a8`.

## Global Constraints

- Keep data flow: `CGStore → Analytics → GoalEngine → AI Context → AI Provider`.
- No second data source, no page-level business calculations.
- Growth Intelligence remains read-only and accepts snapshot input.
- AI remains read-only and cannot write user data.
- No sync protocol, Analytics semantic, or data-model changes.
- Keep `contextVersion` as `1.0` and preserve existing AI Context fields.
- Avoid large CSS or HTML refactors; reuse Workbench card components.

---

### Task 1: Growth Intelligence Extensions

**Files:**

- Modify: `js/growthIntelligence.js`
- Modify: `tests/growthIntelligence.test.js`

**Interfaces:**

- Produces: `state.growthScore`, `state.growthSummary`, and `GrowthIntelligence.buildGrowthOverview(snapshot, options)`.
- `growthSummary.ranges` contains `7d`, `30d`, and `90d`; each range has `learningTrend`, `consistency`, `tasks`, `strengths`, and `risks`.
- Growth Score uses weighted completion, continuity, and momentum factors, not a simple metric average.

- [ ] Add failing regression tests for 7/30/90 windows, score factors, improving and declining trends, empty data, large data, and read-only behavior.
- [ ] Add `90d` to trend windows while retaining existing `7d`/`14d`/`30d` compatibility.
- [ ] Implement weighted Growth Score with visible factor weights and explanations.
- [ ] Implement 7/30/90 growth overview and range-specific strengths/risks.
- [ ] Run `npx vitest run tests/growthIntelligence.test.js`.

### Task 2: AI Context Integration

**Files:**

- Modify: `js/aiContext.js`
- Modify: `tests/aiContext.test.js`
- Modify: `ai.html`

**Interfaces:**

- Consumes: `GrowthIntelligence.computeGrowthState(snapshot, { today })`.
- Produces: `context.growth = { score, trends, risks, strengths }` while retaining `context.growthState`.

- [ ] Add AI Context tests asserting `growth`, score, 7/30/90 trends, and read-only behavior.
- [ ] Map Growth Intelligence output into the compact `growth` context field.
- [ ] Add quick prompts for recent status, largest progress, and main problem.
- [ ] Run `npx vitest run tests/aiContext.test.js tests/ai.page.test.js`.

### Task 3: Workbench Display

**Files:**

- Modify: `pages/workbench.js`
- Modify: `workbench.html`
- Modify: `workbench.html` inline styles only if a small layout helper is required.

**Interfaces:**

- Consumes: existing `GrowthIntelligence.buildDailyInsight` and the new score/summary.
- Produces: Growth Score and 7/30/90 insight rows inside `#growthBriefCard`.

- [ ] Add a Workbench regression test asserting one snapshot, score rendering, and range insights.
- [ ] Render score, range summaries, strengths, and risks through text-only DOM creation.
- [ ] Reuse `growth-brief-*` and `func-card` styling; avoid page-level animation.
- [ ] Run `npx vitest run tests/ux-product.test.js tests/pageInitialization.test.js`.

### Task 4: Full Verification, Review, and Report

**Files:**

- Create: `docs/GROWTH_INTELLIGENCE_REPORT.md`

- [ ] Run frontend tests, backend tests, and production build.
- [ ] Review read-only behavior, context budget, user isolation, and regression compatibility.
- [ ] Run `git diff --check`.
- [ ] Commit as `feat: implement growth intelligence foundation`.
