# Phase 25 Independent Re-Audit

## Baseline

Implementation: `235e247 fix: harden phase 25 knowledge extraction review`  
Previous Extraction Baseline: `4f21acc feat: add knowledge extraction pipeline`  
Architecture: `7f95cde docs: freeze personal learning agent architecture v1.1`  
Phase 24: `eabca22 docs: freeze phase 24 course space foundation`  
Audit Date: 2026-09-18

`4f21acc..235e247` contains the independent commit `22dbe17 fix: eliminate MPA first-frame flicker`. Architecture compliance below reviews the Phase 25 hardening commit itself.

## Architecture

PASS

The hardening commit remains Course Knowledge Capability only:

```text
Document -> Extraction Job -> Candidate -> Evidence -> Pending Review -> Accept / Reject
```

No Agent, Planner, Autonomous Action, Student Knowledge State, AI Tutor or Multi Agent behavior was introduced. AI output does not automatically materialize a KnowledgeNode; it remains a pending candidate until explicit human acceptance.

The commit does not modify CGStore, Analytics, Goals, Sync, GrowthContext, AIContext, GrowthMemory, CoachMemory, Reflection, `today.html` or `pages/today.js`. Course Space remains the ownership and source boundary for documents, evidence and reviewed knowledge.

## Security

PASS

All extraction routes require JWT authentication. Write routes also use the write limiter. Job, candidate and evidence access is scoped by `user_id`. Document creation uses user-owned course lookup, and extraction validates that the document belongs to that course.

AI output is normalized and allowlisted: candidate type, title/content length, evidence locator/quote length and confidence are validated. Confidence must be a finite Number in the 0-1 range. A job is capped at 10 candidates and extraction input is capped at 20000 characters.

## Data Integrity

PASS

Extraction persistence is atomic in `persistExtractionOutput`: candidates, evidence and completed job status are written in one SQLite transaction. A failed evidence or job update rolls back candidate writes.

Accept materialization is atomic in `materializeAcceptedCandidate`: the pending candidate is conditionally claimed, the KnowledgeNode is inserted and evidence is linked in one transaction. The conditional update requires `status = 'pending'`, and the unique partial index `uq_course_space_nodes_source_candidate` prevents duplicate source candidates. One candidate can therefore produce only one node.

Evidence is bound to document, candidate, node and version. Quote text is normalized and compared with the source document; matching quotes are `verified`, otherwise `unverified`. The UI displays the verification state.

Job and candidate lists use SQL limits with a maximum of 50. Candidate evidence is filtered in SQL by owner and candidate and is bounded by 50. Provider output is capped at 10 candidates.

## Frontend

PASS

Review cards show candidate title, content, type, confidence, source document, document version, locator, quote, evidence verification state and an empty evidence state. Users can edit title/content, accept or reject. Input lengths are bounded to 200 and 5000 characters. Untrusted values are rendered through `textContent`, not HTML concatenation.

## Backend

PASS

The implementation uses SQLite transactions, conditional updates and a unique partial index without changing database technology, authentication, sync protocol or the existing data model. There is no direct AI write path into course data.

## Browser

PASS

Production preview was verified with real Chromium/Edge at both target viewports:

```yaml
Desktop 1920x1080: PASS
Mobile 375x812: PASS
```

Checks covered rendering, candidate/evidence visibility, accept/reject controls, no page error, no console error, no HTTP 4xx/5xx and no horizontal overflow.

## Tests

```yaml
Backend:
  result: PASS
  tests: 96/96

Frontend:
  result: PASS
  tests: 588/588

Build:
  result: PASS

Browser:
  result: PASS

git diff --check:
  result: PASS
```

One initial frontend run had a non-Phase-25 teardown timer exception after all 588 tests passed. A repeat run passed 588/588 with exit code 0.

## Findings

| ID | Severity | Scope | Status |
| --- | --- | --- | --- |
| F-001 | Medium | Existing Phase 24 | Deferred |
| F-002 | Low | Existing | Deferred |
| F-003 | Low | Existing | Deferred |
| F-004 | Low | Existing | Deferred |
| F-005 | Low | Test Infra | Deferred |

F-001 records the pre-existing unbounded Course Space snapshot retrieval. Phase 25 job, candidate and evidence queries are bounded. F-002 records locator semantic validation. F-003 records bounded per-candidate evidence requests. F-004 records a non-corrupting concurrent reject acknowledgement edge case. F-005 records the unrelated flaky teardown timer.

## Final Verdict

READY_TO_FREEZE
