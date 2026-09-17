# Phase 24 Course Space & Knowledge Base Foundation

## 1. Objective

Phase 24 establishes the Course Space and Knowledge Base foundation required by Personal Learning Agent Architecture v1.1.

This phase deliberately excludes:

- full Agent behavior,
- planning,
- autonomous actions,
- Student Knowledge State,
- exam intelligence,
- knowledge extraction,
- AI-generated blind writes,
- and multi-agent orchestration.

## 2. Cold Start Audit

- Baseline: `7f95cde docs: freeze personal learning agent architecture v1.1`
- Working tree: clean except existing temporary media directories.
- Existing Course System 2.0 remained read-only and untouched.
- Existing `courses[]`, progress, schedule, Analytics, CGStore, Goals, and Sync behavior were unchanged.
- Architecture v1.1 requires Course Knowledge to be separate from Course System and independent of `chenguangData`.

## 3. Data Models

### Course Space Document

```text
Document
  id
  user_id
  course_id
  title
  content
  source_url
  version
  created_at
  updated_at
```

Documents are user-owned course artifacts. They are not course schedule rows and do not replace course progress.

### KnowledgeNode

```text
KnowledgeNode
  id
  user_id
  course_id
  title
  kind
  definition
  status
  confidence
  version
  created_at
  updated_at
```

Allowed kinds: `concept`, `definition`, `principle`, `procedure`, `formula`, `example`, `skill`.

Allowed status: `candidate`, `validated`, `accepted`.

Allowed confidence: `high`, `medium`, `low`.

### KnowledgeRelation

```text
KnowledgeRelation
  id
  user_id
  course_id
  source_node_id
  target_node_id
  relation_type
  version
  created_at
```

Allowed relations: `prerequisite`, `depends_on`, `part_of`, `related_to`, `contrasts_with`, `example_of`, `applies_to`.

Relations are validated against nodes owned by the same user and course.

### Evidence

```text
Evidence
  id
  user_id
  course_id
  document_id
  node_id
  quote
  locator
  version
  created_at
```

Evidence is always traceable to a Document and a KnowledgeNode owned by the same user and course.

## 4. Persistence Boundary

Added four independent SQLite tables:

```text
course_space_documents
course_space_nodes
course_space_relations
course_space_evidence
```

These tables are intentionally separate from `user_data` and `chenguangData`.

Existing Sync Protocol remains unchanged. Course Knowledge is not added to `PAYLOAD_KEYS`, `CGStore`, Analytics, Goals, or AI Context.

## 5. API Boundary

Added an authenticated Course Space API:

```text
GET    /api/course-space
GET    /api/course-space/search
POST   /api/course-space/documents
POST   /api/course-space/nodes
POST   /api/course-space/relations
POST   /api/course-space/evidence
```

Security rules:

- JWT authentication is required.
- Every row is bound to `user_id`.
- `courseId` must belong to the authenticated user's existing `courses[]`.
- Node and document references must have the same owner and course.
- Relation types and node types are allowlisted.
- Text fields are length-bounded.
- URLs are restricted to `http` and `https`.
- Search limit is bounded to `1..50`.
- Write endpoints use the existing write limiter and CSRF protection.

## 6. Retrieval Foundation

Implemented deterministic, ownership-aware search over:

```text
KnowledgeNode.title
KnowledgeNode.definition
Document.title
Document.content
Evidence.quote
Evidence.locator
```

The current retrieval is SQL-backed and bounded. It does not use a vector database and does not claim semantic understanding.

## 7. Frontend Service and UI

Added:

```text
js/courseSpaceService.js
js/courseSpaceUI.js
```

The UI is mounted in the existing Workbench Course view as a minimal read-only Course Space card.

It supports:

- course selection,
- bounded knowledge search,
- knowledge snapshot counts,
- KnowledgeNode preview,
- Document preview,
- Evidence preview,
- loading state,
- empty state,
- and friendly error state.

The UI does not directly call `fetch`. It uses the shared `CGAPI.courseSpace` client.

## 8. Course System Boundary

Existing Course System remains responsible for:

```text
course identity
schedule
progress
```

Course Space remains responsible for:

```text
documents
knowledge nodes
relations
evidence
```

The two systems are linked only by `courseId`, which is validated against the user's existing course list.

## 9. Architecture Compliance

| Architecture Rule | Status |
| --- | --- |
| Course Knowledge separate from Course System | PASS |
| Structured Knowledge Model before vector index | PASS |
| No new second user-data store | PASS |
| Existing Sync Protocol unchanged | PASS |
| Analytics unchanged and still canonical | PASS |
| Goals unchanged | PASS |
| CGStore unchanged | PASS |
| Ownership enforced on every API path | PASS |
| Evidence references validated | PASS |
| Retrieval bounded and source-attributed | PASS |
| No Planner / Agent / autonomous action | PASS |

## 10. Test Strategy

Added backend tests:

```text
backend/test/courseSpace.test.js
```

Coverage:

- authentication,
- document creation,
- KnowledgeNode creation,
- KnowledgeRelation creation,
- Evidence creation,
- snapshot retrieval,
- bounded search,
- invalid relation type,
- invalid course ownership,
- cross-user isolation,
- and invalid foreign references.

Added frontend tests:

```text
tests/courseSpaceUI.test.js
```

Coverage:

- shared API client usage,
- snapshot normalization,
- knowledge rendering,
- course rendering,
- search loading state,
- evidence rendering,
- and safe error behavior.

## 11. Regression Results

```yaml
Frontend:
  584/584 PASS

Backend:
  88/88 PASS

Build:
  PASS

git diff --check:
  PASS
```

No new regressions were found.

## 12. Browser Acceptance

Executed local Chromium smoke validation through Playwright:

| Viewport | Result | Horizontal Scroll | Course Space Visible | Page Errors |
| --- | ---: | ---: | ---: | ---: |
| 1920×1080 | PASS | No | Yes | 0 |
| 375×812 | PASS | No | Yes | 0 |

The seeded smoke test verified that Course Space renders the course selector and `Closure` KnowledgeNode.

## 13. Files Changed

| File | Change |
| --- | --- |
| `backend/schema.sql` | Added four Course Space tables |
| `backend/src/db/courseSpaceModel.js` | Added persistence model |
| `backend/src/services/courseSpaceService.js` | Added validation, ownership, creation, snapshot, and search |
| `backend/src/routes/courseSpace.js` | Added Course Space API |
| `backend/src/routes/index.js` | Mounted `/api/course-space` |
| `backend/test/courseSpace.test.js` | Added backend tests |
| `js/apiClient.js` | Added shared Course Space client |
| `js/courseSpaceService.js` | Added frontend service layer |
| `js/courseSpaceUI.js` | Added read-only UI component |
| `pages/workbench.js` | Mounted Course Space in Course view |
| `tests/courseSpaceUI.test.js` | Added frontend tests |
| `docs/PHASE_24_COURSE_SPACE_FOUNDATION_FINAL.md` | Added phase report |

## 14. Known Limitations

- Document, Node, Relation, and Evidence creation is API-only; creation UI is intentionally not included in this phase.
- Retrieval is keyword/substring based, not semantic.
- There is no editing, deletion, migration, import, extraction, or review workflow.
- There is no Student Knowledge State.
- There is no AI integration in this phase.
- There is no Agent Context integration.

These limits are intentional and belong to later phases.

## 15. Phase Decision

```text
Phase 24:
READY / FROZEN CANDIDATE

Course Space & Knowledge Base Foundation:
COMPLETE
```
