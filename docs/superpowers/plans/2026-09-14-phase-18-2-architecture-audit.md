# Phase 18.2 Architecture Audit Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and guard the current data, sync, analytics, goals, AI, initialization, cache, and security boundaries without changing product behavior.

**Architecture:** Keep `CGStore` as the only business-data entry, Analytics/GoalEngine as derived-state sources, and the existing AI read-only chain. Add focused regression tests and an audit report; make no protocol or data-model changes.

**Tech Stack:** Native HTML/CSS/ES Modules, Vite MPA, Vitest, Node.js/Express/SQLite backend.

**Spec:** User request for Phase 18.2 Architecture Audit at commit `c1bc31a`.

## Global Constraints
- No new business features.
- No data model or `CGStore` semantic changes.
- No sync protocol changes.
- No framework introduction or large refactors.
- No file deletion.
- Business data uses only the `chenguangData` store key.
- Analytics and GoalEngine remain the only derived-data sources.
- AI remains read-only against business data.

---

### Task 1: Architecture Guard Tests

**Files:**
- Create: `tests/architecture.audit.test.js`

- [ ] Verify pages do not read or write the business storage key directly.
- [ ] Verify the canonical collections remain under `CGStore`.
- [ ] Verify Analytics snapshot, GoalEngine progress, and AI Context are read-only.

### Task 2: Sync Lifecycle Audit Tests

**Files:**
- Create: `tests/sync.audit.test.js`

- [ ] Verify every canonical collection write increments revision exactly once.
- [ ] Verify remote application does not enqueue a push.
- [ ] Verify a local write pushes once and does not loop.
- [ ] Verify offline changes remain queued and are retried on recovery.

### Task 3: Security Baseline Audit Tests

**Files:**
- Create: `tests/security.audit.test.js`

- [ ] Verify forbidden dynamic execution APIs remain absent.
- [ ] Verify user-content rendering paths in AI remain text-only.
- [ ] Verify protected data, AI, and course-import routes require auth.
- [ ] Verify service worker registration is restricted to HTTP(S) and production registration path.

### Task 4: Full Verification and Report

**Files:**
- Modify: `docs/ARCHITECTURE_AUDIT.md`

- [ ] Run frontend tests, backend tests, and production build.
- [ ] Run `git diff --check`.
- [ ] Commit the audit tests and report as one focused change.
