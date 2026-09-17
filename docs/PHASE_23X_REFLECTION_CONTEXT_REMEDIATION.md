# Phase 23.x Reflection Context Remediation

## 1. Scope

This remediation closes the Reflection context ownership gap identified in the current project audit.

The change is additive and localized to the Reflection request path. It does not change CGStore, Analytics, Goals, Sync, AIContext, GrowthContext, Today Plan, or the Reflection API response contract.

## 2. Before

The Reflection endpoint trusted client-submitted behavior facts:

```text
Client context
    ↓
POST /api/ai/reflection
    ↓
AI prompt
```

This allowed a malicious or stale client payload to claim facts such as completed tasks or study time.

## 3. After

The backend now derives Reflection facts from the authenticated user's synchronized user data:

```text
req.userId
    ↓
user_data
    ↓
reflectionContextSource
    ↓
reflectionContext sanitizer
    ↓
Prompt Builder
    ↓
AI Service
```

Client-supplied `context.userNote` remains available as user-provided narrative input. It is not treated as system fact. Client behavior statistics, version fields, instruction fields, and metadata are ignored.

The response now records:

```text
meta.contextSource = authenticated-authoritative
```

## 4. Derived Facts

`backend/src/services/reflectionContextSource.js` derives only bounded facts from `user_data`:

| Fact | Source collection | Boundary |
| --- | --- | --- |
| Today's task total / completed / pending / completion rate | `todos[date = today]` | Today only |
| Yesterday pending tasks | `todos[date = yesterday]` | Count only |
| Focus minutes | `focus[date = today]` | Sum of positive minutes |
| English minutes | `english[date = today]` | Sum of positive minutes |
| Exercise minutes | `sports[date = today]` | Sum of positive duration |
| Check-in streaks | `checkins` | Bounded date calculation |
| Active goals | `goals` | Count only |

The source does not infer unstated behavior. If no matching record exists, the fact is zero or empty.

## 5. Security Controls

- Authentication remains required.
- `req.userId` is the only ownership source.
- Client behavior facts are not trusted.
- Context enters the prompt as data, not system instruction.
- Context is allowlisted and size-bounded by the existing Reflection sanitizer.
- AI output remains bounded and safe to parse.

## 6. Test Evidence

Updated and added tests cover:

- Malicious client task totals are ignored.
- The route reports authoritative context ownership.
- Task, focus, study, exercise, streak, and goal facts are derived server-side.
- Empty or unknown records produce zero facts rather than inferred behavior.

## 7. Boundary Statement

Reflection facts are server-derived from CGStore-backed user data. User notes are explicitly user input. AI output is explicitly AI-generated. These three categories remain separated in the Reflection prompt.
