# Phase 27.2 Agent Home Productization Architecture

Date: 2026-09-18

Baseline:

```text
45eb7b1 docs: freeze phase 27.1 context boundary
f3c2935 fix: remediate phase 27.1 context boundary
```

Phase status: ARCHITECTURE ONLY

## 1. Objective

Phase 27.2 defines the Agent Home product layer above the frozen LearningContext read layer.

Agent Home is a learning intelligence surface, not a chat page and not an autonomous assistant. It must help the student understand current learning state through bounded insights and evidence.

This phase does not implement code. It defines the contracts and adapters required before implementation.

## 2. Product Position

```text
Course Space
    ↓
Student Knowledge State
    ↓
LearningContext v1
    ↓
Insight Generation Boundary
    ↓
Agent Home Product Layer
    ↓
Student Decision
```

Agent Home may present:

- learning overview;
- course knowledge summary;
- knowledge state summary;
- growth context;
- behavior trend;
- evidence-backed insight.

Agent Home must not present:

- chatbot-style free conversation;
- autonomous planning;
- tutoring dialogue;
- automatic task creation;
- automatic goal mutation;
- hidden data mutation.

## 3. Agent Insight Contract

The product layer consumes and produces a versioned Agent Insight contract.

Recommended contract:

```json
{
  "version": "agent-insight-v1",
  "generatedAt": "2026-09-18T00:00:00.000Z",
  "userId": 1,
  "scope": "agent_home",
  "insights": [
    {
      "id": "insight-id",
      "kind": "trend | knowledge_state | behavior_summary | growth_context",
      "headline": "最近7天数学学习时间下降。",
      "explanation": "根据已有记录，最近7天数学专注时间比前7天减少45分钟。",
      "evidence": [
        {
          "source": "analytics.focus_summary",
          "authority": "deterministic_projection",
          "field": "subject.focusMinutes",
          "value": 45,
          "comparison": "previous_7_days"
        }
      ],
      "confidence": 0.82,
      "recommended_actions": [
        {
          "type": "review",
          "label": "查看学习趋势"
        }
      ]
    }
  ],
  "metadata": {
    "readOnly": true,
    "actionLevel": "insight_only",
    "contextVersion": "learning-context-v1"
  }
}
```

Required rules:

1. Every insight must have at least one evidence item.
2. Every evidence item must carry source and authority.
3. Confidence must be finite and bounded between 0 and 1.
4. If evidence is unavailable, the insight must not be shown as a factual claim.
5. `recommended_actions` may only suggest review or navigation.
6. The contract must never contain a direct mutation command.

## 4. Insight Generation Boundary

Insight generation is separated from UI, data access and mutation.

```text
LearningContext v1
        ↓
Insight Rules
        ↓
Evidence Builder
        ↓
Insight Renderer
```

Allowed:

1. deterministic rules over LearningContext;
2. aggregate comparison;
3. threshold detection;
4. evidence-backed explanation;
5. optional future LLM narration over a validated Agent Insight object.

Forbidden:

1. direct database access from UI;
2. direct CGStore mutation;
3. unsourced performance judgment;
4. behavior summary interpreted as Reflection;
5. GrowthMemory treated as Source of Truth;
6. CoachMemory treated as factual memory;
7. Planner or Tutor behavior.

## 5. Analytics Adapter

The Analytics Adapter is the only future path from learning behavior to Agent Insight.

Responsibilities:

1. read bounded analytics summaries;
2. expose deterministic trend and comparison data;
3. preserve Analytics as the statistical Source of Truth;
4. prevent Agent Home from scanning raw todos, checkins, focus or course records.

Recommended output:

```json
{
  "source": "analytics",
  "authority": "deterministic_projection",
  "type": "learning_behavior_summary",
  "value": {
    "today": {},
    "last7Days": {},
    "previous7Days": {},
    "trend": []
  }
}
```

Constraints:

1. bounded date windows only;
2. bounded result counts;
3. user-isolated reads;
4. no raw record dump;
5. no duplicate statistics engine.

## 6. Reflection Adapter

Reflection Adapter is required before Agent Home can show user Reflection.

Responsibilities:

1. read user-authored Reflection records only;
2. preserve Reflection as user-owned feedback;
3. expose bounded recent reflections and summaries;
4. clearly distinguish Reflection from Behavior Summary.

Recommended output:

```json
{
  "source": "reflection_storage",
  "authority": "user_feedback",
  "type": "reflection_summary",
  "value": {
    "available": false,
    "reason": "reflection_storage_adapter_not_available"
  }
}
```

Rules:

1. No Behavior Summary may enter this adapter.
2. No AI-generated text may be stored as user Reflection.
3. Reflection cannot determine mastery by itself.
4. Reflection Adapter remains unavailable until Reflection Storage is separately implemented.

## 7. Memory Adapter

Memory Adapter is a read-only boundary over GrowthMemory and CoachMemory.

### GrowthMemory

```json
{
  "source": "cgstore.user.memory",
  "authority": "derived_memory",
  "type": "growth_memory_projection",
  "value": {
    "available": false,
    "items": []
  }
}
```

Rules:

1. GrowthMemory provides context, not facts.
2. It cannot override Analytics, Course Space, Knowledge State or Reflection.
3. It must remain bounded and user-isolated.
4. Agent Home cannot create, update or delete GrowthMemory.

### CoachMemory

```json
{
  "source": "coach_memory",
  "authority": "interaction_context",
  "type": "coach_memory_projection",
  "value": {
    "available": false,
    "reason": "client_side_memory_not_available_to_backend"
  }
}
```

Rules:

1. CoachMemory is interaction context only.
2. It cannot become a fact database.
3. It cannot override Reflection or Behavior Summary.
4. A future backend adapter must be separately designed and bounded.

## 8. Knowledge State Adapter

Knowledge State Adapter reads Student Knowledge State without recalculating mastery.

Responsibilities:

1. expose weak topics, strong topics and recent review states;
2. preserve mastery, confidence, state and evidence count;
3. prevent AI from changing mastery;
4. prevent Agent Home from writing evidence.

Recommended output:

```json
{
  "source": "student_knowledge_states",
  "authority": "source",
  "type": "student_knowledge_state_projection",
  "value": {
    "weakTopics": [],
    "strongTopics": [],
    "recentlyReviewed": []
  }
}
```

Rules:

1. Knowledge State is the only source for mastery display.
2. Evidence count may be displayed, but raw evidence quotes are not required.
3. AI narration must not invent mastery.
4. Agent Home cannot update mastery.

## 9. User Trust Boundary

Agent Home must make data authority visible.

Required trust labels:

| Label | Meaning |
| --- | --- |
| `Source Data` | read from Course Space, Knowledge State or authenticated user data |
| `Deterministic Projection` | calculated from Source Data by fixed rules |
| `User Reflection` | user-authored feedback |
| `Derived Memory` | long-term context that cannot override facts |
| `Interaction Context` | AI coaching context that cannot override facts |
| `Unavailable` | no backend Source of Truth is connected |

Rules:

1. The user must be able to see why an insight is shown.
2. The user must not be shown unsourced AI judgment as fact.
3. The user remains the final decision maker.
4. Agent Home must not imply permission to modify data.

## 10. Action Permission Model

Agent Home remains Action Level 0.

| Level | Name | Phase 27.2 Status |
| --- | --- | --- |
| 0 | Insight Only | Allowed |
| 1 | Suggestion | Display-only suggestions may be designed, but not executed |
| 2 | User Confirmed Action | Not allowed |
| 3 | Autonomous Action | Forbidden |

Allowed action types:

```text
review
navigate
```

Forbidden action types:

```text
create_todo
update_todo
delete_todo
update_goal
update_mastery
write_memory
send_ai_command
autonomous_workflow
```

## 11. Implementation Roadmap

### 27.2.1 Insight Contract Foundation

- Additive `agent-insight-v1` contract.
- Deterministic Insight rules.
- Evidence and confidence validation.
- No UI.

### 27.2.2 Bounded Product Adapters

- Analytics Adapter.
- Knowledge State Adapter.
- Memory Adapter boundary.
- Reflection remains unavailable.

### 27.2.3 Agent Home UI Foundation

- Read-only Agent Home layout.
- Learning overview.
- Insight cards.
- Trust labels.
- Empty and error states.

### 27.2.4 Testing and Freeze

- Backend contract tests.
- Frontend render and boundary tests.
- Full regression.
- Browser smoke at 1920x1080 and 375x812.
- Independent re-audit.

## 12. Non-Goals

Phase 27.2 does not implement:

- Planner;
- Tutor;
- Agent chat;
- RAG;
- vector database;
- multi-agent workflow;
- autonomous action;
- background scheduler;
- automatic goal adjustment;
- automatic knowledge state mutation.

## 13. Entry Criteria For Implementation

Implementation may start only after:

1. this architecture is accepted;
2. Phase 27.1 remains frozen;
3. no frozen boundary is violated;
4. Insight contract has explicit evidence and authority rules;
5. all adapters are defined as read-only and bounded.

## 14. Final Recommendation

Proceed with Phase 27.2.1 as an additive Insight Contract Foundation.

The first implementation must not build UI. It must establish the deterministic Insight contract, evidence validation and read-only Agent Home service boundary.

```text
PHASE 27.2: ARCHITECTURE COMPLETE
NEXT: PHASE 27.2.1 INSIGHT CONTRACT FOUNDATION
```
