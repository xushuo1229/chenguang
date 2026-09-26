# Phase 37 Personal Agent Experience Architecture

Status: IMPLEMENTED_FROZEN

Baseline: `9987287 docs: freeze personal agent frontend redesign`

## 1. Objective

Phase 37 turns the Personal Agent entry page from an AI-chat-first page into the product's main learning-agent dashboard. Conversation remains available, but it is a secondary capability inside a larger deterministic learning loop.

The core experience now answers:

1. What is my current learning state?
2. What did the Agent find?
3. What should I do today?
4. Why?
5. What can I explicitly confirm now?

## 2. Information Architecture

```text
Personal Agent
  → Agent Status / Greeting
  → Agent Insight
  → Learning State
  → Today's Focus
  → Action Proposal
  → Growth Memory Preview
  → Learning Timeline
  → Learning Action / Assessment Feedback
  → Conversation
  → Supporting growth analysis
```

The existing Agent Home remains the deeper evidence and mastery workspace. The main page becomes the product-level dashboard, while Agent Home is not removed or duplicated.

## 3. Data Architecture

The frontend continues to consume the validated Agent Home service contracts:

```text
Agent Home Service
  → learning-context-v1
  → agent-insight-v1
  → agent-reasoning-v1
  → personal-learning-agent-v2 overview
  → confirmed learning action
  → assessment-result-v1 feedback
```

Phase 37 introduces no new API, data model, storage boundary, provider call, or client-side statistics engine.

## 4. Deterministic Display Sources

| Display block | Source | Authority |
| --- | --- | --- |
| Agent Insight | `agent-insight-v1` + `agent-reasoning-v1` | deterministic insight / approved reasoning |
| Learning State | `context.knowledgeStates` + `context.behavior` | source / deterministic projection |
| Today's Focus | `personal-learning-agent-v2.plan` | deterministic Learning Planner |
| Recommended next step | `perception.nextBestRecommendation` | deterministic agent projection |
| Growth Memory Preview | `context.memories.growth` | confirmed growth memory projection |
| Learning Timeline | `context.knowledgeStates.recentlyReviewed` | student knowledge state projection |

The UI does not generate emotion, infer memories, invent review history, or use LLM output as status. Provider output remains confined to Conversation.

## 5. Component Architecture

`js/personalAgentExperience.js` remains a presentation-only component. Phase 37 adds two bounded display cards:

- `Growth Memory` renders at most three confirmed memory projections.
- `Learning Timeline` renders at most five recently updated knowledge states.

The component still performs no Store writes and no autonomous action. Confirmation remains explicit through `开始`; assessment submission remains explicit through a real form.

## 6. Brand Migration

User-facing shells now use:

```text
个人 Agent
Personal Agent
```

The prohibited user-facing product names are:

```text
AI 教练
AI教练
AI Coach
```

Internal identifiers such as `CoachMemory`, `cg_ai_coach_history`, `coach-layout`, and existing module names are intentionally retained for backward compatibility. They are not presented as product identity.

## 7. Desktop and Mobile Layout

Desktop order:

```text
Workspace navigation
→ Agent dashboard cards
→ Supporting growth analysis
→ Conversation
```

Mobile order:

```text
Agent status
→ Insight
→ Today's Focus
→ Learning State
→ Action Proposal
→ Memory / Timeline
→ Conversation
```

The existing MPA bottom navigation remains the mobile navigation layer. Agent links use the `Agent` label.

## 8. Validation Boundary

Required validation:

- Frontend regression
- Backend regression
- Production build
- Desktop and mobile browser audit
- Console and page errors equal zero
- Explicit action confirm / cancel
- `git diff --check`

Detailed evidence is recorded in `docs/PHASE_37_PERSONAL_AGENT_EXPERIENCE_AUDIT.md`.

## 9. Freeze Statement

Phase 37 is frozen. Future changes must use a new phase contract and must not:

- rewrite CGStore, Analytics, Goals, or Sync;
- add a second Agent data layer;
- let provider output become deterministic state;
- make autonomous writes to user data;
- replace the current MPA architecture.
