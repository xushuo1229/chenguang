# AI Coach Product Experience Audit

Status: PASS_WITH_IMPROVEMENT_REQUIRED

Baseline: `fb1c8f6 docs: freeze phase 36 product release`

## Scope

- `ai.html`
- `pages/ai.js`
- `agent-home.html`
- `js/agentHomeView.js`
- Desktop and mobile product experience

## Current Strengths

1. AI Coach already provides a clear read-only data analysis panel, structured insights, risks, trends, advice and conversation.
2. Conversation output is user-safe: assistant text is rendered with `textContent`, navigation actions use an allowlist, and provider errors are converted to friendly copy.
3. Memory activation has explicit user confirmation instead of automatically promoting observations.
4. Agent Home already exposes Learning Conversation, Learning Overview, Course Intelligence, Knowledge State, Growth Context, AI Insights and Reasoning Explanation.
5. The shell is a native MPA with shared navigation and no SPA/framework rewrite.

## Experience Gaps

1. AI Coach and Agent Home are two separate products, but the user has no persistent bridge between them.
2. `ai.html` has strong analysis and conversation, while Mastery and Action are only discoverable after the user knows `agent-home.html` exists.
3. The six required Coach modules—Agent Home, Conversation, Insight, Today, Mastery and Action—lack a single information architecture.
4. In the empty state, the user sees “not enough data” but not the full Coach workspace map.

## Journey Result

| Journey | Status |
| --- | --- |
| Understand current state | PASS |
| Ask the Coach | PASS |
| View structured insight | PASS |
| Reach Today | PARTIAL |
| Reach Mastery / Action | FAIL before remediation |

## Remediation Direction

Add a persistent AI Coach Workspace navigation to `ai.html` so the user can always see the six modules. Keep existing architecture: AI Coach remains the growth Coach, Agent Home remains the Learning Agent workspace, and no second data system is introduced.

## Final Audit Conclusion

The existing AI Coach is product-ready at the data and conversation level but requires a unified IA layer before release-level product validation.
