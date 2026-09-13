# 晨光自律台 · Beta Metrics Plan

> 阶段：REAL-BETA-OPS  
> 目标：在不新增埋点系统、不改数据库模型的前提下，用现有 SQLite 快照、服务器日志和人工反馈建立最小可观测方案。  
> 隐私原则：对外报告只使用匿名编号和聚合数字；不记录、不展示邮箱、密码、Token 或用户内容。

## 1. 数据来源

| 来源 | 用途 | 说明 |
|---|---|---|
| `users` | 注册人数、测试周期起点 | 只取 `id`、`created_at` |
| `user_data` | 目标、记录、回访和参与度 | 只读取现有 JSON 快照，不新增表 |
| 服务器日志 | AI 调用次数、HTTP 错误 | 只统计状态码和接口，不保存用户内容 |
| `BETA_FEEDBACK_TEMPLATE.md` | 主观价值、困惑、停用原因 | 按匿名编号整理 |

当前产品没有事件埋点系统，因此不在本轮引入新埋点架构。

## 2. 指标口径

### Activation

| 指标 | 口径 |
|---|---|
| 注册用户数 | Beta 窗口内 `users.created_at` 的新账号数 |
| 首次创建目标比例 | 最新 `user_data.payload.goals.length > 0` 的用户数 / 注册用户数 |
| 首次记录比例 | 最新快照中至少有一条带日期行为记录的用户数 / 注册用户数 |

行为记录集合包括：`checkins`、`sports`、`readings`、`english`、`todos`、`focus`。

### Retention

| 指标 | 口径 |
|---|---|
| 次日回访 | 从首个行为记录日期起，D+1 存在行为记录的用户比例 |
| 7 日回访 | 从首个行为记录日期起，D+7 前至少再有一次行为记录的用户比例 |

限制：该口径只能观察“产生记录的回访”，不能识别“只打开产品但没有记录”的用户。  
补充：每日检查服务器访问日志中的页面请求数，作为辅助观察。

### Engagement

| 指标 | 口径 |
|---|---|
| 记录次数 | 最新快照中 `checkins + sports + readings + english + todos + focus` 的记录总数 |
| AI 调用次数 | 服务器日志中 `POST /api/ai/chat` 返回 200 的次数 |
| 目标完成次数 | 快照中 `status` 为 `completed` / `done` 的目标数；若产品未持久化该状态，则以人工核对为主 |
| 目标数量 | 最新快照中 `goals.length` 总数 |

## 3. 采集节奏

| 时间 | 动作 |
|---|---|
| D0 | 记录邀请人数、注册人数 |
| D1 | 导出指标，发送第一印象反馈模板 |
| D3 | 核对卡点、移动端问题和 AI 反馈 |
| D7 | 导出指标，收集中期反馈 |
| D14 | 导出最终指标，汇总去留判断 |

## 4. 运维命令

### 4.1 导出指标

```bash
cd backend
node scripts/betaOps.js metrics --db ./chenguang.db
```

输出为 JSON，只包含用户编号、匿名化后的聚合指标和日期摘要，不包含邮箱。

### 4.2 清理指定测试账号

```powershell
cd backend
$env:BETA_OPS_CONFIRM='YES'
node scripts/betaOps.js cleanup `
  --db .\chenguang.db `
  --email beta-01@example.com `
  --email beta-02@example.com `
  --yes
```

规则：

1. 只接受精确邮箱，不做模糊匹配。
2. 必须同时提供 `--yes` 和 `BETA_OPS_CONFIRM=YES`。
3. 若命令会删除数据库内全部用户，必须额外提供 `--allow-all`。
4. 删除用户时，通过既有外键级联删除对应的 `user_data`，不引入第二套数据清理逻辑。

## 5. 环境区分

| 环境 | `NODE_ENV` | 数据库 | JWT | CORS | 用途 |
|---|---|---|---|---|---|
| Development | `development` | `backend/chenguang.db` 或临时 DB | 可用开发默认 | 可为空 | 本机开发 |
| Beta | `production` | 独立 `BETA_DB_PATH` | 强随机独立密钥 | 精确前端域名 | 真实用户测试 |
| Production | `production` | 独立生产持久盘 | 强随机独立密钥 | 精确生产域名 | 正式运行 |

Beta 环境与生产环境必须使用不同的数据库路径和 `JWT_SECRET`。

## 6. 汇报格式

每日或阶段性报告只输出：

1. 注册人数 / 激活人数
2. 次日与 7 日回访人数
3. 总记录数 / 平均记录数
4. AI 调用数与异常数
5. P0 / P1 问题
6. 用户主动放弃原因 Top 3

