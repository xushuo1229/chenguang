# Zeno 企业级部署与运维手册

面向把 Zeno React 工作区正式交给真实用户使用的运维清单。
约定：不改动既有 API 契约；密钥只通过环境变量注入，绝不入库（`.env` 已 gitignore）。

## 1. 推荐架构（单实例同源）

```
浏览器 ── HTTPS(443) ── 反向代理(Nginx/Caddy, TLS 终止)
                              └── Node 后端 :3000（同时托管 frontend-react/dist 与 /api）
                                     └── SQLite(backend/chenguang.db, WAL)
```

- 后端同源托管前端：构建 `cd frontend-react && npm ci && npm run build`，
  在 `backend/.env` 设 `STATIC_DIR=../frontend-react/dist`，未命中路由自动回退 `index.html`。
- 反向代理负责 HTTPS、`X-Forwarded-*`（后端已 `trust proxy=1`，限流按真实 IP）。
- 进程守护：Windows 用 NSSM/任务计划；Linux 用 systemd 或 PM2。

## 2. 必须注入的环境变量（生产）

| 变量 | 说明 |
| --- | --- |
| `NODE_ENV=production` | 开启生产必填校验 |
| `JWT_SECRET` | 用 `openssl rand -hex 48` 生成，勿用默认值 |
| `CORS_ORIGIN` | 前端完整来源；同源托管仍建议显式填写 https 域名 |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | 主模型凭据 |
| `AI_FALLBACK_API_KEY` / `AI_FALLBACK_BASE_URL` / `AI_FALLBACK_MODEL` | 备用凭据，主 key 429/401/5xx 自动切换 |
| `ALLOW_REGISTRATION` | `false` 关闭公开注册 |
| `ADMIN_EMAILS` | 管理员邮箱，逗号分隔，启动时授予 `is_admin` |
| `PUBLIC_APP_URL` | 邮件重置/验证链接的站点基址（https 域名） |
| `SMTP_*` | 配置后真发邮件；未配置时链接只打印在后端日志 |
| `REQUIRE_EMAIL_VERIFICATION` | 配置 SMTP 后置 `true` 强制邮箱验证 |
| `SENTRY_DSN` | 可选；设置并安装 `@sentry/node` 后自动上报 |

完整列表见 `backend/.env.example`。

## 3. 数据备份与恢复

- 在线一致性备份（WAL 安全，备份期间不中断服务）：
  - `cd backend && npm run backup`
  - 产出 `backups/chenguang-<时间戳>.db`，默认保留 14 份（`BACKUP_KEEP` 可调）。
- 计划任务：Linux cron 每 6 小时 `0 0,6,12,18 * * * cd /app/backend && node scripts/backup.cjs`；
  Windows 用“任务计划程序”同等频率执行。
- 恢复：停服 → 用目标备份覆盖 `chenguang.db`（同时移除 `-wal/-shm`）→ 启服；
  启动时迁移是幂等加法迁移，不会破坏既有数据。
- 升级：schema 变更统一走 `src/db/migrate.js` 的幂等迁移与 `PRAGMA user_version`，
  禁止手工改线上表结构。

## 4. AI 配额与故障转移

- 后端在主凭据命中 429/401/403/404/5xx/超时/网络错误时，按序切换到备用凭据；
  故障凭据进入短期冷却（429 默认 60s，鉴权类 5 分钟）。
- 建议主、备使用不同账号/套餐，避免同一账号额度共享导致同时 429。
- 管理员可通过 `GET /api/ops/metrics` 查看各凭据冷却状态与进程指标。

## 5. 可观测性

- `GET /api/health`：存活探针。
- `GET /api/ops/metrics`（仅管理员）：请求量、状态码分布、路由耗时、内存、
  最近前端错误，以及 AI 凭据健康。
- 前端崩溃经 `ErrorBoundary` 上报 `POST /api/ops/client-errors`（限流、字段截断）。
- 设置 `SENTRY_DSN` 并 `npm i @sentry/node` 后，5xx 自动转发 Sentry；未安装依赖时降级为结构化日志。
- 建议外部接：日志收集、进程重启告警、磁盘与备份成功率告警。

## 6. 账号体系

- 忘记密码：登录页「忘记密码？」→ 邮件链接 → `/reset-password`，重置后所有设备失效。
- 邮箱验证：注册即发邮件；`/verify-email` 完成验证（默认不强制，配好 SMTP 再开启）。
- 登出所有设备：设置页一键吊销；后端通过用户 `token_version` 让旧 JWT 立即失效。
- 后台：`is_admin` 账号侧栏出现 Admin，`GET /api/admin/users` 只读用户列表。

## 7. 有意延后的两项协议级改造（需单独立项）

1. **httpOnly Cookie 会话**：当前 JWT 存 `localStorage`（独立键 `zeno_auth`）。
   迁移到 httpOnly + SameSite Cookie 会改变登录响应与鉴权读取方式，属认证协议变更，
   需配合 CSRF 策略与前端会话层一起改，建议独立阶段、灰度双跑后再切换。
2. **AI 流式输出（SSE）**：当前为一次性请求 + 60s 超时；改造为 SSE 会调整
   `/personal-agent/chat` 的响应形态与前端渲染。建议在独立阶段实现，避免与既有错误/限流契约耦合。

前端性能：Tremor 仅在 Analytics 懒加载分块中引入，首屏不加载该 666KB 包。
