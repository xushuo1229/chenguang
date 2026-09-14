# Phase 18.3 Release Readiness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify that authentication, recovery, multi-device sync, AI reliability, page stability, deployment, and security are ready for Phase 19 expansion without changing product architecture.

**Architecture:** Reuse existing `CGStore`, `CGSync`, `Analytics`, `GoalEngine`, and AI read-only boundaries. Add focused regression coverage only where release-critical behavior was unverified. Record findings in a release readiness report.

**Tech Stack:** Native HTML/CSS/ES Modules, Vite MPA, Vitest, Node.js/Express/SQLite/JWT.

**Spec:** User request for Phase 18.3 Release Readiness Audit at commit `7388900`.

## Global Constraints

- No new business features.
- No product design changes.
- No `CGStore` structure or sync protocol changes.
- No Analytics calculation changes.
- No large refactors or new frameworks.
- Do not remove historical compatibility code.
- All user data remains behind `CGStore`.
- AI remains read-only against business data.
- Authentication, payload, CORS, and JWT behavior remain unchanged.

---

### Task 1: Static Release Audit

**Files:**

- Audit: `pages/index.js`, `pages/login.js`, `pages/ai.js`, `js/sync.js`, `js/aiContext.js`, `service-worker.js`, `backend/src/**`

- [ ] Verify first-launch and login paths preserve server-backed authentication and do not fake success.
- [ ] Verify AI provider failure, timeout, empty response, context limits, and read-only behavior are covered.
- [ ] Verify frontend startup, navigation, page initialization, Service Worker versioning, and build artifacts are covered.
- [ ] Verify backend error handling, CORS, JWT, user isolation, payload limits, and API status handling.

### Task 2: Recovery and Multi-Device Regression

**Files:**

- Create: `tests/recovery.audit.test.js`

**Interfaces:**

- Consumes: `CGStore.set`, `CGStore.get`, `CGStore.getRevision`, `CGSync.pull`, `CGSync.push`, `CGSync.mergeState`.
- Produces: Regression tests proving cloud restore, offline preservation, online retry, and device merge integrity.

- [ ] **Write recovery and multi-device tests**

```js
test('clear local storage, then pull server data', async () => {
  localStorage.clear();
  CGStore.resetData();
  localStorage.setItem('cg_token', 'audit-token');
  // Mock GET /api/data with remote revision 9 and cloud records.
  await expect(CGSync.pull()).resolves.toBe(true);
  expect(CGStore.get().todos).toHaveLength(1);
  expect(CGStore.getRevision()).toBe(9);
});
```

- [ ] **Run focused tests**

Run: `npx vitest run tests/recovery.audit.test.js`

Expected: PASS.

### Task 3: Full Verification

**Files:**

- No product code changes expected.

- [ ] Run frontend tests.
- [ ] Run backend tests.
- [ ] Run production build.
- [ ] Run Git whitespace check.

### Task 4: Release Report

**Files:**

- Create: `docs/RELEASE_READINESS_AUDIT.md`

- [ ] Record PASS/WARN/FAIL for all requested audit areas.
- [ ] List blockers, accepted risks, modified files, test results, and Phase 19 recommendation.
- [ ] Commit only audit tests and documentation with one focused commit.
