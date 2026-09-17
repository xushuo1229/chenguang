# Phase 25 Knowledge Extraction Hardening Final

## Status

READY_FOR_INDEPENDENT_REAUDIT

## Scope

本阶段只处理 Phase 25 Independent Re-Audit 中的 F-001 至 F-007。未修复 F-008、F-009、F-010，也未修改无关功能。

## Findings Closure

| Finding | 状态 | 处理结果 |
| --- | --- | --- |
| F-001 Duplicate acceptance | FIXED | 候选接受流程先在 SQLite 事务内原子抢占 `pending` 状态，并通过唯一部分索引防止同一 source candidate 生成多个 Knowledge Node。 |
| F-002 Review UI evidence | FIXED | 审核卡片展示来源文档、文档版本、定位、证据引文、验证状态；支持编辑标题/内容后接受，也支持拒绝。 |
| F-003 Atomic persistence | FIXED | 提取候选、证据和任务完成状态写入同一 SQLite transaction；接受流程生成节点与绑定证据也在同一 transaction。 |
| F-004 Evidence verification | FIXED | 提取时将证据引文与文档内容做大小写与空白归一化比对，并持久化为 `verified` 或 `unverified`。 |
| F-005 Confidence validation | FIXED | Confidence 只接受 Number 类型的有限数值，范围限定 0-1；null、undefined、字符串和无限值都会失败。 |
| F-006 Bounded evidence query | FIXED | 证据查询改为 SQL 层按 `user_id` 与 `candidate_id` 过滤，并强制 `LIMIT`。 |
| F-007 Regression coverage | FIXED | 后端与前端补充事务、重复接受、证据校验、置信度、所有权、有限查询和审核 UI 回归。 |

## Implementation Summary

### Backend

- `backend/schema.sql`
  - `course_space_evidence.verification_status` 增加 `verified` / `unverified` 事实来源字段。
  - 增加 `uq_course_space_nodes_source_candidate` 唯一部分索引。
- `backend/src/db/index.js`
  - 为既有 SQLite 数据库补充验证状态列和唯一索引迁移。
- `backend/src/db/knowledgeExtractionModel.js`
  - 新增 `persistExtractionOutput`、`materializeAcceptedCandidate` 和 `listEvidenceByCandidate`。
  - 使用 SQLite transaction 保证提取持久化与接受物化的原子性。
- `backend/src/services/knowledgeExtractionService.js`
  - 提取输出统一进入事务持久化。
  - 增加严格 confidence 校验。
  - 增加证据来源校验。
  - 接受候选时通过原子事务生成并绑定 Knowledge Node。
  - 重复接受返回 API conflict。
  - 候选证据查询改为有界 SQL 查询。

### Frontend

- `js/apiClient.js`
  - 新增候选证据 API 封装。
- `js/courseSpaceExtractionService.js`
  - 聚合待审核候选及其有界证据数据。
- `js/courseSpaceExtractionUI.js`
  - 审核卡片展示完整证据上下文。
  - 支持编辑标题与内容后接受候选。
  - 支持拒绝候选。
  - 修复文档快照标题映射。

## Verification

```yaml
Backend:
  command: npm test
  result: PASS
  tests: 96/96

Frontend:
  command: npm test
  result: PASS
  tests: 588/588

Build:
  command: npm run build
  result: PASS

Browser:
  result: PASS
  Desktop 1920x1080: PASS
  Mobile 375x812: PASS

git diff --check:
  result: PASS
```

浏览器验收基于生产构建预览服务，验证了 Knowledge Extraction 卡片加载、无 page error、无 HTTP 4xx/5xx、无横向溢出，以及课程/文档选择与提取请求流程。

## Remaining Deferred Findings

以下问题保持独立记录，不在本阶段扩大范围：

- F-008: unbounded snapshot retrieval
- F-009: search response resets course selector
- F-010: course deletion reconciliation、missing indexes、minor dead code 等低风险项

## Out of Scope

- 未修改 CGStore、Analytics、Goals、Sync、AI Context、Growth Context、Today Plan。
- 未修改 MPA Shell。
- 未处理仓库中既有的 `docs/*.md` 翻译改动。
- 未处理临时浏览器、截图和视频目录。

## Final Status

READY_FOR_INDEPENDENT_REAUDIT
