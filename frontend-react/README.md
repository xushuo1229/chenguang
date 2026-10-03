# Zeno React Frontend

Zeno AI Workspace 的前端工程：React + TypeScript + Vite，Tailwind CSS v4、
shadcn/ui 风格原语、Framer Motion、TanStack Query、React Router、Tremor。

本工程与根目录旧 MPA **并存**：旧 MPA 保持生产稳定，本工程是明确授权的新前端。
不修改后端 / API / 数据库 / 同步协议；所有数据经后端 `/api` 读写。

## 快速开始

先启动后端（另开终端）：

```bash
cd backend
cp .env.example .env   # 填入 JWT_SECRET；AI 为可选项
npm install
npm run start          # http://localhost:3000
```

再启动前端：

```bash
cd frontend-react
npm install
cp .env.example .env.local
npm run dev            # http://localhost:5174 （/api 代理到 3000）
```

在登录页注册一个账号即可使用；数据是该账号在后端的真实数据，初始为空状态。

## 环境变量

见 `.env.example`。仅两个 `VITE_` 变量：

- `VITE_API_BASE_URL`：默认 `/api`，开发经 Vite 代理，生产同源托管时无需改。
- `VITE_MOCK_ENABLED`：仅本地演示用，默认 `false`；切勿在真实联调/生产中开启。

## 常用命令

```bash
npm run dev         # 开发服务器
npm run typecheck   # tsc --noEmit
npm run build       # 类型检查 + 生产构建到 dist/
npm run preview     # 预览构建产物
npm run test:web    # Playwright 核心流验收（自动 build + 拉起 preview）
```

## 生产部署（同源，推荐）

后端可直接托管本工程构建产物，避免跨域：

```bash
npm run build                          # 产出 frontend-react/dist
# 在 backend/.env 设置（路径相对 backend 工作目录）：
#   STATIC_DIR=../frontend-react/dist
#   CORS_ORIGIN=https://你的域名
```

后端会对未命中的路由回退到 `index.html`，由 React Router 接管。
跨域部署时把 `VITE_API_BASE_URL` 指向 API 完整域名，并在后端 `CORS_ORIGIN` 放行前端域名。

## 架构

```text
src/
  app/         Provider、路由表、受保护路由
  layouts/     AuthLayout / WorkspaceLayout
  pages/       Dashboard / Knowledge / Analytics / Agent / Settings / Login
               archive/ 为冻结设计资产，不参与编译
  components/  ui 原语、layout、agent、dashboard、command
  features/    按领域聚合（snapshot、analytics、knowledge、quickLog…）
  services/    唯一网络边界：apiClient（{ data } 信封、JWT Bearer、超时/401）
  stores/      React Context（auth、theme）
  mocks/       仅 VITE_MOCK_ENABLED=true 时启用的 MSW
```

- 数据：`useSnapshot()` 读取 `GET /api/data`；所有写入经 `useUpdateSnapshot()`
  乐观更新 `PUT /api/data`，冲突返回 409 时回滚并重同步。
- 会话：独立使用 `localStorage` 键 `zeno_auth`，绝不读写旧 MPA 的
  `cg_token` / `cg_user`；JWT 支持滑动续期，401 自动登出。
- AI：Agent 页 Personal（带学习上下文）/ General（不访问个人数据）共用后端
  代理；AI 只读，任何写操作都需用户确认。

## 边界

- 不修改后端、API、数据库、CGStore 与数据协议。
- 不在本工程引入第二套网络/状态/组件体系。
- 页面与组件遵循 Zeno Enterprise（Quiet Precision）设计规范。
