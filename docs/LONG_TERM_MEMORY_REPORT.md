# Phase 19.4 Long Term Memory Report

## 1. Implementation Summary

知行已完成 Growth Memory 成长记忆系统。新增 `js/growthMemory.js` 作为长期记忆派生与生命周期层，从 Growth Intelligence、AI Coach 和已有 Coach Memory 摘要中生成习惯模式、里程碑、偏好与长期洞察。记忆通过 `CGStore.setUser({ memory })` 显式持久化，AI Context 注入有界 `memory` 字段，Stats 页提供透明的“我的成长轨迹”入口。

## 2. Growth Memory Architecture

```text
Analytics
→ GoalEngine
→ Growth Intelligence
→ AI Coach
→ Growth Report
→ AI Context
→ GrowthMemory.buildMemory()
→ GrowthMemory.updateMemory(Store, context)
→ CGStore.setUser({ memory })
→ 后续 AIContext
→ AI Coach / Stats
```

### 生命周期

- **生成**：只使用 Context 中已有分析结果，不扫描原始聊天或全量历史。
- **读取**：AI Context 读取 `snapshot.user.memory` 并与本次派生结果合并。
- **更新**：同一 `id` 只更新 statement、evidence、`lastSeenAt`、`occurrences` 和 `weight`。
- **淘汰**：未再出现的记忆每次合并降权 10；`weight < 20` 标记为 `inactive`。
- **上限**：patterns 12、milestones 8、preferences 6、insights 8；Context 中进一步限制为 4/3/3/4。

## 3. Memory Model

持久化结构：

```js
{
  version: "1.0",
  updatedAt: "",
  patterns: [],
  milestones: [],
  preferences: [],
  insights: []
}
```

每条记忆：

```js
{
  id: "",
  kind: "habit_pattern | growth_milestone | preference | growth_insight",
  statement: "",
  evidence: {},
  confidence: "low | medium | high",
  weight: 0,
  status: "active | inactive",
  createdAt: "",
  lastSeenAt: "",
  occurrences: 1
}
```

- **patterns**：长期习惯或长期挑战。
- **milestones**：连续成长、长期投入和目标完成。
- **preferences**：来自 Coach Memory 的策略反馈或具体小行动模式。
- **insights**：长期成长评分和趋势洞察。

## 4. AI Integration

AI Context 新增：

```js
memory: {
  patterns: [],
  milestones: [],
  preferences: [],
  insights: []
}
```

AI Coach 会读取 Memory：

- 长期成长模式进入 `insights`。
- 标识为 declining 的长期挑战进入 `warnings`。
- 无匹配记忆时不会编造内容。

`contextVersion` 保持 `1.0`；`growth`、`growthState`、`coach`、`report` 全部保留。

## 5. Changed Files

| 文件 | 修改原因 |
| --- | --- |
| `js/growthMemory.js` | 新增 Memory 模型、生成、合并、降权、淘汰、Context 压缩和 Store 持久化。 |
| `js/aiContext.js` | 合并已有 `user.memory` 与本次派生结果，注入有界 `memory`；超预算时先收缩派生层。 |
| `js/aiCoach.js` | 消费长期 Memory，生成长期亮点与挑战。 |
| `stats.html` | 新增“我的成长轨迹”透明展示入口和显式更新按钮。 |
| `pages/stats.js` | 渲染 Memory，并在用户点击时通过 `CGStore.setUser` 持久化。 |
| `tests/growthMemory.test.js` | 覆盖生成、空数据、长期趋势、短期波动、里程碑、更新、淘汰、隐私与 Store 持久化。 |
| `tests/aiContext.test.js` | 覆盖 Context memory 字段、旧字段兼容和只读。 |
| `tests/aiCoach.test.js` | 覆盖 AI 读取 Memory 与输入不可变。 |
| `tests/stats.test.js` | 覆盖成长轨迹展示、显式更新、revision 与幂等。 |
| `docs/superpowers/plans/2026-09-14-phase-19-4-growth-memory.md` | 保存实施计划。 |

## 6. Privacy & Security Review

PASS。

- 不保存全量聊天记录、临时状态或聊天原文。
- 不保存 token、密钥、邮箱、身份敏感字段或私密内容。
- Evidence 只保留白名单字段，字符串最长 120 字符；statement 最长 220 字符。
- Stats 页所有 Memory 内容使用 `textContent` 渲染。
- Memory 写入只发生在 Stats 显式按钮路径。
- AI Context 构建过程不改 Store、不递增 revision。
- AI Coach 不调用任何写入、更新或删除接口。

## 7. Performance Review

PASS。

- Memory 基于单次 AI Context 派生，不重新扫描全量历史。
- Context 只注入 active、高权重、有限数量的 Memory。
- 超预算时优先收缩 `memory` 和 `report`，保护 Analytics / GoalEngine 原始事实。
- Stats 页继续一次 snapshot 初始化；显式更新后相同日期幂等，不重复递增 revision。

## 8. Tests

| 验证 | 结果 |
| --- | --- |
| Frontend `npm test` | PASS：404/404 |
| Backend `cd backend && npm test` | PASS：68/68 |
| Production `npm run build` | PASS |
| `git diff --check` | PASS |

新增测试覆盖：

1. 正常生成 Memory。
2. 空数据。
3. 长期趋势。
4. 短期波动不生成。
5. 里程碑生成。
6. 相同记忆更新。
7. 降权与淘汰。
8. Context 兼容。
9. AI 读取 Memory。
10. AI 不修改输入。
11. 敏感字段剥离。
12. Store 持久化与同日幂等。
13. Stats 透明展示与显式更新。

## 9. Final Recommendation

Phase 19 AI Foundation 已完成。Growth Intelligence、AI Coach、Personal Growth Report 和 Growth Memory 已经形成完整的长期成长理解链路。后续建议进入产品化打磨：提高记忆解释性、支持用户手动移除某条记忆，并在真实使用中评估阈值与淘汰节奏。
