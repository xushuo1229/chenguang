# DR-1阶段报告

> 阶段：部署准备加固
> 基线：[[代码0]]
> 完工日期：2026-09-13
> 范围：仅限生产部署加固。未添加任何产品特性。

# 结果

* *通过 — 部署准备加固完成。**

前端测试、后端测试、生产构建、安全扫描、代码审查和回归测试全部通过。没有 P0 或 P1 代码问题遗留。剩余的操作风险记录如下。

# 已修改的文件

## API 基础

- `js/config/apiBase.js` —— 增加了API基础分辨率的唯一真实来源。
- `js/apiClient.js` —— 现在消耗共享的 API 基模块。
- `js/sync.js` —— 现在消耗相同的 API 基础模块。
- `index.html` / `login.html` — 移除硬编码的本地主机元值。
- `tests/apiBase.test.js` — 增加了生产、开发、HTML 元、无效元、规范化和所有权测试。

## PWA

- `manifest.json` — 新增可安装的网页应用清单。
- `vite.config.js` —— 从真实构建工件中发出 manifest 并生成服务工作者。
- `service-worker.js` —— 现在从生产构建中接收预缓存列表，而不是硬编码源路径。
- 所有应用页面——都会收到一个构建注入的`/manifest.json`链接。
- `tests/deployment.build.test.js` — 增加了对清单、服务工作者、哈希资产的生产工件测试，无源路径缓存条目，无本地主机和清单链接。

## 持续集成/持续部署

- `.github/workflows/deploy.yml` —— 重建流水线，安装→前端测试→后端测试→构建→部署。
- 当任何质量门步骤失败时，前端和后端部署都会被阻断。
- 后端部署现在针对渲染，并要求 `RENDER_DEPLOY_HOOK_URL` 密钥。

## Docker

- `backend/.dockerignore` — 排除 `.env`、SQLite 数据库/WAL/SHM 文件、Node 模块、日志和测试。
- `backend/Dockerfile` — 以非 root 用户运行，注入环境配置，定义持久的 `/app/data` 卷，并添加容器健康检查。

## 数据库部署

- `backend/render.yaml` — 在一个带有持久磁盘的 Render 实例上将 PostgreSQL 更改为 SQLite。
- `docs/DATABASE_DEPLOYMENT.md` — 记录了 MVP SQLite 策略、备份要求以及未来 PostgreSQL 迁移计划。

## SSRF 加固

- `backend/src/services/scheduleImportService.js` —— 现在拒绝内部主机名、localhost、私有 IPv4/IPv6、IPv4 映射 IPv6、链路本地、元数据和保留地址。
- DNS 在请求之前解析，并且每个重定向目标都会重新验证。
- 重定向跟随被替换为有界的手动重定向处理。
- `backend/test/scheduleImport.test.js` —— 为 localhost、内部域、私有 IPv4/IPv6、映射的 IPv6、公共字面量 IPv4 以及重定向重新验证添加了 SSRF 测试。

## 文档和测试卫生

- `docs/DEPLOYMENT_AUDIT.md` — 部署审计、风险和修复顺序。
- `tests/goals.page.test.js` — 在每个用例之前刷新挂起的存储写入，以防止跨测试定时器污染。

# 验证结果

| 检查 | 结果 |
|---|---|
| 前端测试 | **通过 — 286/286 测试, 15 个文件** |
| 后端测试 | **通过 — 58/58 测试, 19 个测试套件** |
| 生产构建 | **通过** |
| 构建产物检查 | **通过 — 已生成 `dist/manifest.json` 和 `dist/service-worker.js`** |
| 生产产物扫描 | **通过 — 未发现 `localhost`、API 密钥、JWT 秘钥、密码哈希、承载令牌或类 OpenAI 密钥模式** |
| Git 秘密扫描 | **通过 — 未跟踪真实 `.env` 或数据库文件；仅跟踪 `backend/.env.example`** |
| 代码审查 | **通过 — 未发现 P0/P1 问题** |
| 安全审查 | **通过 — 未发现 P0/P1 问题** |

# 安全审查摘要

## 已处理

- 生产前端不再包含 `localhost`。
- 生产 API 基础默认使用同源 `/api`。
- HTML `meta[name="api-base"]` 可以为自定义部署覆盖默认设置。
- Docker 默认不再包含本地密钥或 SQLite 文件。
- Docker 以非 root 的 `node` 用户身份运行，并提供健康检查。
- 计划导入现在会拒绝私有/内部目标，并重新检查重定向。
- 生产包中不包含后端密钥或密码哈希。

## 安全扫描详情

- Git 追踪的敏感文件扫描只找到了 `backend/.env.example`。
- 被忽略的敏感文件包括 `backend/.env`、`backend/chenguang.db`、`backend/chenguang.db-shm` 和 `backend/chenguang.db-wal`。
- 前端源代码和生产捆绑包扫描未发现API密钥、JWT秘密、密码哈希、OpenAI风格密钥或承载令牌。
- Docker守护进程未在评测机器上运行，因此未执行实时Docker镜像构建。通过`backend/.dockerignore`验证了Docker上下文排除，Git忽略状态。

# 代码审查摘要

没有P0或P1的发现残留。

审查确认：

- `js/apiClient.js` 和 `js/sync.js` 不再拥有独立的 API 基础逻辑。
- 生产工件 Service Worker 路径来自实际的 Vite 输出。
- CI 在部署前有明确的质量门控。
- SQLite 部署和运行时配置不再存在冲突。
- SSRF 验证涵盖初始 URL 和重定向目标。

# 剩余风险

这些是被接受的非阻塞风险，并不是新的功能工作：

1. **同源代理要求**
生产环境默认为 `/api`，因此部署必须在同一源上公开前端和后端，或将 `/api` 放在反向代理后面。

2. **需要 Render 密钥**
CI 后端部署需要 `RENDER_DEPLOY_HOOK_URL`。如果缺少该密钥，后端部署任务将安全失败。

3. **Docker 镜像未在本地构建**
Docker 守护进程不可用。静态 Docker 上下文加固和测试已通过，但实际的镜像构建应在 CI 或支持 Docker 的主机上运行。

4. **SQLite 仍然是单节点**
应用程序必须作为一个后端实例运行在一个持久磁盘上。水平扩展仍然需要PostgreSQL。

5. **JWT 仍基于 localStorage**
这是现有的 MVP 权衡。未来的加固阶段应考虑 HttpOnly 刷新/会话 cookie、令牌撤销、密码重置和账户删除。

6. **速率限制仍然在内存中**
对于单节点 SQLite 部署这是可以接受的，但多实例部署需要共享的 Redis 存储。

7. **可观测性最小**
在更广泛公开发布之前，仍建议进行集中错误跟踪、部署警报、备份警报和磁盘容量监控。
