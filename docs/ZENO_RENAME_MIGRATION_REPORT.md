# Zeno Rename Migration Report

## Scope

本次执行的是品牌迁移，不是数据模型或 API 迁移。

产品品牌已从「知行 / 晨光自律台」迁移为：

```text
Zeno
Personal Learning Agent
Personal Learning Agent Operating System
```

## Updated Surfaces

| 区域 | 更新内容 |
| --- | --- |
| Landing / Login | 标题、meta、Hero、注册登录文案、Footer、插画 alt |
| MPA Shell | index / login / workbench / stats / goals / today / ai / agent-home 的品牌标识与用户可见文案 |
| React Workspace | Workspace sidebar、Landing、页面标题、品牌副标题 |
| Agent | AI 教练 / AI Coach 文案统一为 Zeno Learning Agent / Learning Agent |
| PWA | manifest name / short_name / description |
| Assets | logo / logo-dark / logo-icon / Agent 插画的品牌标签 |
| Backend | 启动横幅、Prompt 中的 Agent 身份、README、package description |
| Package | root / backend / React package name 与 description |
| Docs | README 与当前迁移报告更新为 Zeno 定位 |

## Preserved Compatibility

以下内容保持不变，以保护已有用户数据、认证状态与运行时协议：

```text
chenguangData
cg_token
cg_user
chenguang:update
chenguang:auth-changed
chenguang.db
CGStore
Analytics
Sync
JWT auth
API routes
API payloads
database schema
```

`ChenguangData`、`chenguang-*`、Docker/Render 内部标识与部分历史文档保留为兼容层或历史记录，不属于用户可见品牌。

## Verification

```yaml
Frontend tests: 631/631 PASS
Backend tests: 321/321 PASS
Frontend MPA build: PASS
React build + typecheck: PASS
Browser desktop 1920x1080: PASS
Browser login flow: PASS
Session token/user: PASS
Horizontal overflow: 0
Console errors: 0
Page errors: 0
Failed requests: 0
```

## Migration Status

```text
READY
```
