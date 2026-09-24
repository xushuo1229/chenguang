# Zeno React Frontend

Zeno AI Workspace 的增量前端工程：React + TypeScript + Vite，Tailwind CSS、shadcn/ui 与 Framer Motion。

本工程不替代根目录旧 MPA，不修改后端；旧 MPA 仍是当前唯一生产前端。

## Commands

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # tsc --noEmit && vite build
npm run typecheck
```

开发服务器把 `/api` 代理到 `http://localhost:3000`，可用 `VITE_API_BASE_URL` 覆盖。

## Structure

```text
src/
  pages/       页面（archive/ 为冻结设计资产，不参与编译）
  layouts/     AuthLayout / WorkspaceLayout
  components/  ui（shadcn 风格原语）、layout、agent、dashboard
  services/    数据边界；当前为 mock 实现，apiClient 保留真实 API 契约
  stores/      React Context 会话状态
  mocks/       mock 数据
  app/         Provider、路由表、受保护路由
```

## Mock Phase

- 当前所有数据来自 `src/mocks`，不发送业务网络请求。
- mock 会话仅使用 `localStorage` 键 `zeno_mock_session`，绝不读写旧 MPA 的 `cg_token` / `cg_user`。
- 未来切换真实 API 时，仅替换 services 实现（真实接口为 `{ success, data }` 信封、JWT Bearer），页面结构不变。
