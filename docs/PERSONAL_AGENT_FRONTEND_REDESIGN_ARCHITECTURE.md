# Personal Agent Frontend Redesign Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: `81aebeb docs: freeze ai coach ui audit`

## 1. Current UX Audit

The current `ai.html` is a strong growth-analysis and conversation page, but its first-frame identity is still “AI Coach”. Agent Home, Learning Conversation, Assessment, Mastery, Review, Planner and Action Proposal are technically connected through the backend, but the front-end experience separates them into a second page.

Reusable assets:

- `pages/ai.js`: read-only growth context, deterministic insights, memory, weekly review and conversation.
- `js/agentHomeService.js`: validated Agent Home context / insights / reasoning and Learning Agent overview / action / assessment calls.
- `agent-home.html`: dedicated Learning Agent workspace.
- Existing shell CSS, Calm Dawn tokens, card system, mobile tabbar and MPA first-frame bootstrap.

Gaps:

- The entry page does not expose the Agent loop as a product.
- Learning State, Today’s Focus and Action Proposal are not visible on the primary page.
- Naming still says AI Coach.
- Empty and loading states do not explain the Personal Agent workspace.

## 2. Product Positioning

The core product name is:

```text
个人 Agent
```

Supporting English labels may use `Personal Agent` or `Personal Learning Agent`. “AI Coach”, “AI 教练” and “Coach” must not be used as the core product name.

The page answers five questions immediately:

1. What is my learning state?
2. What did the Agent find?
3. What should I do today?
4. Why?
5. What can I do with the Agent now?

## 3. Information Architecture

```text
Personal Agent
  → Agent Status
  → Agent Insight
  → Learning State
  → Today’s Focus
  → Action Proposal
  → Practice / Assessment feedback
  → Conversation
  → Supporting Growth Insight
```

Conversation remains a capability, not the product identity.

## 4. Component Architecture

Add a presentation-only component:

```text
js/personalAgentExperience.js
```

Responsibilities:

- Render Personal Agent status, insight, state, focus, proposal and feedback.
- Consume validated Agent Home service contracts.
- Provide explicit confirm / cancel for learning actions.

Non-responsibilities:

- No Store writes.
- No new backend model.
- No second Analytics engine.
- No direct provider access.
- No autonomous action.

## 5. Data Flow

```text
Agent Home Service
  → context / insights / reasoning
  → selected course
  → Learning Agent overview
  → Personal Agent Experience
  → user confirmation
  → Learning Agent action
  → assessment feedback
```

The component uses:

- `client.agentHome.context()`
- `client.agentHome.insights()`
- `client.agentHome.reasoning()`
- `client.learningAgent.overview(courseId)`
- `client.learningAgent.confirmNextAction(courseId)`
- `client.learningAgent.submitAssessment(payload)`

No backend endpoint changes are required.

## 6. Desktop Layout

Desktop places the Agent Experience above the existing growth panels:

```text
Agent Status
Agent Insight
Learning State | Today’s Focus
Action Proposal | Practice Feedback
Conversation
Supporting growth insight
```

Validated widths: 1920×1080, 1440×900, 1280×720.

## 7. Mobile Layout

Mobile order:

```text
Status
→ Insight
→ Today’s Focus
→ Learning State
→ Action Proposal
→ Practice Feedback
→ Conversation
```

Validated widths: 375×812 and 390×844. Horizontal overflow must remain zero.

## 8. Interaction Model

- Recommendations are read-only until the user explicitly confirms.
- `开始学习` is the only action trigger.
- `取消` clears pending action output and states that no modification occurred.
- Assessment submission remains explicit.
- Failure states are friendly and do not expose provider, stack or internal details.

## 9. Agent State Model

```text
loading
→ ready
   → no_course
   → no_plan
   → proposal_available
   → action_ready
   → assessment_ready
   → feedback_ready
→ unavailable
```

Every state has visible copy and a bounded next step.

## 10. Design System

Reuse existing variables, radii, cards, shadows, buttons and typography. Add only component-level styles to `ai.html`. No new framework, reset or global theme rewrite.

## 11. Accessibility

- Hero and state changes use a `role="status"` region.
- Inputs and buttons keep explicit labels.
- Actions are real buttons with visible text.
- No color-only state distinction.
- Keyboard order follows visual order.

## 12. Migration Strategy

1. Keep `ai.html` as the MPA entry.
2. Preserve existing IDs used by the current tests and data flow.
3. Mount the Personal Agent Experience above legacy analysis panels.
4. Re-label core product copy.
5. Do not rewrite `pages/ai.js` in this phase.

## 13. Backward Compatibility

- Existing conversation, insight, memory and weekly-review logic remains active.
- Existing API contracts remain unchanged.
- Existing routes remain unchanged.
- Agent Home remains available as a deeper workspace.
- `today.html`, Store, Analytics, Goals, Sync, GrowthContext and AIContext remain protected.

## 14. Test Strategy

- Component tests: loading, ready, empty, error, confirm, cancel, assessment and feedback.
- Page regression: existing AI Coach tests continue to pass after copy updates.
- Full frontend/backend regression.
- Build.
- Browser smoke at desktop and mobile sizes.
- Visual screenshots for first viewport, insight, state, focus, proposal and conversation.
