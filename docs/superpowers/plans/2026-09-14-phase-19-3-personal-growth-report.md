# Phase 19.3 Personal Growth Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only personal growth report layer that converts existing Growth Intelligence and AI Coach results into daily, weekly, and monthly reports.

**Architecture:** Add `js/growthReport.js` as a pure transformation layer over AI Context. Attach bounded `report.weekly` and `report.monthly` objects to AI Context without removing old fields. AI and Stats pages consume the same Context-derived reports and render text with existing UI patterns.

**Tech Stack:** Native ES Modules, HTML, CSS, Vite MPA, Vitest, jsdom.

**Spec:** Approved Phase 19.3 design from the current task.

## Global Constraints

- Keep the chain: `CGStore → Analytics → GoalEngine → Growth Intelligence → AI Context → AI Coach → Growth Report`.
- Report must not read `localStorage`, `sessionStorage`, CGStore, or databases.
- Report must not calculate Analytics or business metrics.
- Do not modify CGStore structure or sync protocol.
- Preserve `contextVersion`, `growth`, `growthState`, and `coach`.
- Reports must be read-only and safe.
- Final verification: `npm test`, `npm run build`, `cd backend && npm test`, `git diff --check`.

---

### Task 1: Growth Report Module Tests

**Files:**

- Create: `tests/growthReport.test.js`

**Interfaces:**

- Consumes: AI Context-like objects with `growth`, `growthState`, `coach`, `overview`, `goals`, and `study`.
- Produces: `buildReport(context, period)` and `formatReport(report)`; `period` is `daily`, `weekly`, or `monthly`.

- [ ] Write tests for daily, weekly, monthly, empty, rising, falling, risk, recommendation, old-context compatibility, input immutability, and no direct data access.
- [ ] Run `npx vitest run tests/growthReport.test.js`; expect the new tests to fail because the module does not exist.

### Task 2: Growth Report Module

**Files:**

- Create: `js/growthReport.js`

**Interfaces:**

- Consumes: AI Context-like object and period.
- Produces:
  - `buildReport(context, period)` returns `{ version, readOnly, period, summary, achievements, insights, challenges, recommendations, nextSteps, dataSufficient }`.
  - `buildReports(context)` returns `{ daily, weekly, monthly }`.
  - `formatReport(report)` returns a safe plain-text report.

- [ ] Limit each list to 4 items and each message to 220 characters.
- [ ] Derive summaries from `growth.trends` / `growthState`; derive achievements from existing Context values; derive challenges from risks and recommendations from Coach.
- [ ] Return honest insufficient-data text and empty lists for empty Context.
- [ ] Run `npx vitest run tests/growthReport.test.js`; expect all tests to pass.

### Task 3: AI Context Integration

**Files:**

- Modify: `js/aiContext.js`
- Modify: `tests/aiContext.test.js`

**Interfaces:**

- Consumes: `GrowthReport.buildReports(ctx)`.
- Produces: `ctx.report = { daily, weekly, monthly }`.

- [ ] Add a test that `report.weekly` and `report.monthly` exist while `growth`, `growthState`, and `coach` remain present and Store stays read-only.
- [ ] Build reports from the Context before final trimming.
- [ ] Run `npx vitest run tests/growthReport.test.js tests/aiContext.test.js tests/aiDataRetrieval.test.js`; expect all tests to pass.

### Task 4: AI Page Report Capability

**Files:**

- Modify: `pages/ai.js`
- Modify: `ai.html`
- Modify: `tests/ai.page.test.js`

**Interfaces:**

- Consumes: `currentContext.report`, `GrowthReport.formatReport(report)`, and the existing AI message renderer.
- Produces: deterministic local assistant replies for explicit report intents.

- [ ] Replace the generic quick question with `生成我的本周成长报告`; keep five quick questions.
- [ ] Detect weekly report, monthly report, and recent-change intents before the provider request.
- [ ] Render report replies through the existing `textContent` path.
- [ ] Run `npx vitest run tests/growthReport.test.js tests/aiContext.test.js tests/ai.page.test.js`; expect all tests to pass.

### Task 5: Stats Report Entry

**Files:**

- Modify: `stats.html`
- Modify: `pages/stats.js`
- Modify: `tests/stats.test.js`

**Interfaces:**

- Consumes: the existing `loadAll()` snapshot and `AIContext.buildContext(snapshot)`.
- Produces: weekly/monthly report tabs and report text inside one new stats section.

- [ ] Add a Growth Report section with weekly/monthly tabs.
- [ ] Build one Context per snapshot and cache it only for the current page load.
- [ ] Render report content with `textContent`; tab switching must not reread Store or Analytics.
- [ ] Run `npx vitest run tests/growthReport.test.js tests/stats.test.js`; expect all tests to pass.

### Task 6: Verification, Review, and Release Report

**Files:**

- Create: `docs/PERSONAL_GROWTH_REPORT_REPORT.md`

- [ ] Run full frontend tests, production build, backend tests, and `git diff --check`.
- [ ] Review architecture, security, performance, compatibility, and report quality.
- [ ] Create the required release report.
- [ ] Commit as `feat: implement personal growth report system` and leave the working tree clean.
