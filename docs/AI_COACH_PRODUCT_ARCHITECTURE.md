# AI Coach Product Architecture

Status: IMPLEMENTED_CONTRACT

Baseline: `fb1c8f6 docs: freeze phase 36 product release`

## 1. Product Definition

AI Coach is the user-facing growth layer:

```text
User behavior + goals
  → deterministic analytics
  → growth insight
  → conversation explanation
  → user decision
```

Agent Home is the learning execution layer:

```text
Course knowledge / evidence
  → learning conversation
  → assessment / mastery
  → adaptive review
  → confirmed action
```

AI Coach should connect to Agent Home without merging the two engines.

## 2. Information Architecture

The Coach exposes six stable modules:

| Module | Owner | Role |
| --- | --- | --- |
| Agent Home | `agent-home.html` | Entry to learning state, evidence and conversation |
| Conversation | `ai.html#coachConversation` | Explain current data and answer questions |
| Insight | `ai.html#aiInsightPanels` | Show findings, risks, trends and advice |
| Today | `ai.html#cardToday` | Show today’s completion, focus and activity |
| Mastery | `agent-home.html` | Show knowledge state and review needs |
| Action | `agent-home.html` | Show user-confirmed next action |

The navigation is persistent and available in loading, empty, error and dashboard states.

## 3. Visual Direction

- Keep Calm Dawn: restrained spacing, card hierarchy, amber/primary accent and no decorative animation.
- Use a single workspace card above the state blocks.
- Use small module cards with a title and one-line purpose.
- Use native links and existing design tokens.
- Avoid full-page transitions and body-level animation.

## 4. Desktop Layout

- Workspace navigation spans the content width.
- The six modules collapse into a responsive grid.
- Existing two-column Coach layout remains unchanged.

## 5. Mobile Layout

- Navigation remains above loading, empty, error and dashboard states.
- Cards adapt to the narrow viewport without horizontal scrolling.
- Existing mobile tabbar and sidebar drawer remain unchanged.

## 6. Boundaries

- No React, Vue, Tailwind or SPA rewrite.
- No second store.
- No automatic action.
- No LLM authority upgrade.
- No rewrite of AIContext, GrowthContext, CGStore or Analytics.
