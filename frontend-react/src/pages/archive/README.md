# Archive

冻结的早期设计探索页面，保留作为未来 Zeno 产品方向参考：

- `LandingPage.tsx` — 品牌落地页与登录入口
- `AnalyticsPage.tsx` — 趋势、能力与知识覆盖
- `ProfilePage.tsx` — 目标、特征与记忆

`legacy/` 为 Phase 39 首批 React 页面，在 Phase 40 agent-first IA 重构后被 `features/` 下实现取代：

- `AgentPage.tsx`、`DashboardPage.tsx`、`SettingsPage.tsx` — 旧路由页面
- `WorkspaceLayout.tsx`、`Sidebar.tsx`、`MobileNav.tsx` — 旧工作台骨架（现用 `layouts/AppShellLayout.tsx` 与 `components/shell/`）
- `AgentComposer.tsx`、`MessageCard.tsx` — 旧对话组件（现用 `features/agent/`）

这些文件不参与 TypeScript 编译（`tsconfig.json` 已 `exclude` 本目录）与生产构建；文件内导入路径仍为迁移前的旧路径（如 `@/components/UI/...`），恢复使用前需先更新导入与数据依赖。
