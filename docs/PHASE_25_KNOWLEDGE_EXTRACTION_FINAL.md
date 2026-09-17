# Phase 25 Knowledge Extraction Final

## 1. Objective

Phase 25 adds a bounded, additive knowledge extraction pipeline to the frozen Phase 24 Course Space foundation. AI output is treated as review-only evidence. It never writes a KnowledgeNode directly.

## 2. Architecture

```text
Document
  → ExtractionJob
  → AI Extraction Provider
  → KnowledgeCandidate
  → Evidence
  → User Review
  → Accepted KnowledgeNode
```

## 3. Data Model

- `course_space_extraction_jobs` records document version, SHA-256 content hash, provider, model, prompt version, state, and safe failure code.
- `course_space_knowledge_candidates` records AI title/content, confidence, lifecycle state, and preserved original output.
- Additive columns:
  - `course_space_nodes.source_candidate_id`
  - `course_space_evidence.candidate_id`

Candidate statuses are `pending`, `accepted`, and `rejected`. Job statuses are `queued`, `running`, `completed`, `failed`, and `cancelled`.

## 4. Extraction Pipeline

The service loads the authoritative document, verifies course ownership, creates a queued job, runs the injectable provider, validates all candidates, persists candidates with evidence, then completes or safely fails the job.

## 5. Provider Abstraction

`knowledgeExtractionProvider.js` reuses the OpenAI-compatible provider abstraction. It sends document data as JSON data, requires JSON output, caps output tokens, and maps provider failures to safe errors. Tests inject a fake provider.

## 6. Candidate Lifecycle

```text
AI output → pending → accepted / rejected
```

Original AI text remains immutable. Acceptance may edit materialized title/content, but original values remain traceable.

## 7. Evidence Model

Each candidate receives one evidence row pointing to its source document and version. Evidence initially has `node_id=''`; acceptance updates it to the materialized node.

## 8. Confidence Model

AI confidence is a finite number from 0 through 1. Accepted nodes receive `high`, `medium`, or `low` confidence using deterministic thresholds.

## 9. Review Model

Only a pending candidate can be accepted or rejected. Acceptance creates one KnowledgeNode with `source_candidate_id`. Rejection preserves the candidate and creates no node.

## 10. API

```text
POST /api/course-space/extraction/jobs
GET  /api/course-space/extraction/jobs
GET  /api/course-space/extraction/jobs/:id
POST /api/course-space/extraction/jobs/:id/cancel
GET  /api/course-space/extraction/candidates
GET  /api/course-space/extraction/candidates/:id/evidence
POST /api/course-space/extraction/candidates/:id/review
POST /api/course-space/extraction/candidates/:id/accept
POST /api/course-space/extraction/candidates/:id/reject
```

## 11. Authorization

All routes require JWT authentication. Service operations enforce `userId` plus owned course, document, job, and candidate relationships. Cross-user and cross-course access is tested.

## 12. Security

- Provider output is schema-validated and bounded.
- Provider/internal errors are not exposed.
- User data is rendered with `textContent`.
- AI cannot bypass user review.
- Ownership cannot be supplied from client payload.

## 13. Idempotency

The same user, document, version, content hash, provider, model, and prompt version returns the existing active/completed job unless explicit re-extraction is requested. Failed and cancelled jobs can be retried.

## 14. Limits

```yaml
extractionInput: 20000 chars
candidatesPerJob: 10
candidateTitle: 200 chars
candidateContent: 5000 chars
evidenceExcerpt: 2000 chars
evidenceLocator: 500 chars
pageSizeDefault: 20
pageSizeMax: 50
```

Oversized documents fail with `DOCUMENT_TOO_LARGE`; they are not silently truncated.

## 15. UI

The Course view adds a minimal extraction card backed by a service layer. It provides course/document selection, loading, empty, success, and friendly error states. It never calls `fetch` directly and does not introduce a second data system.

## 16. Tests

Backend lifecycle tests cover candidate creation, evidence linkage, acceptance materialization, idempotency, ownership isolation, oversized documents, malformed provider output, candidate limits, confidence validation, and safe failure messages.

Frontend tests cover safe rendering, job/empty states, loading, job creation, acceptance, and friendly errors.

## 17. Browser Validation

PASS at 1920×1080 and 375×812 using Chromium/Edge smoke checks. Extraction card rendered, selection and generate action worked, no horizontal overflow was found, and no uncaught page errors occurred. Temporary console 404s were limited to favicon requests in the mocked preview environment.

## 18. Regression Validation

```yaml
Frontend: 587/587 PASS
Backend: 93/93 PASS
Build: PASS
git diff --check: PASS
```

## 19. Files Changed

```text
backend/schema.sql
backend/src/db/index.js
backend/src/db/knowledgeExtractionModel.js
backend/src/services/knowledgeExtractionProvider.js
backend/src/services/knowledgeExtractionService.js
backend/src/routes/courseSpace.js
backend/test/knowledgeExtraction.test.js
js/apiClient.js
js/courseSpaceExtractionService.js
js/courseSpaceExtractionUI.js
pages/workbench.js
tests/courseSpaceExtractionUI.test.js
docs/PHASE_25_KNOWLEDGE_EXTRACTION_FINAL.md
```

## 20. Git Commit

`feat: add knowledge extraction pipeline`

## 21. Known Limitations

- Provider execution is synchronous with the job creation request.
- Relations are not generated by extraction.
- Vector search and semantic ranking remain Future Phase work.
- Re-extraction does not deduplicate concepts across documents.

## 22. Architecture Compliance

PASS. Phase 24 Course Space remains the source boundary; Candidate is not KnowledgeNode; Analytics, CGStore, Sync, Goals, and Reflection were not modified; Student Knowledge State and Personal Learning Agent were not implemented.
