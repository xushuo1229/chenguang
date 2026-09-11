# 晨光自律台 · 大学生 AI 自律工作台

> 每天进步一点点，自律让我自由。

一个面向大学生的全栈自律工作台：每日打卡、课程进度、每日阅读、英语学习、运动记录、待办计划、专注统计，数据全平台打通，支持多设备云端同步。

## 当前技术架构（2026-09 最新）

```
前端多页 (静态文件)               数据与同步层 (js/)              后端 (backend/)
┌─────────────┐              ┌──────────────────┐          ┌─────────────────────┐
│ index.html  │              │ store.js · CGStore│          │ Express + JWT API    │
│ workbench   │◄────────────►│ 统一数据层         │◄────────►│ 端口 3000             │
│ stats / ai  │              │ 单一 key 全页共享  │  同步层   │ /api/data 整份快照    │
│ ...         │              │ sync.js · CGSync  │          │ SQLite 单快照 + AI / 课表导入代理│
└─────────────┘              │ 登录拉取/防抖回写  │          └─────────────────────┘
                             └──────────────────┘
```

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | 原生 HTML/CSS/JS + Vite 6（多页构建） | index（落地/注册登录）、workbench（工作台）、stats（数据统计）、ai（AI 助手） |
| 数据层 | `js/store.js`（CGStore） | 所有页面共享**单一 key** `chenguangData`，八类数据：user/checkins/sports/readings/courses/english/todos/focus；写入即派发 `chenguang:update` 事件跨页实时刷新 |
| 同步层 | `js/sync.js`（CGSync） | 登录后「先推后拉」同步云端；本地变更防抖 400ms 回写；离线/无 token 静默走本地 |
| 后端 | Node.js + Express + SQLite（better-sqlite3）+ JWT | `backend/` 目录，注册/登录/鉴权、按用户隔离、多设备数据一致；提供 **AI 代理**（`/api/ai/chat`）与 **课表导入代理**（`/api/course/import`）；数据以**单张 `user_data` 快照表**为唯一真源（早期 7 张明细表已精简移除） |
| 智能层 | OpenAI 兼容代理（默认 DeepSeek） | AI 助手对话 `POST /api/ai/chat`，由后端代理转发大模型，`API Key` 只存后端 `.env`，浏览器不接触；未配置/离线自动回退本地模板 |

## 快速开始

### Windows 一键启动

双击项目根目录的 **`start.bat`**，它会自动启动后端（端口 3000）和前端（端口 5173），并打开浏览器。停止服务请双击 **`stop.bat`**。

### 1. 启动后端（端口 3000）
```bash
cd backend
npm install        # 首次
npm start
```
> 首次启动自动执行 `schema.sql` 建表并生成 `chenguang.db`。
> 详细文档见 `backend/README.md`（API 一览 / 数据结构 / 离线行为 / 部署）。

### 2. 启动前端（Vite 开发服务器，端口 5173）
```bash
# 项目根目录
npm install        # 首次
npm run dev
```
浏览器打开 http://localhost:5173/

### 3. 验证多设备同步
- 注册账号 → 在 workbench「课程」添加一门课
- 换一个浏览器（或清空本地存储）用**同一账号**登录 → 课程依然存在，完全一致

## 功能特性

### 核心功能
- **用户系统**：注册 / 登录（bcrypt 密码加密 + JWT 鉴权）
- **AI 学习助手**：接入真实大模型对话（OpenAI 兼容国内大模型，默认 DeepSeek），把本地自律数据注入上下文给出个性化建议；未配置/离线自动回退本地模板
- **每日打卡**：一键打卡、连续天数统计
- **课程进度**：添加课程、编辑总章节/已学章节、进度条实时刷新；支持**课表一键导入** —— 粘贴课表文本（本地解析，无需后端）或填写公开课表网页链接（后端代理抓取 HTML 表格），按课程名自动去重合并
- **每日阅读**：书架管理（书名/总页数/已读页数）、累计阅读统计
- **英语学习**：背单词打卡、专注分钟
- **每日运动**：记录项目/千卡/时长
- **待办计划**：今日任务、完成率
- **专注统计**：累计专注分钟
- **成长数据**：累计阅读/页数、计划完成率、专注、学习次数、连续天数

### 数据层设计亮点
- **单一真源**：所有页面读写同一份 `chenguangData`，杜绝「多页面数据不通」
- **跨页实时**：`chenguang:update` 自定义事件 + 原生 `storage` 事件，多标签页即时刷新
- **兼容迁移**：首次运行自动把旧 `cg_*` 键合并进统一数据层
- **云端同步**：后端为真源，本地为缓存+离线兜底；登录「先推后拉」避免本地新数据被云端旧数据覆盖

## 项目结构

```
chenguang-platform/
├── index.html                # 落地页（注册/登录入口）
├── workbench.html            # 工作台：今日计划/四卡总览/成长数据/课程页
├── stats.html                # 数据统计
├── ai.html                   # AI 学习助手
├── pages/
│   ├── index.js              # 落地页逻辑（注册/登录/演示登录）
│   ├── workbench.js          # 工作台逻辑（事件委派 + 课程/阅读/运动/待办…）
│   ├── stats.js              # 数据统计页逻辑
│   └── ai.js                 # AI 助手页逻辑
├── js/
│   ├── store.js              # 【核心】统一数据层 CGStore（单 key 真源）
│   ├── sync.js               # 【核心】云端同步层 CGSync（先推后拉）
│   ├── scheduleTextParser.js # 课表文本解析器（本地启发式解析）
│   ├── apiClient.js          # API 客户端（认证 + 数据同步 + AI + 课表导入）
│   ├── ui/                   # 通用 UI 组件（modal.js / toast.js）
│   └── utils/                # 工具函数（date.js / dom.js）
├── css/
│   ├── variables.css         # 设计变量
│   ├── shared.css            # 公共组件样式
│   ├── tech.css              # 科技感视觉升级
│   └── app.css               # 落地页样式
├── backend/                  # 【当前后端】Node + Express + SQLite + JWT
│   ├── schema.sql            # 建表 SQL（users + user_data 单快照表）
│   ├── test/                 # node:test 单元测试（auth / sync / scheduleImport）
│   └── src/
│       ├── server.js         # 服务入口
│       ├── app.js            # Express 装配（含 /api/health）
│       ├── config/env.js     # 环境变量（含 AI_* / IMPORT_* 配置）
│       ├── routes/           # API 路由（auth / data / ai / course/import）
│       ├── controllers/      # 控制器（auth / sync / ai / scheduleImport）
│       ├── services/         # 业务逻辑（auth / sync / ai / scheduleImport）
│       ├── middleware/       # 中间件（鉴权 / 限流 / CORS / 安全头）
│       ├── utils/            # 工具（ApiError / logger / validator / hashPool）
│       └── db/               # SQLite 数据访问（users / user_data）
├── tests/                    # Vitest 单元测试（store / sync / scheduleTextParser）
├── vite.config.js            # Vite 多页构建配置
├── vitest.config.mjs         # Vitest 配置（jsdom）
├── service-worker.js         # 静态资源缓存（版本化清理）
```

## 离线 / 后端未启动行为

- 无令牌（未登录）：纯本地存储，行为与纯前端版一致。
- 已登录但后端临时不可用：pull/push 静默失败并 `console.warn`，页面继续用本地缓存，恢复后自动重试回写。
- 注册/登录连不上后端：回退「演示登录」，不影响使用。
- AI 未配置（后端未设 `AI_API_KEY`）或大模型接口不可用：AI 助手自动回退本地模板回复，应用不中断。

## 自动化测试

```bash
# 后端 node:test（auth / sync / scheduleImport 单元测试）
cd backend && npm test

# 前端 Vitest（store / sync / scheduleTextParser 测试）
npm test
```

后端测试会为每个进程使用独立的临时 SQLite 库，互不影响。

## 数据导出 / 导入

- workbench「管理」页提供「导出数据」（下载 JSON 备份）与「导入数据」（从备份恢复）。
- 建议定期导出，防止误操作或本地存储丢失。

## 生产部署提示

- 后端：设置强随机 `JWT_SECRET` 环境变量；SQLite 适合个人/小团队，高并发可换 PostgreSQL。
- 前端：可部署到任意静态托管（GitHub Pages / CloudStudio / Nginx）。
- AI：在 `backend/.env` 设置 `AI_API_KEY`（如 DeepSeek），可选 `AI_BASE_URL` / `AI_MODEL` / `AI_TIMEOUT_MS`；Key 只存后端，绝不下发浏览器。
- 课表导入（链接方式）：仅接受 `http/https` URL，默认 15s 超时、2MB 响应体上限、10 次/分钟限流（防被当 SSRF 代理刷外网），相关参数见 `IMPORT_*` 环境变量。
- `chenguang.db` 是用户数据，请在 `.gitignore` 排除并定期备份。

## License

MIT
