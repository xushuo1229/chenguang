# Architecture Review Required

Date: 2026-09-18

Phase: 27.1 Agent Context Builder

Status: ARCHITECTURE REVIEW REQUIRED

## 1. Review Trigger

Phase 27.1 implementation is functionally read-only, bounded and user-isolated. Backend, frontend, build and browser smoke checks passed. However, the independent audit found that the LearningContext memory boundary does not fully match the frozen Agent Home architecture.

This document is a review request. It is not approval to start Phase 27.2, modify production code, migrate data or perform a repair in this audit gate.

## 2. Evidence

### 2.1 Reflection Summary Boundary

The frozen architecture defines Reflection as user-owned feedback and Reflection Summary as recent reflection topics and feedback:

```text
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:52
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:192
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:255
```

The current implementation builds `reflections.todaySummary` from `reflectionContextSource` behavior helpers:

```text
backend/src/services/agentHomeService.js:131-140
backend/src/services/agentHomeService.js:183-190
```

Therefore the field is a deterministic behavior snapshot, not Reflection history or user-owned Reflection Summary.

### 2.2 Data Duplication

The same task, focus and streak summaries are placed under both `learningHistory` and `reflections.todaySummary`:

```text
backend/src/services/agentHomeService.js:175-190
```

This creates two consumers of the same derived projection without a single named ownership boundary.

### 2.3 GrowthMemory Source

GrowthMemory is currently projected from CGStore `user.memory`:

```text
backend/src/services/agentHomeService.js:108-128
backend/src/services/agentHomeService.js:197-203
```

The architecture describes GrowthMemory as long-term confirmed memory, while CGStore user memory is a browser-originated derived memory structure. The current implementation exposes it without an explicit authority marker distinguishing fact, confirmed memory and derived projection.

### 2.4 CoachMemory Availability

CoachMemory remains browser-side data and is unavailable to the backend:

```text
backend/src/services/agentHomeService.js:197-203
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:258
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:328
```

The response honestly marks it unavailable, but the contract still reserves a field that currently has no backend Source of Truth.

## 3. Required Architecture Decisions

1. Define whether `reflections.todaySummary` should represent:
   - true Reflection history;
   - a deterministic behavior snapshot; or
   - a separate behavior context field in LearningContext.

2. Define the canonical owner of the daily task/focus/streak summary and whether `learningHistory` may reuse it as a read-only projection.

3. Define GrowthMemory authority semantics:
   - Source Data;
   - Derived Memory;
   - Confirmed Memory; or
   - a versioned projection with explicit authority metadata.

4. Define whether CoachMemory should remain in LearningContext v1 as `available:false`, be removed from the v1 contract, or wait for a server-side CoachMemory adapter.

5. Define the migration-safe contract rule for future LearningContext versions without breaking `learning-context-v1`.

## 4. Constraints

- Do not modify CGStore.
- Do not modify Analytics.
- Do not modify Goals.
- Do not modify Sync.
- Do not modify Reflection.
- Do not create a second memory system.
- Do not mutate Knowledge State.
- Do not introduce Agent, Planner, Tutor or Autonomous Action.
- Maintain user isolation and bounded reads.

## 5. Recommended Resolution Direction

The smallest architecture-preserving direction is likely to keep `learning-context-v1` stable, add explicit source/authority metadata, and clarify that today's Reflection field is a behavior snapshot until a true Reflection adapter exists. A separate bounded adapter can later expose true Reflection history without duplicating statistics.

This direction must be approved before implementation because it affects the LearningContext contract.

## 6. Gate Impact

Phase 27.1 remains:

```text
NOT_READY_TO_FREEZE
```

Phase 27.2 must not start until this review is resolved.
