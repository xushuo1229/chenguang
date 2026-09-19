# 第23.x阶段反思情境补救

# 1. 范围

此补救措施弥合了当前项目审计中发现的反射上下文所有权缺口。

该更改是附加的，并且仅限于 Reflection 请求路径。它不会更改 CGStore、Analytics、Goals、Sync、AIContext、GrowthContext、Today Plan 或 Reflection API 响应契约。

# 2. 之前

Reflection 端点信任客户端提交的行为事实：

```text
Client context
    ↓
POST /api/ai/reflection
    ↓
AI prompt
```

这允许恶意或过时的客户端负载声明诸如已完成的任务或学习时间等事实。

# 3. 之后

后端现在从认证用户的同步用户数据中推导出反射事实：

```text
req.userId
    ↓
user_data
    ↓
reflectionContextSource
    ↓
reflectionContext sanitizer
    ↓
Prompt Builder
    ↓
AI Service
```

客户端提供的`context.userNote`仍可作为用户提供的叙述性输入使用。它不被视为系统事实。客户端行为统计、版本字段、指令字段和元数据将被忽略。

响应现在记录：

```text
meta.contextSource = authenticated-authoritative
```

# 4. 推导事实

`backend/src/services/reflectionContextSource.js` 仅从 `user_data` 中推导有限的事实：

| 事实 | 来源收集 | 边界 |
| --- | --- | --- |
| 今日任务总数 / 已完成 / 待完成 / 完成率 | `todos[date = today]` | 仅今日 |
| 昨日未完成任务 | `todos[date = yesterday]` | 仅计数 |
| 专注分钟数 | `focus[date = today]` | 正数分钟总和 |
| 英语学习分钟数 | `english[date = today]` | 正数分钟总和 |
| 运动分钟数 | `sports[date = today]` | 正数时长总和 |
| 签到连续天数 | `checkins` | 有界日期计算 |
| 活跃目标 | `goals` | 仅计数 |

源不会推断未说明的行为。如果没有匹配的记录，则该事实为零或为空。

# 5. 安全控制

- 仍然需要身份验证。
- `req.userId` 是唯一的所有权来源。
- 不信任客户端行为事实。
- 上下文以数据形式输入提示，而不是系统指令。
- 上下文由现有的反射清理器允许列表且大小有限制。
- AI 输出仍然有界且安全可解析。

# 6. 测试证据

已更新并新增的测试涵盖：

- 恶意客户端任务总数将被忽略。
- 该路由报告权威的上下文所有权。
- 任务、专注、学习、锻炼、连续记录和目标数据由服务器端生成。
- 空记录或未知记录会产生零数据，而不是推断行为。

# 7. 边界声明

反思事实来源于服务器的 CGStore 支持的用户数据。用户笔记是明确的用户输入。AI 输出是明确的 AI 生成。这三类在反思提示中保持分离。
