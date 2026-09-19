# 第20.7阶段发布审计

# 1. 架构

* *通过**

- `CGStore` 仍是唯一业务数据入口；本地持久化集中在 `js/store.js` 的 `chenguangData`。
- `Analytics` 仍是唯一统计事实来源。AI Context、Stats、Workbench、Growth Intelligence 均通过 Analytics API 或传入 snapshot 计算。
- Growth Intelligence 消费 Analytics 与 GoalEngine 派生结果；当调用方未传入数据时才使用 `CGStore.get()` 作为兼容入口。
- Growth Memory 的 confirmed 写入只能通过 `confirmCandidate()` / `rejectCandidate()` 触发，最终经 `CGStore.setUser()`。
- AI Context、AI Coach、AI Provider 均保持只读；页面没有直接修改业务数据或绕过 Store 写入。
- Backend 不保存独立 Memory 表；Memory 属于 `user` 快照，由既有 `/api/data` 同步契约承载。

# 2. 成长智能

* *通过**

- Growth Score 由完成情况 45%、连续性 30%、趋势变化 25% 组成，缺失因子按有效权重归一，结果可解释。
- 7 / 30 / 90 天趋势均来自 Analytics；空数据、异常日期、负值和大量数据已有回归测试覆盖。
- strengths / risks / recommendations 基于快照派生，不会输出绝对化结论、医疗诊断或保证性预测；行动建议保持用户确认后执行。

# 3. 记忆系统

* *通过**

- Memory v2.1 保持 `version`、`patterns`、`milestones`、`preferences`、`insights`、`candidates` 结构，旧数据通过 `normalizeMemory()` 兼容。
- Candidate 类型限制为 Preference、Habit、Pattern、Risk、Achievement、GoalHistory。
- Candidate 状态包含 pending、confirmed、rejected、expired。
- pending 在 UI 与 Prompt 中只能表达“可能趋势”；confirmed 必须来自用户确认；rejected 与 expired 不进入 AI Context。

# 4. 置信度与生命周期

* *通过**

- `calculateConfidence()` 输出 0-1，并保留 `confidenceMeta.evidenceScore`、`recencyWeight`、`confirmationWeight`、`calculatedAt`。
- Evidence 最多 3 条，来源白名单为 Analytics、GrowthIntelligence、Goals；敏感词、Prompt 内容、聊天原文和空 Evidence 会被拒绝。
- 生命周期按最后 Evidence 时间计算：0-29 天 confirmed，30-89 天 aging，90 天以上 expired；历史记录不会被删除。
- 计算只用当前 Memory item 和已有 snapshot，不扫描全部历史行为。

# 5. 人工智能背景

* *通过**

- Context Memory 输出 `confirmed`、`candidates`、`insights`、`relations`。
- `insights` 与 `relations` 是运行时投影，不持久化。
- 当 Context 超预算时，会按 insights、relations、candidates、confirmed 的顺序收缩，再收缩 report 与 memory，最后才影响原始统计。
- Context Version 保持 `1.0` 兼容。

# 6. AI 安全

* *通过**

- 前端 AI 教练只使用已确认的记忆和衍生洞察，不将待定候选项写入事实表达。
- Backend System Prompt 明确：confirmed 是用户确认的长期规律，candidates 是未确认的可能趋势，不得描述为事实或已形成习惯。
- Backend Context 清理剥离 API key、token、密码、secret、authorization 等敏感键；Context 和消息都有长度与结构校验。
- Provider Prompt 分层为 System、Context、Coach、History、User;actions 只允许确定性 navigate。

# 7. 成长闭环

* *通过**

- The complete link has been closed: User behavior → CGStore → Analytics → Growth Intelligence → Candidate → User confirmation → Confirmed Memory → AI Context → Personalized feedback.
- AI 页面展示最多 2 条 pending Candidate，提供确认 / 暂不确认，并局部刷新 Memory projection，不需要刷新页面。
- After confirmation, do not read the Store repeatedly, do not recalculate Analytics, and both the number of writes and revisions have regression tests.
- Stats 提供 Memory 候选管理入口；Workbench 提供成长简报和行动建议入口。

# 8. 体验

* *通过**

- Memory 类型统一映射为学习习惯、成长规律、阶段成果、需要关注、个人偏好、目标记录。
- Evidence is displayed in the user's language, original evidence is not modified.
- Confidence 使用“初步观察 / 有一定记录支持 / 较多记录支持 / 你已确认”，不再暴露百分比。
- Lifecycle 使用“保留中 / 等待新记录更新 / 暂不参与分析”，不出现“记忆失效”等焦虑表达。
- AI、统计、工作台都有空数据和下一步引导。

# 9. 性能

* *通过**

- AI 页面一次读取 Store snapshot，一次构建 Context;Stats 页面一次读取 Analytics snapshot。
- Memory relation 生成限制在当前 context nodes 内，每条最多 3 个 relation，总 relation 上限 8。
- 临时性能探针已在审计后删除：
  - 90 天：增长智能 25 毫秒，人工智能上下文 26 毫秒，记忆投影 <1 毫秒。
  - 365 天：增长智能 62 毫秒，人工智能上下文 74 毫秒，记忆投影 <1 毫秒。
  - 探针包含每日打卡、专注、英语、任务、间歇运动和阅读记录。
- 未发现页面级重复 Analytics 计算或新增缓存层。

# 10. 安全

* *通过**

- Frontend 关键 Growth Memory / Candidate / AI 回复渲染使用 `textContent` 或转义值，避免用户内容拼接 HTML。
- Backend 数据 API 受 JWT 保护，写请求受 CSRF 与限流控制；payload 仅保留白名单顶层字段。
- AI 只能读取 Context，不能直接修改目标、打卡、运动、课程、任务或 Memory；写入必须经过用户确认和 GrowthMemory。
- Provider API key、错误详情、后端配置不会进入用户响应。

# 11. 测试结果

- 前端：**439 / 439 通过**
- 后端：**68 / 68 通过**
- 构建：**通过**
- `git diff --check`：**通过**

# 12. 剩余风险

1. **P1 - 后端 payload 深度校验较薄**：顶层字段有白名单，但 `user.memory` 与业务数组内部结构主要依赖前端规范化。后续可在同步服务增加轻量 schema 验证，避免异常客户端写入脏结构。
2. **P1 - Workbench 存在历史 innerHTML 模板**：已审计路径对用户内容做了转义，但长期应逐步收敛到结构化 DOM 构建，降低未来误用风险。
3. **P2 - Growth Intelligence 多次 Analytics 读取**：当前 365 天探针性能良好，但未来指标数量继续增加时，可评估在 Analytics 内部提供一次性派生接口。
4. **P2 - 乐观并发边界**：同步冲突依赖 revision 计数，极端双端并发仍可能覆盖分支，这是既有协议的已知取舍。

# 13. 最终建议

* *准备好了**

当前实现已满足进入 Phase 21 产品扩展的稳定性条件。上述 P1 风险建议安排在 Phase 21 的独立稳定性任务中处理，不应阻塞产品扩展启动。
