# 第24阶段 课程空间与知识库基础

## 1. 目标

第24阶段建立了个人学习代理架构v1.1所需的课程空间和知识库基础。

此阶段故意排除：

- 完整的代理行为，
- 计划，
- 自主行动，
- 学生知识状态，
- 考试智能，
- 知识提取，
- AI生成的盲写，
- 以及多代理协同。

## 2. 冷启动审计

- 基线：`7f95cde docs: freeze personal learning agent architecture v1.1`
- 工作树：除现有临时媒体目录外，其他都是干净的。
- 现有的课程系统2.0保持只读且未被修改。
- 现有的`courses[]`、进度、进度、进度、分析、CGStore、目标和同步行为均未变。
- 架构 v1.1 要求课程知识与课程系统分离，且独立于 `chenguangData`。

## 3. 数据模型

### 课程空间文档

```text
Document
  id
  user_id
  course_id
  title
  content
  source_url
  version
  created_at
  updated_at
```

文档是用户拥有的课程产物。它们不是课程表的行，也不能替代课程进度。

### 知识节点

```text
KnowledgeNode
  id
  user_id
  course_id
  title
  kind
  definition
  status
  confidence
  version
  created_at
  updated_at
```

允许的种类：`concept`、`definition`、`principle`、`procedure`、`formula`、`example`、`skill`。

允许的状态：`candidate`，`validated`，`accepted`。

允许置信度：`high`、`medium`、`low`。

### 知识关系

```text
KnowledgeRelation
  id
  user_id
  course_id
  source_node_id
  target_node_id
  relation_type
  version
  created_at
```

允许的关系：`prerequisite`、`depends_on`、`part_of`、`related_to`、`contrasts_with`、`example_of`、`applies_to`。

关系会根据同一用户和课程拥有的节点进行验证。

### 证据

```text
Evidence
  id
  user_id
  course_id
  document_id
  node_id
  quote
  locator
  version
  created_at
```

证据总是可以追溯到同一用户和课程拥有的文档和知识节点。

## 4.持久性边界

Added four separate SQLite tables:

```text
course_space_documents
course_space_nodes
course_space_relations
course_space_evidence
```

这些表格故意与`user_data`和`chenguangData`分开。

现有的同步协议保持不变。课程知识未添加到 `PAYLOAD_KEYS`、`CGStore`、分析、目标或 AI 上下文中。

## 5. API 边界

新增认证课程空间API：

```text
GET    /api/course-space
GET    /api/course-space/search
POST   /api/course-space/documents
POST   /api/course-space/nodes
POST   /api/course-space/relations
POST   /api/course-space/evidence
```

安全规则：

- 需要 JWT 认证。
- 每一行都绑定到 `user_id`。
- `courseId` 必须属于已认证用户现有的 `courses[]`。
- 节点和文档引用必须具有相同的所有者和课程。
- 关系类型和节点类型在允许列表中。
- 文本字段有长度限制。
- URL is limited to `http` and `https`.
- Search restrictions are governed by `1..50`.
- 写入端点使用现有的写入限制器和 CSRF 保护。

## 6.回收基金会

实现了确定性、具所有权意识的搜索，针对以下内容：

```text
KnowledgeNode.title
KnowledgeNode.definition
Document.title
Document.content
Evidence.quote
Evidence.locator
```

当前的检索是基于SQL的并且是有界的。它不使用向量数据库，也不声称具有语义理解能力。

## 7. 前端服务和用户界面

补充：

```text
js/courseSpaceService.js
js/courseSpaceUI.js
```

该用户界面以最小的只读课程空间卡片形式挂载在现有的工作台课程视图中。

它支持：

- 课程选择，
- 有界知识搜索，
- 知识快照计数，
- KnowledgeNode 预览，
- 文档预览，
- 证据预览，
- 加载状态，
- 空状态，
- 以及友好错误状态。

用户界面不会直接调用 `fetch`。它使用共享的 `CGAPI.courseSpace` 客户端。

## 8. 课程系统边界

现有课程系统仍负责：

```text
course identity
schedule
progress
```

课程空间仍然负责：

```text
documents
knowledge nodes
relations
evidence
```

这两个系统仅通过`courseId`连接，该代码会根据用户现有的课程列表进行验证。

## 9. 架构合规性

| 架构规则 | 状态 |
| --- | --- |
| 与课程系统分离的课程知识 | 通过 |
| 向量索引前的结构化知识模型 | 通过 |
| 没有新的第二用户数据存储 | 通过 |
| 现有同步协议保持不变 | 通过 |
| 分析保持不变且仍为规范 | 通过 |
| 目标保持不变 | 通过 |
|CGStore 保持不变 |通过 |
| 每个 API 路径强制执行所有权 | 通过 |
| 证据引用已验证 | 通过 |
| 检索有界且来源可归属 | 通过 |
| 无规划器 / 代理 / 自主操作 | 通过 |

## 10. 测试策略

新增后端测试：

```text
backend/test/courseSpace.test.js
```

覆盖范围：

- 认证，
- 文档创建，
- 知识节点创建，
- 知识关系创建，
- 证据创建，
- 快照检索，
- 有界搜索，
- 无效的关系类型，
- 无效的课程所有权，
- 跨用户隔离，
- 以及无效的外部引用。

已添加前端测试：

```text
tests/courseSpaceUI.test.js
```

覆盖范围：

- 共享 API 客户端使用，
- 快照规范化，
- 知识呈现，
- 课程呈现，
- 搜索加载状态，
- 证据呈现，
- 和安全错误行为。

## 11. 回归结果

```yaml
Frontend:
  584/584 PASS

Backend:
  88/88 PASS

Build:
  PASS

git diff --check:
  PASS
```

未发现新的回归问题。

## 12. 浏览器接受度

通过 Playwright 执行了本地 Chromium 烟雾测试验证：

| 视口 | 结果 | 水平滚动 | 课程空间可见 | 页面错误 |
| --- | ---: | ---: | ---: | ---: |
| 1920×1080 | 通过 | 否 | 是 | 0 |
| 375×812 | 通过 | 否 | 是 | 0 |

The seed smoke test verified that Course Space could render the course selector and `Closure` KnowledgeNode.

## 13. 更改的文件

| 文件 | 变更 |
| --- | --- |
| `backend/schema.sql` | 添加了四个课程空间表 |
| `backend/src/db/courseSpaceModel.js` | 添加了持久化模型 |
| `backend/src/services/courseSpaceService.js` | 添加了验证、所有权、创建、快照和搜索 |
| `backend/src/routes/courseSpace.js` | Added Course Space API |
| `backend/src/routes/index.js` | Mounted `/api/course-space` |
| `backend/test/courseSpace.test.js` | Added backend tests |
| `js/apiClient.js` | 添加了共享的课程空间客户端 |
| `js/courseSpaceService.js` | 添加了前端服务层 |
| `js/courseSpaceUI.js` | Added read-only UI component |
| `pages/workbench.js` | 在课程视图中挂载了课程空间 |
| `tests/courseSpaceUI.test.js` | 添加了前端测试 |
| `docs/PHASE_24_COURSE_SPACE_FOUNDATION_FINAL.md` | 添加了阶段报告 |

## 14.已知的局限性

- 文档、节点、关系和证据的创建仅限于 API；此阶段故意不包含创建 UI。
- 检索基于关键词/子字符串，而非语义。
- 没有编辑、删除、迁移、导入、提取或审核工作流。
- 没有学生知识状态。
- 此阶段没有 AI 集成。
- 没有代理上下文集成。

这些限制是有意的，属于后期阶段。

## 15. 阶段决策

```text
Phase 24:
READY / FROZEN CANDIDATE

Course Space & Knowledge Base Foundation:
COMPLETE
```
