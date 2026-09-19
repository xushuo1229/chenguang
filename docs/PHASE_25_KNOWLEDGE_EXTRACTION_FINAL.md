# 第25阶段 知识提取终稿

# 1. 目标

第25阶段在冻结的第24阶段课程空间基础上增加了一个有界的、可加的知识提取管道。AI 输出被视为仅供审查的证据。它从不直接编写知识节点。

# 2. 建筑

```text
Document
  → ExtractionJob
  → AI Extraction Provider
  → KnowledgeCandidate
  → Evidence
  → User Review
  → Accepted KnowledgeNode
```

# 3. 数据模型

- `course_space_extraction_jobs` 记录文档版本、SHA-256 内容哈希、提供者、模型、提示版本、状态以及安全失败代码。
- `course_space_knowledge_candidates` 记录 AI 标题/内容、置信度、生命周期状态及保留的原始输出。
- 附加列：
  - `course_space_nodes.source_candidate_id`
  - `course_space_evidence.candidate_id`

候选人状态是 `pending`、`accepted` 和 `rejected`。职位状态是 `queued`、`running`、`completed`、`failed` 和 `cancelled`。

# 4. 提取管道

该服务加载权威文档，验证课程所有权，创建排队作业，运行可注入提供程序，验证所有候选者，保存带有证据的候选者，然后完成或安全地失败作业。

# 5. 提供者抽象

`knowledgeExtractionProvider.js` 重用了与 OpenAI 兼容的提供者抽象。它以 JSON 数据发送文档数据，要求 JSON 输出，限制输出令牌数量，并将提供者失败映射为安全错误。测试中注入了一个假提供者。

# 6. 候选人生命周期

```text
AI output → pending → accepted / rejected
```

原始 AI 文本保持不变。接受者可以编辑实际化的标题/内容，但原始值仍可追踪。

# 7. 证据模型

每个候选项都会收到一行证据，指向其源文档和版本。证据最初有`node_id=''`；接受时会将其更新为物化节点。

# 8. 信心模型

人工智能信心是从0到1的有限数值。被接受的节点使用确定性阈值获得`high`、`medium`或`low`的信心。

# 9. 审查模型

只有待处理的候选人可以被接受或拒绝。接受会创建一个带有`source_candidate_id`的知识节点。拒绝会保留候选人并且不会创建节点。

# 10. API

```text
POST /api/course-space/extraction/jobs
GET  /api/course-space/extraction/jobs
GET  /api/course-space/extraction/jobs/:id
POST /api/course-space/extraction/jobs/:id/cancel
GET  /api/course-space/extraction/candidates
GET  /api/course-space/extraction/candidates/:id/evidence
POST /api/course-space/extraction/candidates/:id/review
POST /api/course-space/extraction/candidates/:id/accept
POST /api/course-space/extraction/candidates/:id/reject
```

# 11. 授权

所有路由都需要 JWT 身份验证。服务操作执行 `userId`，并包含拥有的课程、文档、工作和候选人关系。进行了跨用户和跨课程访问的测试。

# 12. 安全

- 提供者输出经过模式验证并有界。
- 提供者/内部错误不会被暴露。
- 用户数据以 `textContent` 呈现。
- AI 无法绕过用户审查。
- 所有权无法从客户端有效负载提供。

# 13. 幂等性

同一用户、文档、版本、内容哈希、提供者、模型和提示版本会返回现有的活跃/已完成作业，除非明确请求重新提取。失败和取消的作业可以重试。

# 14. 极限

```yaml
extractionInput: 20000 chars
candidatesPerJob: 10
candidateTitle: 200 chars
candidateContent: 5000 chars
evidenceExcerpt: 2000 chars
evidenceLocator: 500 chars
pageSizeDefault: 20
pageSizeMax: 50
```

超大型文档会因 `DOCUMENT_TOO_LARGE` 而失败；它们不会被悄悄截断。

# 15. UI

课程视图增加了一个由服务层支持的最小提取卡。它提供课程/文档选择、加载、空状态、成功和友好错误状态。它从不直接调用 `fetch`，也不会引入第二个数据系统。

# 16. 测试

后端生命周期测试涵盖候选人创建、证据关联、接受物实现、幂等性、所有权隔离、超大文档、格式错误的提供者输出、候选人限制、置信度验证以及安全失败消息。

前端测试涵盖安全渲染、作业/空状态、加载、作业创建、接受以及友好错误。

# 17. 浏览器验证

在 1920×1080 和 375×812 分辨率下使用 Chromium/Edge 进行烟雾测试通过。提取卡片已渲染，选择和生成操作正常，没有发现水平溢出，也没有出现未捕获的页面错误。临时控制台 404 错误仅限于模拟预览环境中的 favicon 请求。

# 18. 回归验证

```yaml
Frontend: 587/587 PASS
Backend: 93/93 PASS
Build: PASS
git diff --check: PASS
```

# 19. 已更改的文件

```text
backend/schema.sql
backend/src/db/index.js
backend/src/db/knowledgeExtractionModel.js
backend/src/services/knowledgeExtractionProvider.js
backend/src/services/knowledgeExtractionService.js
backend/src/routes/courseSpace.js
backend/test/knowledgeExtraction.test.js
js/apiClient.js
js/courseSpaceExtractionService.js
js/courseSpaceExtractionUI.js
pages/workbench.js
tests/courseSpaceExtractionUI.test.js
docs/PHASE_25_KNOWLEDGE_EXTRACTION_FINAL.md
```

# 20. Git 提交

`feat: add knowledge extraction pipeline`

# 21. 已知限制

- 提供者的执行与作业创建请求是同步的。
- 关系不会通过抽取生成。
- 向量搜索和语义排序仍属于未来阶段的工作。
- 重新抽取不会在文档之间去重概念。

# 22. 架构合规

通过。第24阶段课程空间仍然是源边界；候选者不是知识节点；分析、CGStore、同步、目标和反思未被修改；学生知识状态和个人学习代理未被实现。
