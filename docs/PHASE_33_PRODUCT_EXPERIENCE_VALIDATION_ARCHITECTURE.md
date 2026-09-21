# Phase 33 Product Experience Validation Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: `7853d00 docs: freeze personal learning agent 2.0 audit`

## 1. Goal

验证 Personal Learning Agent 2.0 的真实用户体验，不新增核心 Agent 能力。

验证链：

```text
Agent Home
  → Learning Conversation
  → Practice / Assessment
  → Mastery
  → Adaptive Review
  → Planner
  → Action Proposal
  → User Confirmation
  → Action
  → Feedback
```

## 2. Information Architecture

Agent Home 必须让用户回答五个问题：

1. 我现在学什么？
2. 我掌握得怎么样？
3. 哪里薄弱？
4. 今天应该做什么？
5. 为什么？

使用 progressive disclosure；不删除底层能力。

## 3. Interaction Rules

1. Loading 必须有角色为 `status` 的文本。
2. Empty state 必须非错误且可行动。
3. Error state 必须友好，不暴露 provider / stack / secret。
4. Action 默认不执行。
5. Action 必须有显式 Confirm。
6. Agent 卡片必须提供 Cancel / reset，避免误导用户已执行。
7. Assessment textarea 必须有可访问 label。

## 4. Journey Contract

| Step | UI Evidence |
| --- | --- |
| 当前学习状态 | Learning Overview / Knowledge State |
| 提出问题 | Learning Conversation |
| 回答与证据 | Explanation + Evidence refs |
| 开始练习 | Learning Agent 2.0 action |
| 提交评估 | Assessment form |
| 掌握反馈 | mastery state |
| 复习建议 | Adaptive Review recommendation |
| 今日计划 | Plan blocks |
| 确认行动 | Confirm button |
| 取消 | Cancel / reset |
| 反馈 | Assessment score + mastery |

## 5. States

Empty：

- no course：显示“添加课程后可用”。
- no knowledge：显示“课程知识为空”。
- no review / plan：显示“暂无推荐”。
- no action：不执行任何写操作。

Error：

- API failure：只显示暂不可用。
- Provider failure：Learning Conversation fallback。
- Unauthorized：路由层返回 401，前端显示通用错误。

## 6. Responsive & Accessibility

验证宽度：

- 1920×1080
- 1440×900
- 1280×720
- 390×844

规则：

1. 保持现有 MPA shell，无路由动画。
2. 卡片单列于 mobile。
3. button 使用语义 button。
4. textarea 有 label / aria-label。
5. status 使用 `role="status"`。
6. focus 由浏览器默认 outline 保留。

## 7. Non-goals

1. 不重写 Agent Home。
2. 不引入 UI framework。
3. 不增加 AI 能力。
4. 不修改 CGStore / Analytics / Goals / Sync / Today Plan。
5. 不自动执行 action。

## 8. Validation

Frontend smoke 覆盖 product journey、empty/error、responsive tokens、accessibility basics。Browser validation 以现有 Vite build + JS DOM 交互测试作为可重复验证。
