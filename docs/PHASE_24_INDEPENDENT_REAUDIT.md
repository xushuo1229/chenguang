# 第24阶段独立复审

# 1. 执行摘要

第24阶段实现了课程空间和知识库基础，具备可接受的架构、安全性、所有权、持久性和回归行为。

重新审计未发现关键或高危问题，没有架构损坏，没有跨用户泄露，也没有禁止的代理/规划器/操作实现。仍然存在两个中等问题和若干低级/信息性观察点。它们不会阻塞当前的第24阶段冻结，但中等的边界性和UI状态问题应在构建第25阶段的检索/AI层之前修复。

最终裁决：**准备冻结**。

# 2. 基线

| 项目 | 数值 |
| --- | --- |
| 重新审计的提交 | `5eab95f feat: add course space knowledge foundation` |
| 架构提交 | `7f95cde docs: freeze personal learning agent architecture v1.1` |
| 之前的稳定基线 | `1a0a874 chore: stabilize phase 23.x baseline` |
| 工作区 | 除未跟踪的 `tmp-video-frames/` 和 `tmp-video-seq/` 外干净 |
| 临时文件 | 未删除、未修改或未提交 |

第24阶段提交包含预期的实现、测试、用户界面和报告文件。第24阶段提交中没有混入无关的生产文件。

# 3. 架构 v1.1 合规性

| 架构规则 | 预期 | 实际 | 状态 |
| --- | --- | --- | --- |
| 课程独立边界 | 是 | 不修改现有课程体系 | 通过 |
| 与 CGStore 独立的课程知识 | 是 | 新的 SQLite 表与 `chenguangData` 分开 | 通过 |
| 知识库 != 向量数据库 | 是 | 结构化 SQLite 模型是真实来源 | 通过 |
| 证据支持 | 是 | 证据是一个单独的表格，并引用节点文档 | 通过 |
| 有界检索 | 是 | `/search` 是有界的；快照有中等的有界性差距 | 通过 |
| 用户数据隔离 | 是 | 所有行和查询都由 `user_id` 范围限制 | 通过 |
|现有课程系统保留 |是的 |时间表/进度流程未变 |通过 |
|CGStore 语义未变 |是的 |未包含在第24阶段提交中 |PASS |
|分析未变 |是的 |未包含在第24阶段提交中 |通过 |
| 目标未变 | 是 | 未包含在第24阶段提交中 | 通过 |
| 同步未更改 | 是 | `PAYLOAD_KEYS` 和同步协议未更改 | 通过 |
| AIContext 未更改 | 是 | 未包含在第24阶段提交中 | 通过 |
| 无代理 | 是 | 未添加生产代理代码 | 通过 |
| 无计划者 | 是 | 未添加计划实施 | 通过 |
| 无自主操作 | 是 | 未添加操作执行 | 通过 |
| 无学生知识状态 | 是 | 未添加掌握/熟练度引擎 | 通过 |

Course Space 搜索端点满足有界检索规则。完整快照端点是以所有者为范围的，但目前是无界的；这被记录为 F-001。

# 4. 数据模型审计

在 `backend/schema.sql:52-99` 中添加了以下表格：

- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]

该模型符合第24阶段基础范围：

- 文档具有标题、限定内容、可选的来源 URL 和版本。
- 知识节点具有类型、定义、生命周期状态、置信度和版本。
- 知识关系具有源/目标节点和允许的关系类型。
- 证据具有引用、定位器、文档引用和知识节点引用。

`user_id` 存在于每个表格中，并且在用户被删除时会级联。

没有引入任何向量数据库、嵌入系统、提取引擎、学生知识状态或考试智能模型。

# 5. 课程所有权审计

课程所有权在 `backend/src/services/courseSpaceService.js:70-78` 中检查。

每个创建路径首先解析经过认证用户的`courses[]`至`syncService.getData(userId)`，然后要求该路径中必须存在该路径。这防止用户将课程空间数据附加到其他用户的课程上。

读取也是有作用域的：

- 快照过滤发生在`backend/src/services/courseSpaceService.js:222-241`。
- SQL行在`backend/src/db/courseSpaceModel.js:42-96`中通过`user_id`进行过滤。
- 搜索行在`backend/src/db/courseSpaceModel.js:98-128`中通过`user_id`进行过滤。

未找到允许用户A读取或附加数据到用户B课程的路径。

# 6. 文件审核

文档创建在`backend/src/services/courseSpaceService.js:133-149`中实现。

控制：

- `courseId` 的所有权是强制执行的。
- `title` 是必填项，并且限制为 200 个字符。
- `content` 是可选项，并且限制为 100,000 个字符。
- `sourceUrl` 是可选项、有长度限制，并且仅限 HTTP/HTTPS。
- `version` 限制为正整数。
- ID 是服务器生成的 UUID。

响应映射器不公开 `user_id`。

# 7. 知识节点审计

KnowledgeNode 的创建在 `backend/src/services/courseSpaceService.js:151-171` 中实现。

控制：

- `courseId` 所有权已强制执行。
- `kind` 在允许列表中。
- `status` 在允许列表中。
- `confidence` 被列入 `high`、`medium` 或 `low` 的允许列表。
- `definition` 是有界的。
- `version` 是有界的。

该模型符合第24阶段的边界。它不推断精通或创造学生知识状态。

# 8. 知识关系审计

KnowledgeRelation 创建在 `backend/src/services/courseSpaceService.js:173-193` 中实现。

控制：

- 源节点和目标节点必须都属于经过身份验证的用户。
- 两个节点必须属于同一个`courseId`。
- 关系类型已允许。
- 版本是有限的。

后端测试在 `backend/test/courseSpace.test.js:95-133` 中验证了有效关系和无效关系类型。

未找到跨课程或跨用户的关系路径。

# 9. 证据审计

证据创建在 `backend/src/services/courseSpaceService.js:195-220` 中实现。

控制：

- `courseId` 所有权得到执行。
- 所引用的文档和知识节点必须属于同一用户和课程。
- 引用和定位器是绑定的。
- 证据可以追踪到文档和知识节点。

后端测试验证了 `backend/test/courseSpace.test.js:103-118` 和 `backend/test/courseSpace.test.js:146-171` 中有效证据记录的正确性以及对外部引用的拒绝。

# 10. 检索审计

搜索在`backend/src/services/courseSpaceService.js:248-273`中实现。

控制：

- 查询是必需的，且限制为200个字符。
- `limit` 限制为 `1..50`。
- LIKE 通配符已转义。
- 搜索覆盖节点标题/定义、文档标题/内容以及证据引用/位置。
- 每个 SQL 查询都是用户范围内的。
- 每个结果分组都有自己的 SQL `LIMIT`。

`/search` 端点是有界的。

然而，快照端点 `GET /api/course-space` 会返回所有匹配的行和完整的文档内容，而无需 SQL `LIMIT`。这被记录为中等严重性问题 F-001。这不是数据泄露，因为它仍然是所有者范围内的，但随着知识的增长，它可能成为性能和响应大小的问题。

# 11. API 审计

航线空间航线在`backend/src/routes/courseSpace.js:8-65`中实现，安装在`backend/src/routes/index.js:65-67`。

支持的 API：

```text
GET    /api/course-space
GET    /api/course-space/search
POST   /api/course-space/documents
POST   /api/course-space/nodes
POST   /api/course-space/relations
POST   /api/course-space/evidence
```

该 API 是累加性的，不会改变 `/api/data`、`/api/course/import`、`/api/ai/*` 或 Reflection 合约。

第24阶段故意没有更新或删除端点。这与仅限基础的范围一致，并记录为 INFO F-006。

# 12. 授权审计

所有六条路线都使用`authRequired`。

`authRequired` 验证 JWT 并在 `backend/src/middleware/auth.js:129-146` 中设置 `req.userId`。这些路由总是将 `req.userId` 传递给 `backend/src/routes/courseSpace.js:8-65` 中的服务层。

授权结论：

- 匿名访问被拒绝。
- 行读取由 `user_id` 定义范围。
- 课程在创建前会验证所有权。
- 节点、文档、关系和证据引用会检查所有者。
- 跨用户测试在 `backend/test/courseSpace.test.js:146-171` 中通过。

未发现授权阻止器。

# 13. 持久性边界审计

课程知识存储在四个专用的 SQLite 表中，而不是存储在 `chenguangData` 中。

证据：

- `backend/schema.sql:50-99` 添加了课程空间表。
- `backend/src/config/collectionConfig.js` 仍然包含原始的有效载荷白名单。
- 第24阶段的提交没有修改 `CGStore`、`js/sync.js`、Analytics 或 Goals。
- `backend/src/services/syncService.js` 未被修改。

这符合 v1.1 要求，即 CGStore 保持为核心用户数据层，而课程知识保持独立。

# 14. 同步边界审计

同步协议保持不变。

课程空间未添加到：

- `PAYLOAD_KEYS`
- `CGStore`
- 前端同步脏分类跟踪
- 部分/全部数据合并
- 同步修订处理

这避免了重写现有的第8阶段同步协议，并避免引入第二个用户数据存储。

# 15. 课程系统兼容性

现有课程系统 2.0 仍然负责课程身份、时间表和进度。

课程空间仅通过 `courseId` 链接到现有课程。它不会修改 `courses[]`、课程进度、名额、时间表或导入逻辑。

`pages/workbench.js` 仅挂载只读的课程空间界面；现有的课程管理行为保持不变。

还有一个数据完整性观察：如果课程系统的课程稍后被删除，课程空间记录目前仍然保留。这被记录为低级别问题 F-003。

# 16. AIContext 兼容性

AIContext 未被修改。

课程空间不会被注入到AI提示、增长上下文、反思上下文或AI检索中。课程知识没有新的途径可以成为AI系统指令。

这对于第24阶段是正确的。人工智能整合属于后期阶段，必须通过一个有界的、保持证据的上下文层。

# 17. 内存 / 反馈兼容性

GrowthMemory、CoachMemory、Reflection 和 Reflection Feedback 没有变化。

课程空间不被视为记忆。反思反馈不被视为课程知识或行为分析。

可选的 `docs/AI_MEMORY_FEEDBACK_BOUNDARIES.md` 文件不存在，但等效的边界已记录在 `docs/PERSONAL_LEARNING_AGENT_ARCHITECTURE_V1_1.md` 和 `docs/PHASE_23X_STABILIZATION_REPORT.md` 中。这被记录为 INFO F-007。

# 18. 用户界面 / 浏览器审计

课程空间用户界面已挂载在现有的工作台课程视图中。

界面行为：

- 使用共享的 API 客户端，而不是直接 `fetch`。
- 使用基于 `textContent` 的渲染，而不是 HTML 字符串插值。
- 支持课程选择、快照、有限搜索、加载、空状态和友好错误状态。
- 不暴露提供者或内部错误。

独立铬烟验证：

| 视口 | 结果 | 横向滚动 | 课程空间可见 | 初始节点渲染 | 搜索证据渲染 | 页面错误 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1920×1080 | 通过 | 否 | 是 | 是 | 是 | 0 |
| 375×812 | 通过 | 否 | 是 | 是 | 是 | 0 |

浏览器审计发现，在搜索后课程选择器会被重置，因为搜索响应中不包含课程列表，而用户界面会从 `data.courses || []` 重新渲染选择器。这被记录为中等级别问题 F-002。

# 19. 安全审计

已验证的安全控制：

- 需要 JWT 身份验证。
- 授权使用经过身份验证的 `req.userId`，而非客户端身份。
- 所有课程空间行都是按所有者范围限定的。
- 拒绝跨用户的课程/文档/节点引用。
- 关系和节点类型在允许列表中。
- 执行输入长度和版本范围限制。
- 源 URL 必须使用 HTTP/HTTPS。
- 搜索查询和限制值有上限。
- LIKE 表达式会进行转义。
- 写入端点受全局 CSRF 中间件和写入限制保护。
- API 响应经过现有响应层的清理。
- UI 使用 `textContent` 渲染不受信任的内容。
- UI 不会泄露任何机密、提供者错误、堆栈追踪或内部路径。

未发现关键或高安全性问题。

# 20. 回归测试结果

独立运行结果：

```yaml
Frontend:
  584/584 PASS

Backend:
  88/88 PASS
```

后端课程空间覆盖包括：

- 认证，
- 创建文档，
- 创建知识节点，
- 创造知识关系，
- 创造证据，
- 快照阅读，
- 有界搜索，
- 无效关系类型，
- 球场所有权无效，
- 跨用户隔离，
- 以及无效的外国引用。

前端课程空间覆盖包括：

- 共享API客户端使用情况，
- 快照归一化，
- 安全呈现，
- 航线渲染，
- 加载状态，
- 搜索证据呈现，
- 以及友好错误状态。

未发现回归。

# 21. 构建结果

```yaml
Build:
  PASS
```

Vite 生产构建已成功完成。

# 22. 测试覆盖间隙

以下是覆盖缺口，而不是当前的失败：

- 没有针对每个课程空间 POST 端点的 CSRF 拒绝专用测试。
- 没有针对超大源 URL、内容、引用或定义的测试。
- 没有针对无效节点类型、无效状态或无效置信度的测试。
- 没有更新/删除测试，因为这些 API 故意不存在。
- 没有大数据量性能测试。
- 没有测试删除一个课程系统的课程是否会清理或调和课程空间记录。
- 没有自动化移动浏览器测试套件；响应式检查是通过 Playwright 手动进行的。

这些空白不会阻碍第24阶段，但在第25阶段之前应覆盖更新/删除的生命周期和卷行为。

# 23. 发现

## F-001 快照检索是无限的

- 严重程度：中等
- 证据：
  - `backend/src/db/courseSpaceModel.js:42-79` 在列表查询中没有 `LIMIT`。
  - `backend/src/services/courseSpaceService.js:222-241` 返回所有文档、节点、关系和证据。
  - `backend/src/routes/courseSpace.js:8-15` 会暴露快照。
- 问题：完整快照可以返回所有行和完整的文档内容。
- 影响：随着知识的积累，响应规模和延迟可能无限增长。这不是跨用户泄漏，因为所有权过滤依然有效。
- 建议：添加分页或硬限制，省略列表回复中的完整内容，或引入紧凑的快照投影。
- 冻结冲击：第24阶段不阻挡，但应该在第25阶段回收/AI工作前修复。

## F-002 搜索响应重置课程选择器

- 严重性：中等
- 证据：
  - `backend/src/services/courseSpaceService.js:267-273` 没有从搜索中返回 `courses`。
  - `js/courseSpaceUI.js:164-173` 调用了 `renderCourses(data.courses || [])`。
- 问题：第一次搜索后，课程选择器仅以“全部课程”选项重新构建。
- 影响：用户会丢失已选择的课程筛选；后续搜索将在所有课程中进行。
- 建议：在 UI 状态中保留所选课程，或在搜索响应中返回当前课程的元数据。
- 冻结影响：非阻塞，但应在小的第 24 阶段强化更改中修复。

## F-003 课程删除未能调节课程空间

- 严重性：低
- 证据：
  - `backend/schema.sql:52-99` 将 `course_id` 作为文本使用，而没有指向课程系统的外键。
  - 课程系统的课程存储在 `user_data` JSON 中。
- 问题：从课程系统中删除课程不会删除或标记课程空间的记录。
- 影响：课程空间可能保留已不存在课程的记录。
- 建议：定义对账或生命周期策略，例如清理、归档或明确的孤立状态。
- 冻结影响：非阻塞。

## F-004 赛道空间表没有专门索引

- 严重性：低
- 证据：`backend/schema.sql:52-99`。
- 问题：常见的`user_id`、`course_id`以及有序读取路径没有明确的索引。
- 影响：随着知识量的增加，全表扫描可能会出现。
- 建议：在实现分页时，为所有者/课程/查询路径添加索引。
- 冻结影响：非阻塞。

## F-005 小规模服务清理

- 严重程度：低
- 证据：[[代码0]]。
- 问题：`boundedConfidenceNumber` 未被使用。
- 影响：仅限本地死代码。
- 建议：在后续整理时删除，或如有需要使用数值置信模型。
- 冰冻冲击：不格挡。

## F-006 无更新/删除生命周期

- 严重程度：信息
- 证据：[[代码0]]。
- 观察：只有创建/阅读/搜索存在。
- 影响：对基础来说可以接受，但未来的生命周期需要更新、删除、版本管理和审查工作流程。
- 建议：在后续阶段添加生命周期API，并进行所有者和引用完整性测试。

## F-007可选边界文件缺失

- 严重性：信息
- 证据：`docs/AI_MEMORY_FEEDBACK_BOUNDARIES.md` 不存在。
- 观察：边界信息已在架构 v1.1 和 Phase 23.x 稳定性报告中提供。
- 影响：仅影响文档可发现性。
- 建议：可选择稍后将 Memory/CoachMemory/Feedback 边界合并到专门文档中。

# 24. 范围蔓延审计

在第24阶段的生产文件中搜索未发现任何隐藏实现:

- 个人学习代理，
- 策划者，
- 自适应学习规划，
- 自主行动，
- 学生知识州，
- 完整考试情报，
- AI导师，
- 或多智能体编排。

范围仅限于课程空间、文档、知识节点、关系、证据、有限搜索，以及一个最小的只读用户界面。

未发现范围蔓延。

# 25. 最终裁决

```text
Critical: 0
High: 0
Medium: 2
Low: 3
Info: 2
Architecture Violations: 0
Security Blockers: 0
Regression: 0
Build: PASS
```

这两个中等风险的发现是非阻塞性的质量和有界性问题，而不是架构或安全违规问题。

```text
Final Verdict:
READY_TO_FREEZE
```
