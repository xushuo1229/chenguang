# 当前项目状态审计

# 1. 执行摘要

已确定的产品基线远比“聊天应用”强大：它有统一的本地数据层、版本化同步、作为规范计算层的分析、目标、增长智能、记忆、每日反思和反思反馈。23.2.3阶段已经确定并通过测试和构建验证。

然而，当前的工作树不是一个干净的冻结状态。它包含大量未命名的进行中增长/保留/习惯/记忆工作：31 个已修改文件，46 个未跟踪路径，以及 17 个文件的有效非空白差异，共 1,138 次插入和 103 次删除。前端测试目前失败，因为未跟踪的 `tests/workbenchDailyFeedback.test.js` 中的 2 个断言与当前工作台行为不匹配。

要进入完整的个人学习代理开发，该项目**还不准备好**。主要缺失的层包括课程知识模型、检索/证据基础设施、服务器拥有的学习状态、规划以及安全操作层。当前系统最适合被归类为早期的三级个人人工智能教练，而不是四级学习代理。

# 2. 当前 Git 状态

- 分支: `codex/growth-intelligence`
- HEAD: `e74fdc2 feat: add ai reflection feedback loop`
- 最近提交的序列:
  - `e74fdc2` — 反思反馈循环
  - `d1d9cc4` — 反思前端集成
  - `50b80ec` — 反思强化
  - `227665a` — 反思后端能力
  - `9c49ec8` — AI GrowthContext 层
  - `863e163` — 今日计划工作区
  - `8306a35` — MPA 首帧稳定
- 工作树:
  - 31 个已修改的路径。
  - 46 个未跟踪的路径。
  - 两个临时媒体目录: `tmp-video-frames/` 和 `tmp-video-seq/`。
- 忽略 CRLF 后，有效跟踪的差异为 17 个文件，1,138 个插入，103 个删除。
- 冻结文件差异 (`js/growthContext.js`、`pages/today.js`、`today.html`) 仅为行结束符变化；未发现语义上的冻结文件更改。

结论：已提交的基线是一致的，但工作树表示一个未完成的阶段，必须在开始另一个开发阶段之前将其稳定下来。

# 3. 阶段时间线

| 阶段 | 目标 | 主要提交 / 证据 | 关键文件 | 测试 | 状态 |
| --- | --- | --- | --- | --- | --- |
|8 |版本化的本地/远程数据一致性 |`1ffccb5` |`js/store.js`， `js/sync.js`， `backend/src/services/syncService.js` |存储/同步/恢复测试 |完成 |
| 9 | 课程系统 2.0 | `35afd14` | `js/courseSchedule.js`, `pages/workbench.js`, `js/scheduleTextParser.js` | 课程表/解析器测试 | 课程表进度已完成；学习知识部分完成 |
| 10 | 统一分析 | `ce138f5` | `js/analytics.js` | `tests/analytics.test.js` | 完成 |
|11 |统计中心 |[[代码0]] |[[代码1]]，[[代码2]] |[[代码3]] |完成 |
|12 |目标系统 |[[代码0]] |[[代码1]]，[[代码2]] |[[代码3]] |完成 |
|13 |AI教练 / AI上下文 |`9a21b3d`，后期为`7d0ca5d` |`js/aiContext.js`，后端AI服务 |AI上下文/后端测试 |作为上下文感知助理/教练基金会 |
| 14–18 | 目标循环，移动/用户体验加固，发布审计 | 相关提交/文档通过 `a34b8a8` | 界面、导航、架构测试 | 现有回归测试 | 完成 / 历史记录 |
| 19–20 | 成长智力、报告、长期记忆 | `30d7e51`、`24a67a0`、`232ad82` | `js/growthIntelligence.js`、`js/growthReport.js`、`js/growthMemory.js` | 成长/报告/记忆测试 | 在承诺的基线中完成 |
| 20.7–21 | 保留、信号、时间表 | 未跟踪的文档/模块 | `js/growthSignals.js`，`js/growthTimeline.js`，`js/retentionContext.js` | 未跟踪的测试 | 进行中 |
| 22 | 习惯形成与冻结 | 未跟踪的文档/模块 | `js/habitFormation.js` | 未跟踪 `tests/habitFormation.test.js` | 进行中；在 Git 级别文档化 ≠ 验证
| 23 / 23.1 | 增长背景 今日计划 | `9c49ec8`, `863e163` | `js/growthContext.js`, `today.html`, `pages/today.js` | 今日/增长背景 测试 | 完成 |
| 23.2 | 每日反思 后端/前端 | `227665a`, `50b80ec`, `d1d9cc4` | 反思服务/UI/API | 反思/安全/UI 测试 | 已完成 |
| 23.2.3 | 反思反馈循环 | `e74fdc2` | 反思反馈 API/UI | 5 个后端反馈测试，6 个前端测试 | 完成 |
|当前未命名工作 |每日反馈、内存候选、习惯/保留集成 |未提交 |`pages/workbench.js`、`pages/stats.js`、`pages/ai.js`、未跟踪增长模块 |578/580前端处理 |进行中 |

# 4. 第8阶段审计

Phase 8 同步合同仍然在结构上是稳固的。

- `CGStore` 使用单个业务键 `chenguangData` 以及 `_meta.revision`、`updatedAt`、`deviceId` 和墓碑 (`js/store.js:43`、`js/store.js:180`、`js/store.js:196`)。
- 本地写入恰好更新一次修订；远程应用不更新，并标记为远程 (`js/store.js:196`、`js/store.js:224`、`js/store.js:239`)。
- 同步发送 `Authorization`、CSRF 安全的 `X-Requested-With`、GET 的 ETag，以及中止超时 (`js/sync.js:195`)。
- 推送使用 `baseRevision`；冲突处理会在服务器状态上进行合并并重试 (`js/sync.js:523`、`js/sync.js:600`、`js/sync.js:645`)。
- 登录同步明确避免在拉取之前推送过时的本地数据 (`js/sync.js:758`)。
- 后端使用乐观修订检查持久化用户隔离的快照 (`backend/schema.sql:24`、`backend/src/services/syncService.js:96`、`backend/src/services/syncService.js:141`)。

已知边界：修订是操作计数器，而非内容指纹。代码本身记录了两个不同的离线设备在边缘情况下都可以通过操作计数比较（`backend/src/services/syncService.js:141`）。这是被接受的权衡，而非当前的回归。

第8阶段裁决：**当前产品行为稳定**，已记录一个边缘情况，并在技术债务中记录了一个单独的旧版CoachMemory存储问题。

# 5. 第九阶段课程体系审查

当前课程系统2.0已完整，作为课程/日程/进度系统。

- `CourseSchedule` 规范化课程、时段、星期、节次、周次、教师、教室、学分和遗留字段 (`js/courseSchedule.js:17`、`js/courseSchedule.js:79`、`js/courseSchedule.js:101`)。
- 它从课程定义和学期周中派生今日/每周实例 (`js/courseSchedule.js:182`、`js/courseSchedule.js:202`、`js/courseSchedule.js:219`)。
- 导入匹配支持新建、附加、合并、重复和跳过流程，而不会悄悄覆盖进度 (`js/courseSchedule.js:288`、`js/courseSchedule.js:342`)。
- 课程的增删改查和汇总进度通过 `CGStore` 进行 (`js/store.js:1080`、`js/store.js:1104`)。
- 工作台提供添加/编辑/删除/详情/排课视图 (`pages/workbench.js:121`、`pages/workbench.js:213`、`pages/workbench.js:342`、`pages/workbench.js:999`)。
- 统计和 AI 使用来自分析的课程总结 (`pages/stats.js:167`、`pages/index.js:325`、`js/aiDataRetrieval.js:90`)。

然而，该模型包含课程身份和粗略进度，而不包含学习知识。它有`totalChapters` / `learnedChapters`，但没有一流的模块、章节、节、材料、来源、先决条件、掌握状态或内容关系。知识层将需要附加实体和稳定的课程ID/内容ID，但不能由提示或AI发明。

第9阶段裁定：**作为课程系统2.0已完成；作为课程知识库的基础部分完成。**

# 6. 阶段 10 分析审计

分析仍然是权威的真理来源。

- 其合约明确要求在 CGStore 快照 (`js/analytics.js:1`、`js/analytics.js:10`) 上进行只读的、确定性的、无副作用的计算。
- 它提供每日、每周、每月、自定义范围、趋势、连胜、分布、热力图、学习、练习、专注、待办事项、个人最佳和课程总结 (`js/analytics.js:365` 到 `js/analytics.js:741`)。
- 统计使用 `Analytics.snapshot()` 并在每个领域调用 Analytics (`pages/stats.js:21`、`pages/stats.js:98`、`pages/stats.js:131`)。
- 索引、工作台、AI、目标和增长层委托给 Analytics (`pages/index.js:306`、`pages/workbench.js:557`、`pages/ai.js:94`、`js/goals.js:277`、`js/growthContext.js:48`)。

存在小额债务：`CGStore` 具有便捷的汇总功能，如 `courseAvgProgress()` 以及阅读/专注总计 (`js/store.js:1099`、`js/store.js:1167`)。这些大多是显示上的便捷，但在开发 Agent 之前应收紧规则，以确保没有新的消费者在 Analytics 之外生成分析数据。

分析结论：**架构稳定**。

# 7. 阶段11统计审计

统计中心是真实且整合的。

- 如今，自定义范围是基于分析范围（`pages/stats.js:98`]、`pages/stats.js:101`）构建的。
- 涵盖概览、学习、锻炼、专注、待办事项、课程、趋势、热力图、个人最佳成绩、报告和记忆视图（`pages/stats.js:257` 至 `pages/stats.js:741`。
- 热力图使用365天窗口和分析活动地图（`pages/stats.js:557`）。
- 个人最佳使用`Analytics.getPersonalBest`（`pages/stats.js:741`，`js/analytics.js:700`）。

统计裁决：**完成**。

# 8. 第12阶段目标审核

Goals 是一个稳定的用户意图层。

- Goal Engine 作为纯派生层文档，不写入存储或重新计算核心指标（`js/goals.js:1`，`js/goals.js:17`。
- 目标定义会在CGStore中持久化并同步（`js/store.js:84`，`js/store.js:96`）。
- 目标范围和指标委托给分析（`js/goals.js:137`、`js/goals.js:277`、`js/goals.js:286`）。
- 它验证目标，推导出进度/状态，并分类活跃/完成/过期目标（`js/goals.js:91`、`js/goals.js:209`、`js/goals.js:360`）。

目标裁决：**稳定的用户意图层**。

# 9. 第13阶段 AI 教练审计

当前的 AI 是一个**上下文感知的 AI 教练 / AI 助手**，而不是代理。

当前聊天链：

```text
CGStore
  → Analytics
  → GoalEngine
  → GrowthIntelligence / Memory / Report / DailyFeedback
  → AIContext.buildContext()
  → CGAPI.ai.chat
  → POST /api/ai/chat
  → aiService.coachChat()
  → promptBuilder + Provider
  → deterministic suggestions/actions + model reply
```

证据：

- AIContext 聚合了 Analytics、GoalEngine、GrowthIntelligence、Memory、Reports、DailyFeedback、Retrieval 和 ToolRunner（`js/aiContext.js:29`、`js/aiContext.js:157`、`js/aiContext.js:271`）。
- Context 是有版本控制的，并经过预算裁剪，大约为 6,000 个估计令牌（`js/aiContext.js:47`、`js/aiContext.js:54`、`js/aiContext.js:512`）。
- 后端会验证角色、历史记录、上下文版本和大小；删除禁止的键；并将系统放在上下文/历史/用户之前（`backend/src/services/aiService.js:33`、`backend/src/services/aiService.js:135`、`backend/src/services/aiService.js:178`、`backend/src/services/aiService.js:204`）。
- 建议和操作是基于洞察确定性地导出的；仅允许导航操作（`backend/src/services/promptBuilder.js:104`、`backend/src/services/promptBuilder.js:124`）。
- Retrieval 和工具编排是只读、仅限当前用户且有界的（`js/aiContext.js:630`、`js/aiDataRetrieval.js:9`）。

它不是代理，因为没有自主的多步规划、没有课程知识检索、没有经过验证的学习状态模型，也没有除了受控只读检索/导航提案外的安全工具执行循环。

# 10. 记忆 / 成长智力审计

系统已经知道并能够推断以下用户事实/信号：

| 知识领域 | 当前状态 |
| --- | --- |
|待办事项 |今天/周的总计、完成、逾期、积压 |
|重点 |分钟数、活跃天数、平均值、趋势 |
|英语 |会议记录、单词、趋势 |
|阅读 |条目、页面、完成的书籍、趋势 |
|锻炼 |计数、分钟、卡路里、趋势 |
|签到次数 |每日纪录与连胜纪录 |
|课程 |课程数量、平均进度、状态、课程安排 |
|目标 |有效/完成/过期，百分比，风险，剩余天数 |
|趋势 |7/14/30/90天窗口，重要变化，波动率 |
|习惯 |未追踪的`habitFormation.js`计算频率、一致性、连续性、当前/最大连续记录、状态、原因、证据 |
|长期记忆 |成长记忆模式、里程碑、偏好、洞察、候选人、信心、生命周期、关系 |
|反思反馈 |二进制帮助 / 仅拥有权的 not_helpful |

今天记忆有两个不同的层次：

1. `GrowthMemory` 通过 CGStore (`js/growthMemory.js:755`，`js/growthMemory.js:763`) 被派生并确认到 `user.memory`。
2. `CoachMemory` 使用单独的 `cg_ai_coach_memory_v1` localStorage 键，并维护推荐/结果 (`js/coachMemory.js:4`，`js/coachMemory.js:28`，`js/coachMemory.js:41`)。

这不仅能实现短期/确认的分离，还会在开发代理前对应对齐第二条用户专用的内存存储路径。

# 11. 第22阶段 习惯形成审核

未跟踪的 `js/habitFormation.js` 实现了一个看起来稳定的习惯合同。

- 它返回 `habitScore`, `frequency`, `consistency`, `maxConsecutive`, `currentConsecutive`, `activeDays`, `windowDays`, `status`, `reason`，以及证据 (`js/habitFormation.js:127`)。
- 它支持 `minFrequency`，拒绝无效/未来/重复的观察，并从 7/14 天的阈值 (`js/habitFormation.js:90`, `js/habitFormation.js:183`) 推导阶段。
- 在 `tests/habitFormation.test.js` 中有大量未跟踪的测试，并且它们通过了。

第22阶段裁定：**功能上有前景，但由于代码/测试/文档未提交，在Git层面仍在进行中**。

# 12. 第23阶段审计

Phase 23.1 正确引入了衍生的 GrowthContext 图层。

- 它构建任务摘要、专注/学习/锻炼摘要、连胜记录、目标风险、信号和来自分析与目标引擎的建议（`js/growthContext.js:39`、`js/growthContext.js:48`、`js/growthContext.js:63`、`js/growthContext.js:123`）。
- 它是只读的，不会创建新的数据类型（`js/growthContext.js:8`）。

第23.2阶段增加了每日反思。

- 后端反思使用固定的提示模式和来自 GrowthContext 的确定性 `performance` 值（`backend/src/services/aiService.js:54`，`backend/src/services/aiService.js:252`）。
- 反思输出经过规范化、约束，并强制为 JSON 形式（`backend/src/services/aiService.js:97`，`backend/src/services/aiService.js:274`）。
- 反思上下文是允许列表、受约束的，并隔离提示注入（`backend/src/services/reflectionContext.js:54`，`backend/src/services/promptBuilder.js:143`）。
- 反思用户界面处理空闲/加载/成功/错误/空状态（`js/aiReflectionUI.js`）。

第23阶段裁决：**已通过第23.2.3阶段完成提交和验证**。

# 13. 第23.2阶段审计

Reflection 是一个只读的解释和建议层，不是业务数据写作工具。

- 反射路由需要授权和速率限制（`backend/src/routes/ai.js:30`）。
- 反射返回一个加法 `reflectionId`，但不改变旧的反射形状（`backend/src/routes/ai.js:33`）。
- 为认证用户（`backend/src/routes/ai.js:37`）记录反射生成。
- 反射内容不会被持久化;只有所有权和反馈被保留（`backend/schema.sql:34`，`backend/schema.sql:41`）。

第23.2阶段裁决：**当前范围已完成**。

# 14. 反思反馈环审计

反馈循环确实存在，但程度很小。

- API 仅支持 `helpful` 和 `not_helpful` （`backend/src/services/aiReflectionFeedbackService.js:7`， `backend/src/services/aiReflectionFeedbackService.js:39`。
- 所有权验证来源为 `req.userId`;跨用户反馈返回 `403 REFLECTION_FORBIDDEN` （`backend/src/services/aiReflectionFeedbackService.js:50`）。
- 重复反馈是幂级的（`backend/src/services/aiReflectionFeedbackService.js:65`）。
- 前端 API 调用会通过共享客户端（`js/apiClient.js:474`）进行。
- UI 支持加载、成功和友好错误状态（`js/aiReflectionUI.js:251`）。
- 后端和前端测试涵盖了认证、验证、所有权、评级、加载、成功和失败。

仍然缺少的东西:

- 没有持久化的反思内容，因此反馈无法与用户看到的内容关联起来。
- 没有用于已查看/有帮助/无帮助的分析事件基础设施。
- 没有汇总的产品见解，比如“哪种反射类型有用”。

反思反馈结论：作为第23.2.3阶段 **已完成**；作为产品反馈分析循环 **部分完成**。

# 15. MPA / 用户界面稳定性审计

已提交的 MPA 壳体修复仍然完好。

- `8306a35` 添加了 `js/shellBootstrap.js`、用户 Chrome 稳定性、CSS 首帧保护，以及仪表板/导航回归测试。
- 当前测试在 `tests/shellBootstrap.test.js`、`tests/dashboardRenderStability.test.js` 以及导航/页面初始化套件中通过。
- 构建成功完成。

已知构建警告：多个页面在没有 `type="module"` 的情况下加载 `js/shellBootstrap.js`，因此 Vite 无法打包它（`npm run build` 输出）。这不是构建失败，但在 Agent 时代的页面架构扩展之前应解决此问题。

MPA 判决：**在测试/构建中稳定；浏览器/e2e 健康状况未独立验证**。

# 16. 当前人工智能架构

```text
CGStore (todos, focus, english, readings, sports, checkins, courses, goals, user.memory)
        ↓
Analytics (canonical metrics)
        ↓
GrowthIntelligence / GrowthMemory / GrowthReport / DailyFeedback
        ↓
GrowthContext + AIContext + controlled retrieval/tool results
        ↓
/api/ai/chat       /api/ai/reflection       /api/ai/reflection/feedback
        ↓                         ↓                          ↓
Provider reply         Reflection JSON            Binary feedback
        ↓                         ↓
Deterministic suggestions/actions         friendly UI
```

代理基础设施存在：

- [✓] 用户行为上下文
- [✓] 目标上下文
- [✓] 习惯/风险信号
- [✓] 带置信度/生命周期的记忆
- [✓] 反思
- [✓] 二元用户反馈
- [✓] 只读受控检索
- [?] 课程知识
- [✗] 已验证的学生知识状态
- [✗] 基于证据的文档/知识检索
- [✗] 规划引擎
- [✗] 超越导航/提议的安全执行/操作层

# 17. 课程架构

当前课程路径：

```text
CGStore.courses
  → CourseSchedule.normalizeCourse()
  → schedule/progress derivation
  → Workbench UI / Stats / Goals / AIContext
```

现存内容：

- CGStore内有稳定的赛道记录。
- 调整了课表时间和学期周。
- 导入匹配和合并规则。
- 粗略的进展和状态。
- 教师/课堂/学分/笔记元数据。

不存在的是什么：

- 课程空间。
- 课程/模块/章节/部分实体。
- 来源文档或材料。
- 分块、嵌入、向量、关键字或语义检索。
- 掌握/知识状态跟踪。
- 有证据支持的学习推荐。

课程知识准备情况：**部分准备好**。课程身份/时间表/进度基础足以开始一个精心规划的课程空间/知识基础阶段，但不足以构建学习代理。

# 18. 特工准备矩阵

| 层 | 当前状态 | 证据 | 准备情况 |
| --- | --- | --- | --- |
| 用户数据 | 强 | `js/store.js:84`，后端快照模式 | 就绪 |
| 分析 | 强 | `js/analytics.js:1`，页面使用 | 已准备 |
|目标 |强大 |[[代码0]]， [[代码1]] |准备 |
| 内存 | 有用但分散 | `js/growthMemory.js:755`, `js/coachMemory.js:4` | 部分 |
| 习惯智力 | 未承诺但已测试 | `js/habitFormation.js:90` | 部分 |
| AI 教练 | 上下文感知，只读 | `js/aiContext.js:157`, `backend/src/services/aiService.js:204` | 准备好用作助手，但不是代理 |
|反射 |当前范围完成 |[[代码0]] |准备 |
| 反馈回路 | 仅二进制 | `backend/src/services/aiReflectionFeedbackService.js:39` | 部分 |
|航线模型 |仅按计划进度 |[[代码0]]，[[代码1]] |部分 |
|课程知识 |缺失 |未找到模块/章节/源实体 |尚未准备好 |
|检索 |仅受控度量检索 |[[代码0]]，[[代码1]] |部分 |
| 证据 | 指标/记忆证据，无知识证据 | `js/growthMemory.js:61` | 部分 |
|学生知识状态 |缺失 |未找到掌握模型 |还没准备好 |
| 规划 | 仅静态行动提议 | `backend/src/services/promptBuilder.js:124` | 未就绪 |
| 动作层 | 仅限导航/用户确认的提案 | `js/aiActions.js`, `backend/src/services/promptBuilder.js:117` | 未就绪 |

# 19. 代理能力矩阵

| 能力 | 存在 | 质量 | 证据 |
| --- | --- | --- | --- |
|感知 |是的 |适合记录行为 |分析 增长智能 |
|用户上下文 |是的 |良好，预算，版本化 |`js/aiContext.js:157` |
|课程知识 |无 |缺失 |课程模型仅有时间表/进度 |
|检索 |部分检索 |当前用户度量检索，无语义知识检索 |`js/aiDataRetrieval.js:9` |
|推理 |部分 |确定性规则 LLM 解释 |`backend/src/services/promptBuilder.js:104` |
|规划 |否 |建议/行动是规则制定的，不是多步骤计划 |`backend/src/services/promptBuilder.js:124` |
|操作 |无 |仅限提案/导航;禁止自主写入 |[[代码0]] |
|记忆 |部分 |强增长记忆;教练记忆使用第二存储 |`js/growthMemory.js:755`， `js/coachMemory.js:4` |
|反馈 |部分 |存在反射二元反馈;无分析聚合 |`backend/src/services/aiReflectionFeedbackService.js:39` |

# 20. 技术债务

## P0 — 阻塞下一个开发阶段

1. 当前工作树未冻结：31 个已修改，46 个未跟踪路径，包括核心增长/保留/习惯特征。
2. 前端测试套件显示失败：在未跟踪的 `tests/workbenchDailyFeedback.test.js` 中有 2 个失败。

## P1 — 在进行代理/基础工作之前重要

1. Reflection 仍然接受客户端提交的 GrowthContext。它被清理和限制，但服务器不能独立推导它（`backend/src/routes/ai.js:35`，`backend/src/services/aiService.js:263`）。
2. Course 没有 Knowledge 实体模型或验证的学习状态。
3. Reflection 反馈没有分析/事件聚合。
4. GrowthMemory 和 CoachMemory 提供了两个具有不同存储边界的用户记忆系统（`js/growthMemory.js:763`，`js/coachMemory.js:4`）。
5. 临时视频目录存在于存储库工作树中（`tmp-video-frames/`，`tmp-video-seq/`）。

## P2 — 正常债务

1. `CGStore` 除了 Analytics (`js/store.js:1099`, `js/store.js:1167`) 外，还包含一些直接的聚合助手。
2. 构建时警告 `shellBootstrap.js` 在几个页面中未进行模块打包。
3. 一些第 20–22 阶段的文档未被跟踪，因此文档和 Git 状态不一致。
4. 不存在浏览器自动化/E2E 依赖。

## P3 — 未来

1. 修订可以成为内容指纹/历史链，以增强离线合并语义。
2. 内存生命周期/关系以后可能会成为专门的用户知识图谱，但只有在存储边界得到协调之后。

# 21. 健康测试

当前工作树验证：

```yaml
Frontend:
  command: npm test
  result: FAIL
  passed: 578
  failed: 2
  total: 580
  failed_file: tests/workbenchDailyFeedback.test.js
  failures:
    - adding focus updates Daily Feedback without replacing the existing toast copy
    - Growth Brief shows one bounded current growth stage

Backend:
  command: npm test
  result: PASS
  passed: 84
  failed: 0
  total: 84

Combined:
  passed: 662
  failed: 2
  total: 664
  skipped: 0
  flaky_evidence: none observed in this run
```

通过的关键套件包括分析、目标、商店、同步、课程表、课程文本解析器、AI上下文、AI教练、增长智能、增长记忆、增长上下文、反思、反思安全、反思反馈和今日计划。

# 22. 培养健康

```yaml
command: npm run build
result: PASS
warnings:
  - shellBootstrap.js is loaded without type="module" on stats/ai/workbench/goals pages and is not bundleable
output_pages:
  - index.html
  - login.html
  - workbench.html
  - stats.html
  - goals.html
  - ai.html
```

# 23. 浏览器健康

在仓库中没有 Playwright、Cypress 或等效的端到端配置。因此，在本次审计中，Index、Workbench、Courses、Stats、Goals、AI、Today、控制台错误、导航、首帧渲染和布局未进行独立的浏览器验证。

浏览器健康：**未运行 / 无端到端基础设施**。

# 24. 安全 / 数据边界

当前安全态势：

- JWT是受保护的AI/数据路由所必需的;`authRequired`注入`req.userId`（`backend/src/middleware/auth.js:129`）。
- 后端用户数据由 `user_id` （`backend/schema.sql:24`） 键位化。
- 同步写入使用白名单键和乐观版本控制（`backend/src/services/syncService.js:96`、`backend/src/services/syncService.js:141`）。
- AI聊天和Reflection需要授权和速率限制（`backend/src/routes/ai.js:28`、`backend/src/routes/ai.js:33`）。
- 反思反馈验证所有权和评分（`backend/src/services/aiReflectionFeedbackService.js:39`）。
- 反射上下文是允许列表和有界的;系统提示符将上下文声明为数据，而非指令（`backend/src/services/reflectionContext.js:54`， `backend/src/services/promptBuilder.js:149`）。
- 提供者API密钥仍保留在服务器端，不会返回（`backend/src/services/aiService.js:13`）。

未来课程知识边界：

如果没有明确的分离，课程知识层可能会意外地混合公共/一般课程内容、用户拥有的笔记/进度以及 AI 提示上下文。未来的设计应强制执行：

```text
Course Content / Knowledge Source
  = reusable learning object, content ID, source metadata

User Learning State
  = user_id, content_id, mastery/status, evidence

AI Context
  = compact, permission-filtered projection with untrusted content marking
```

后端必须负责所有权过滤和检索范围控制。人工智能不得接收原始混合数据存储或决定权限。

# 25. 当前架构图

```text
                 Current System
                       │
      ┌────────────────┼────────────────┐
      │                │                │
   User Data        Course           AI
      │                │                │
   CGStore       CourseSchedule     AIContext
      │                │                │
   Analytics     Progress/Schedule  Controlled Retrieval
      │                │                │
    Goals        Import/Matching   AI Coach
      │                                 │
 GrowthIntelligence                 Reflection
      │                                 │
 GrowthMemory                     Feedback
      │
 DailyFeedback / Reports

Backend: JWT, Sync, SQLite, AI Provider, Reflection Feedback
```

现有代理基础：统一的用户数据、分析、目标、只读上下文/检索、增长记忆、反思和用户反馈。

缺失的代理层：课程知识、已验证的学习状态、证据检索、规划以及安全的用户确认操作执行。

# 26. 当前成熟度水平

当前成熟度：**三级 — 初期个人 AI 教练**。

Why:

- 它超越了级别2，因为它使用了真实的行为数据、目标、确定性增长信号、记忆和反思。
- 它不是第四级，因为它无法自主规划学习路径、检索/验证课程知识、维护学生知识状态或执行安全的学习操作。
- 人工智能仍然是对用户拥有的数据进行解释/建议的工具，而不是自主的个人学习代理。

# 27. 阻塞问题

| 优先级 | 阻塞因素 | 所需结果 |
| --- | --- | --- |
| P0 | 大型未命名工作集 | 命名、审查、测试并提交或拆分当前的增长/保留/习惯工作 |
| P0 | 前端测试失败 | 修复两个 `workbenchDailyFeedback.test.js` 失败，同时不削弱断言 |
| P1 | 课程知识缺失 | 仅在当前工作冻结后添加课程空间/知识基础 |
| P1 | 反思上下文由客户端提供 | 设计服务器派生或身份验证的上下文所有权模型 |
| P1 | 反思反馈没有分析 | 定义附加的分析/事件合同，而不改变业务模型 |
| P1 | 内存系统拆分 | 协调 GrowthMemory 和 CoachMemory 的边界 |

# 28. 建议

现在**不要**开始个人学习代理的开发。

推荐顺序：

1. 稳定并提交或拆分当前未命名的增长/留存/习惯工作集。
2. 修复两个失败的工作台每日反馈测试。
3. 删除或正式忽略临时媒体文件。
4. 为Index、Workbench、Courses、Stats、Goals、AI和Today添加浏览器/端对端烟雾覆盖。
5. 设计一个简约的课程空间与知识库基础阶段：
   - 添加稳定的课程/模块/章节/部分/资源实体。
   - 将公共/一般知识与用户拥有的学习状态分开。
   - 添加检索和证据元数据。
   - 不要添加自主规划、自动写作或代理行动执行。

# 29. 决定

```text
DECISION:

NOT READY
```

## 证据

- 前端测试：578/580 通过，2 失败。
- 后端测试：84/84 通过。
- 构建：通过。
- 工作区：大量未提交和未跟踪的功能集。
- 课程模型：仅限日程/进度；没有知识/检索/掌握层。
- AI：具备上下文感知的教练，具有只读检索、反思和二元反馈；没有规划/执行层。

## 原因

当前系统足够强大，可以支持未来的基础阶段，但开始智能体开发将建立在未完成的测试、未确定的架构、不完整的课程知识和部分协调的记忆边界上进行规划和行动。

## 如果现在继续的风险

- 代理行为将基于未经验证的课程假设。
- 个人学习数据和未来课程知识可能在 AI 环境中混合。
- 新的规划/行动逻辑将被添加到不稳定的工作树之上。
- 如果 AI 的推荐缺乏证据或写入权限过宽，用户信任可能会受到损害。

## 推荐的下一步

首先稳定当前未命名的增长/保留/习惯工作集，并确保所有测试通过。在此之后，开始一个范围狭窄的**第24阶段——课程空间与知识库基础**，而不是全面的个人学习代理开发。
