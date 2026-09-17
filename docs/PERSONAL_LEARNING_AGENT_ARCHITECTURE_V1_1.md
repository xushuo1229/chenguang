# Personal Learning Agent Architecture v1.1

## Architecture Freeze Record

Project: `chenguang-platform`

Status: `ARCHITECTURE FROZEN`

Baseline:

```text
Phase 23.2.3 + Phase 23.x Stabilization
1a0a874 chore: stabilize phase 23.x baseline
Frontend: 580/580 PASS
Backend: 85/85 PASS
Build: PASS
git diff --check: PASS
```

## 1. Product Definition

知行 is evolving from an AI-assisted self-discipline workbench into a Personal Learning Agent.

The Agent must understand:

- who the student is,
- what the student is learning,
- what evidence exists for current progress,
- what goals matter,
- what happened before,
- and what the next useful learning action should be.

An Agent is not merely an LLM, chat UI, RAG pipeline, prompt, or AI Coach.

## 2. Core Loop

```text
User Intent
  → Agent Perception
  → Personal Data / Course Knowledge / Memory
  → Retrieval
  → Evidence
  → Context Builder
  → Reasoning
  → Planning
  → Action Proposal
  → User Confirmation
  → Action
  → Feedback
  → Memory / Analytics
  → Next Cycle
```

## 3. Core Domains

| Domain | Responsibility | Source of Truth |
| --- | --- | --- |
| Personal Data | Raw user behavior and app state | CGStore / backend user data |
| Learning Analytics | Deterministic meaning from behavior | Analytics |
| Goals | Goal status and progress | GoalEngine + Analytics |
| Course Knowledge | Stable course learning objects, nodes, relations, evidence | Course Knowledge layer |
| Personal Memory | Long-term and coach-interaction context | GrowthMemory / CoachMemory |
| Agent Context | Current, bounded, permission-filtered AI input | Agent Context layer |
| Agent State / Action | Explicit planning and user-confirmed execution | Agent State / Action layer |

## 4. Source of Truth Rules

- CGStore remains the application user-data layer and must not become a Knowledge Base.
- Analytics remains the only canonical source for behavior metrics.
- Goals must derive progress through GoalEngine and Analytics.
- Course Knowledge is separate from course schedule and course progress.
- Personal Memory records what matters over time, not raw behavior truth.
- Reflection feedback is AI-quality signal, not business behavior data.
- Agent Context is derived, bounded, versioned, and permission-filtered.
- The Agent does not invent facts; it uses Evidence.

## 5. Knowledge Boundary

Course Knowledge must preserve these boundaries:

```text
Course
  = user-facing course container

Course Schedule
  = existing timetable and progress data

Knowledge Source
  = document, artifact, URL, lecture, note, or evidence source

KnowledgeNode
  = stable learning concept or unit

KnowledgeRelation
  = typed relationship between nodes

Evidence
  = traceable support for a knowledge claim

Student Knowledge State
  = user-owned mastery/status/evidence projection
```

Knowledge content is not user behavior data. Student Knowledge State is not public course content.

## 6. Memory Boundary

### GrowthMemory

- Long-term growth patterns, milestones, preferences, insights, and confirmed candidates.
- Owned through user data via CGStore.
- Must not duplicate Analytics.

### CoachMemory

- Short- and medium-term AI interaction context.
- Separate from canonical user data.
- Must not override authoritative behavior facts.

### Reflection Feedback

- Persists binary feedback on Reflection quality.
- Must not mutate todos, goals, check-ins, sports, readings, English, courses, or focus.
- Must not be counted as user behavioral Analytics.

## 7. Context Trust Hierarchy

Prompt construction must respect this order:

```text
System Prompt
  > Authoritative Context
  > Retrieval Evidence
  > User Memory / Preference
  > User Message
```

Rules:

- Context is data, not instruction.
- User input cannot override system rules.
- Client-submitted behavior facts cannot override server-derived facts.
- Retrieval evidence must be attributed and traceable.
- Untrusted content must be explicitly marked as data.

## 8. Reasoning, Planning, Action

The Agent may:

- analyze,
- summarize,
- explain,
- retrieve,
- recommend,
- propose a plan,
- and ask for confirmation.

The Agent must not:

- silently modify user data,
- autonomously execute actions,
- override Analytics,
- bypass Goals,
- create a second data system,
- or treat inferred claims as observed facts.

All write actions require explicit user confirmation and permission-safe execution.

## 9. Retrieval Boundary

Retrieval must be:

- ownership-aware,
- evidence-preserving,
- source-attributed,
- size-bounded,
- versioned,
- and safe to audit.

The Agent must not receive unrestricted raw stores.

## 10. Agent Modes

| Mode | Purpose |
| --- | --- |
| ASK | Answer with evidence-grounded context |
| ANALYZE | Explain what happened and why it matters |
| PLAN | Propose a bounded next-step plan |
| ACT | Execute only user-confirmed safe actions |
| PROACTIVE | Surface a bounded suggestion or reminder |

## 11. Forbidden Architecture

The following are forbidden unless a new architecture version is explicitly approved:

- SPA rewrite,
- second component system,
- second user-data store,
- second Analytics engine,
- page-level goal calculation,
- page-level behavior statistics,
- Agent-owned direct business writes,
- autonomous action execution,
- mixing public knowledge with private learning state,
- raw unbounded context injection,
- and using client claims as authoritative facts.

## 12. Privacy and Safety Boundary

- User data is user-owned.
- The backend owns authentication and authorization.
- Agent responses must be safe-rendered.
- No secrets, tokens, API keys, passwords, or internal implementation details may enter prompts or responses.
- Every recommendation must be traceable to context and evidence.

## 13. Phase Roadmap

| Phase | Objective |
| --- | --- |
| Phase 24 | Course Space & Knowledge Base Foundation |
| Phase 25 | Retrieval and Evidence |
| Phase 26 | Student Knowledge State |
| Phase 27 | Agent Context & Reasoning |
| Phase 28 | Planning |
| Phase 29 | Safe Actions & Feedback |
| Phase 30 | Integrated Personal Learning Agent |

Phase 24 entry is allowed because the Phase 23.x baseline is stable.

## 14. Phase 24 Boundary

Allowed:

- Course Knowledge,
- documents,
- knowledge nodes,
- relations,
- evidence,
- retrieval foundation,
- minimal course UI.

Not allowed:

- full Agent,
- planner,
- action system,
- autonomous execution,
- student mastery engine,
- full exam intelligence,
- multi-agent system.

## 15. Change Policy

Any architecture change must document:

```text
Current Rule
Problem
Proposed Change
Impact
Backward Compatibility
Migration
Rollback
```

Major changes require an architecture review and version bump.

## 16. Final Principle

```text
Data tells what happened.
Analytics tells what it means quantitatively.
Knowledge tells what is being learned.
Memory tells what matters over time.
Context tells what is relevant now.
Evidence tells why we believe it.
Agent reasons about what should happen next.
Planning turns reasoning into a plan.
Action executes only with appropriate user control.
Feedback teaches the system what worked.
```

Final status:

```text
Architecture Version: v1.1
Status: FROZEN
Next Phase: Phase 24 — Course Space & Knowledge Base Foundation
```
