# Phase 27.3 Agent Home UI Foundation

Date: 2026-09-18

Baseline:

```text
069e45a docs: freeze phase 27.2.2 product adapters
6a925b7 feat: add bounded product adapters
```

Status: READY_FOR_COMMIT

## 1. Objective

Agent Home is a read-only Multi Page Application surface for the Personal Learning Agent.

It presents a structured understanding of the student's learning state. It is not a chatbot, Planner, Tutor or autonomous agent.

## 2. UI Architecture

```text
agent-home.html
    ↓
js/agentHome.js
    ↓
js/agentHomeService.js
    ↓
js/agentHomeView.js
    ↓
Read-only Agent Home sections
```

The implementation follows the existing vanilla JavaScript module pattern and MPA architecture. No React, Vue, Tailwind or large framework was introduced.

New files:

| File | Responsibility |
| --- | --- |
| `agent-home.html` | Agent Home MPA entry |
| `js/agentHome.js` | Page bootstrap |
| `js/agentHomeService.js` | Agent API service and contract validation |
| `js/agentHomeView.js` | Read-only rendering and authority labels |
| `tests/agentHomeUI.test.js` | Frontend boundary and rendering tests |

Modified:

| File | Change |
| --- | --- |
| `js/apiClient.js` | Add shared Agent Home GET API methods |
| `vite.config.js` | Register `agent-home.html` as an MPA build entry |

## 3. Data Flow

```text
Agent Home UI
    ↓
js/agentHomeService.js
    ↓
GET /api/agent-home/context
GET /api/agent-home/insights
    ↓
Agent Home Service
    ↓
Product Adapter Layer
    ↓
Course Space / Student Knowledge State / Activity / Memory
```

The UI consumes only:

```text
GET /api/agent-home/context
GET /api/agent-home/insights
```

It does not import or access CGStore, Analytics, Sync, Course Space API or Knowledge State API.

## 4. UI Sections

| Section | Source |
| --- | --- |
| Learning Overview | Behavior Adapter |
| Course Intelligence | Course Knowledge Adapter |
| Knowledge State | Student Knowledge Adapter |
| Growth Context | GrowthMemory Adapter |
| AI Insights | Agent Insight Contract |

The UI shows:

1. today's task, focus, study and exercise summaries;
2. Course Knowledge nodes and evidence summary;
3. strong topics, weak topics and recently reviewed topics;
4. GrowthMemory projection with explicit derived-memory label;
5. insight headline, explanation and evidence.

## 5. Read-Only Boundary

The UI has:

```text
no task edit controls
no knowledge edit controls
no goal edit controls
no insight action buttons
no AI chat input
no planner or autonomous action
```

The service rejects malformed or writable contracts:

```text
learning-context-v1 must have readOnly=true
agent-insight-v1 metadata must have readOnly=true
```

The page also displays a global trust note:

```text
只读 · 数据可溯源 · 不自动修改
```

## 6. Trust UI

Every section shows its source authority:

| Data | User-facing label |
| --- | --- |
| Behavior Summary | 来自学习行为记录 |
| Course Knowledge | 来自课程知识库 |
| Knowledge State | 来自学习状态记录 |
| GrowthMemory | 来自成长记忆（派生记忆） |
| Insights | 结构化学习观察 |

GrowthMemory is explicitly marked as derived memory and is not presented as fact.

## 7. States

Implemented states:

1. loading;
2. success;
3. empty;
4. friendly API error.

API errors do not expose provider details, stack traces or internal messages.

## 8. Responsive Behavior

The page is responsive:

```text
Desktop 1920x1080: two-column card grid
Mobile 375x812: single-column card grid
```

The layout avoids page-level slide animation and follows the existing Calm Dawn visual system.

## 9. Future Extension

Future phases may add:

1. deterministic insight rules;
2. richer trend charts backed by Analytics adapters;
3. Reflection display after Reflection Storage exists;
4. evidence drill-down with bounded APIs;
5. user-controlled feedback.

Future phases must not add Planner, Tutor, chat or autonomous action.

## 10. Final Status

### Validation Results

```yaml
Frontend: 597/597 PASS
Backend: 113/113 PASS
Build: PASS
git diff --check: PASS
Browser Desktop 1920x1080: PASS
Browser Mobile 375x812: PASS
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Action controls in Agent Home root: 0
Rendered sections: 5/5
```

```text
PHASE 27.3: READY_FOR_COMMIT
```
