# Phase 19.4 Growth Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, privacy-safe long-term growth memory system persisted through CGStore and consumed by AI Context, AI Coach, and Stats.

**Architecture:** Add `js/growthMemory.js` as a pure derivation and lifecycle layer over AI Context. Persist only derived memory through `CGStore.setUser({ memory })`; never persist chat text or sensitive fields. `AIContext` merges existing `user.memory` with newly derived active memory and exposes a bounded `memory` field to AI Coach and Stats.

**Tech Stack:** Native ES Modules, HTML, CSS, Vite MPA, Vitest, jsdom.

**Spec:** Approved Phase 19.4 design from the current task.

## Global Constraints

- Keep the chain: `CGStore → Analytics → GoalEngine → Growth Intelligence → AI Coach → Growth Report → Growth Memory → AI Context`.
- No second user data source, no second `localStorage`, no separate database.
- Persist Memory only through `CGStore.setUser({ memory })`.
- Do not modify sync protocol, Analytics logic, or CGStore collections.
- Do not store chat history, tokens, keys, identity fields, or private content.
- Preserve `contextVersion`, `growth`, `growthState`, `coach`, and `report`.
- AI may read Memory but cannot write Memory or business data.
- Final verification: `npm test`, `npm run build`, `cd backend && npm test`, `git diff --check`.

---

### Task 1: Growth Memory Tests

**Files:**

- Create: `tests/growthMemory.test.js`

**Interfaces:**

- Consumes: AI Context-like objects with `growth`, `growthState`, `coach`, `overview`, and optional `coachContext`.
- Produces: `buildMemory(context, opts)`, `mergeMemory(existing, next, opts)`, `buildContextMemory(memory)`, and `updateMemory(store, context, opts)`.

- [ ] Add fixtures for normal, empty, rising, falling, short-term volatility, milestone, and existing-memory cases.
- [ ] Assert normal generation, empty safety, long-term thresholds, update dedupe, weight decay, inactive filtering, immutable input, Store-backed persistence, revision bump, and sensitive-field stripping.
- [ ] Run `npx vitest run tests/growthMemory.test.js`; expect failure because the module is absent.

### Task 2: Growth Memory Module

**Files:**

- Create: `js/growthMemory.js`

**Interfaces:**

- Produces:
  - `buildMemory(context, opts)` returns `{ version, updatedAt, patterns, milestones, preferences, insights }`.
  - `mergeMemory(existing, next, opts)` deduplicates, refreshes, decays, demotes, and caps items.
  - `buildContextMemory(memory)` returns bounded active context arrays.
  - `updateMemory(store, context, opts)` persists through `store.setUser({ memory })` only when content changes.

- [ ] Derive patterns only from 30/90-day trends, sustained streaks, or repeated risk patterns.
- [ ] Derive milestones from 7/30/90-day streaks, meaningful 30-day totals, or completed goals.
- [ ] Derive preferences from Coach Memory facts or concrete action patterns; never invent user statements.
- [ ] Cap patterns to 12, milestones to 8, preferences to 6, insights to 8.
- [ ] Sanitize statements and evidence, and reject sensitive keys.
- [ ] Run `npx vitest run tests/growthMemory.test.js`; expect all tests to pass.

### Task 3: AI Context and AI Coach Integration

**Files:**

- Modify: `js/aiContext.js`
- Modify: `js/aiCoach.js`
- Modify: `tests/aiContext.test.js`
- Modify: `tests/aiCoach.test.js`

**Interfaces:**

- Produces: `ctx.memory = { patterns, milestones, preferences, insights }`; Coach output may include `memory_challenge` warnings and long-term insights.

- [ ] Merge existing `snapshot.user.memory` with newly derived memory without mutation or Store writes.
- [ ] Keep old fields and `contextVersion` compatible.
- [ ] Add Memory insights and challenge patterns to Coach output without duplicating existing messages.
- [ ] Run `npx vitest run tests/growthMemory.test.js tests/aiContext.test.js tests/aiCoach.test.js tests/aiDataRetrieval.test.js`; expect all tests to pass.

### Task 4: Stats Growth Trajectory UI

**Files:**

- Modify: `stats.html`
- Modify: `pages/stats.js`
- Modify: `tests/stats.test.js`

**Interfaces:**

- Consumes: `reportContext.memory` and `GrowthMemory.updateMemory(Store, reportContext)`.
- Produces: a “我的成长轨迹” card with transparent Memory lists and an explicit update button.

- [ ] Render habits, strengths, milestones, and preferences with `textContent`.
- [ ] Persist only when the user clicks “更新成长记忆”.
- [ ] Verify revision increases once and Store data changes only in `user.memory`.
- [ ] Run `npx vitest run tests/growthMemory.test.js tests/stats.test.js`; expect all tests to pass.

### Task 5: Verification, Review, and Release Report

**Files:**

- Create: `docs/LONG_TERM_MEMORY_REPORT.md`

- [ ] Run full frontend tests, production build, backend tests, and `git diff --check`.
- [ ] Review architecture, privacy, security, performance, sync compatibility, and memory lifecycle.
- [ ] Create the required release report.
- [ ] Commit as `feat: implement growth memory system` and leave the working tree clean.
