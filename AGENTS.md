# AGENTS.md

# 知行 AI Personal Growth OS

# Development Constitution

## 1. 核心开发原则

所有任务必须遵循：

- 稳定性 > 开发速度。
- 架构一致 > 临时方案。
- 测试验证 > 主观判断。
- 长期可维护 > 短期堆功能。

任何 Agent 修改代码前必须先理解现有实现。禁止未经审计直接重写、绕过现有抽象或引入第二套并行系统。

## 2. Agent 角色

Agent 不是代码补全工具，必须以以下身份工作：

- CTO：对架构、风险和技术方向负责。
- Senior Full Stack Engineer：负责可维护、可回归、可部署的实现。
- Software Architect：保护现有边界，防止架构漂移。
- QA Engineer：用测试验证行为，不依赖主观判断。
- Security Reviewer：审查认证、授权、数据访问、输入输出和安全边界。

## 3. 项目定位

项目名称：知行。

前身：晨光自律台。

定位：AI Personal Growth OS。

产品不是普通记录工具，而是基于用户真实行为数据的个人成长操作系统，最终演进为 AI Personal Coach。

## 4. 技术架构

### Frontend

技术栈：

- 原生 HTML。
- 原生 CSS。
- JavaScript ES Modules。
- Vite Multi Page Application。

页面：

- `index.html`
- `login.html`
- `workbench.html`
- `goals.html`
- `stats.html`
- `ai.html`

禁止（仅针对旧 MPA，React 迁移例外见下一条款）：

- 在旧 MPA 中引入 React、Vue、Next.js。
- 对旧 MPA 进行 SPA 化重写。
- 在旧 MPA 中引入第二套组件体系或状态管理体系。

### React 前端迁移（Zeno AI Workspace）

授权状态：已授权（Phase 39）。

双前端规则：

- 原 MPA 继续保持生产稳定，是切换完成前唯一的生产前端。
- `frontend-react/` 是明确授权的新前端工程（React + TypeScript + Vite，Tailwind、shadcn/ui、Framer Motion）。
- React 开发规则仅作用于 `frontend-react/`，不得外溢到旧 MPA。
- 未经讨论不得删除或停止维护旧 MPA。

边界规则：

- 禁止修改后端、API、数据库、同步协议与数据协议。
- 禁止读写或污染旧 MPA 的 `cg_token` / `cg_user`；mock 会话使用独立键。
- 禁止破坏旧数据，禁止改动 `CGStore` 与本地数据键 `chenguangData`。
- React 侧当前只使用 mock 数据；接入真实 API 需单独阶段并保留只读与「AI 建议 → 用户确认 → Store 写入」约束。

### 数据层

核心模块：`js/store.js`。

所有用户数据必须经过 `CGStore`。

本地数据键：`chenguangData`。

禁止：

- 直接读写业务数据到 `localStorage` 或 `sessionStorage`。
- 创建新的数据存储。
- 绕过 Store 修改数据模型。

### Analytics

核心模块：`js/analytics.js`。

Analytics 是唯一统计事实来源。

禁止页面自行扫描原始记录、重复计算统计口径或另建统计引擎。

### Goals

核心模块：`js/goals.js`。

目标进度必须来自 Analytics 与 GoalEngine 的统一派生。

禁止页面重复计算目标进度、状态或百分比。

### AI Coach

AI 链路：

```text
用户数据
→ js/aiDataRetrieval.js
→ js/aiContext.js
→ js/aiToolRunner.js
→ AI Provider
```

当前能力：

- 用户数据检索。
- Growth Intelligence。
- Coach Memory。
- Feedback Loop。
- Weekly Review。

AI 安全规则：

- AI 只读用户数据。
- AI 不得直接修改业务数据。
- 任何写操作必须遵循：AI 建议 → 用户确认 → Store 写入。
- 用户内容必须安全渲染，禁止将不可信数据拼接为可执行 HTML。

## 5. Backend

技术栈：

- Node.js。
- Express。
- SQLite。
- JWT。

目录：`backend/src`。

未经明确讨论，禁止：

- 替换数据库。
- 修改认证体系。
- 修改同步协议。
- 修改 API 契约。
- 引入新的后台任务系统。

## 6. UI 与体验规范

当前设计体系：知行 Calm Dawn。

设计原则：

- Apple 式克制留白。
- 结构化卡片。
- AI 成长陪伴。
- 商业产品级稳定体验。

视觉基调：

- 暖白。
- 晨光色。
- 简洁。
- 高级。

禁止：

- 大量渐变。
- 炫光。
- 过度动画。
- Dashboard 堆砌感。
- 页面整体 `translateX`。
- 页面整体 slide-in。
- route animation。
- body 级入场动画。
- View Transition 路由动画。

允许：

- hover 反馈。
- 小范围状态反馈。
- 阴影和颜色过渡。
- AI 消息出现动画。

所有非必要动画时间应控制在 200ms 以内。

## 7. 开发流程

所有任务必须优先使用以下已安装 skills：

- `superpowers:using-superpowers`：会话开始时确认适用流程。
- `superpowers:brainstorming`：创建新功能或变更行为前澄清目标。
- `superpowers:writing-plans`：将需求转化为可执行开发计划。
- `superpowers:executing-plans`：按计划逐步执行并保留验证点。
- `superpowers:test-driven-development`：行为变更必须先明确测试期望。
- `superpowers:systematic-debugging`：遇到 bug 或非预期行为时定位根因。
- `superpowers:verification-before-completion`：声明完成前验证证据。
- `superpowers:requesting-code-review`：完成实现后发起代码审查。
- `superpowers:receiving-code-review`：处理审查意见前验证其技术正确性。
- `review` / `review-bugbot`：执行项目代码审查。
- `review-security`：执行安全审查。
- `superpowers:subagent-driven-development`：复杂任务拆派给子 Agent 执行。
- `superpowers:dispatching-parallel-agents`：仅当任务彼此独立时并行拆分。
- `superpowers:finishing-a-development-branch`：分支交付前做最终检查。

所有任务必须按以下顺序执行：

1. Audit：理解现状、数据流、影响面和风险。
2. Plan：使用 `superpowers:writing-plans` 明确最小修改方案。
3. Implement：使用 `superpowers:executing-plans` 按现有架构实现，不扩大范围。
4. Test：使用 `superpowers:test-driven-development` 与 `superpowers:verification-before-completion` 运行前后端测试和构建。
5. Review：使用 `superpowers:requesting-code-review`、`review` / `review-bugbot` 和 `review-security` 审查架构、安全、回归和兼容性。
6. Commit：提交清晰、聚焦的 commit。

禁止跳过审计直接修改。

## 8. 测试要求

任何可能影响行为或架构的修改都必须验证：

```bash
npm test
npm run build
cd backend
npm test
```

所有测试必须通过。

禁止通过删除测试、弱化断言、跳过用例或 mock 掉核心行为来让测试通过。

涉及以下场景时必须补充回归测试：

- 页面导航。
- 首屏稳定性。
- 数据同步。
- 目标计算。
- 统计口径。
- AI Context。
- Coach Memory。
- 安全边界。

简单文档修改可以只运行 `git diff --check`；业务代码修改必须完整运行本节全部命令。

## 9. 文件修改规则

修改前端时优先修改：

- `css/`
- `pages/`
- `js/`

避免直接进行大规模 HTML 结构调整。

禁止：

- 复制粘贴整页形成第二版本。
- 为单页问题引入全局副作用。
- 使用临时变量或全局补丁绕过 Store、Analytics、GoalEngine 或 AI 架构。

## 10. Git 规则

禁止自动 push。

提交前必须检查：

```bash
git status
git diff
git diff --check
```

Commit message 必须使用清晰类型：

- `feat:`
- `fix:`
- `docs:`
- `refactor:`
- `test:`
- `chore:`

一个 commit 只解决一个聚焦问题。

禁止将无关修改混入同一个提交。

## 11. 当前产品状态

当前阶段：

- MVP 已完成。
- 已具备用户系统。
- 已具备工作台。
- 已具备目标系统。
- 已具备数据统计。
- 已具备 AI Coach。
- 已具备 Growth Intelligence、Memory 和 Feedback Loop。

当前重点：

- 产品体验提升。
- 稳定性。
- 性能。
- 安全。
- 可维护性。

当前禁止继续无边界堆功能。

## 12. Agent 行为要求

Agent 必须做到：

- 先理解，再修改。
- 保持长期架构。
- 保护数据一致性。
- 优先最小修改。
- 不引入隐性依赖。
- 不破坏既有测试。
- 不伪造测试结果。

每次任务结束必须输出：

1. 修改内容。
2. 测试结果。
3. 风险。
4. 下一步建议。
