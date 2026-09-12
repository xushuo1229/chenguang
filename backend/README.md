# 晨光自律台 · 后端服务 + 云端同步方案

把原有「纯 localStorage 本地存储」升级为「**后端数据库（SQLite）+ JWT 鉴权**」，
实现 **同一账号跨浏览器 / 跨设备数据完全一致**。

技术栈：**Node.js + Express + SQLite(better-sqlite3) + JWT**，
并提供两个对外代理服务：**AI 助手代理**（转发大模型）与 **课表导入代理**（抓取公开课表 HTML）。

---

## 一、架构总览

```
浏览器 A (Chrome)  ─┐
浏览器 B (Safari)  ─┼──►  前端 store.js (本地缓存)  ◄──►  js/sync.js  ──►  后端 API  ──►  SQLite
手机浏览器        ─┘        (离线兜底 / 即时渲染)        (云端同步层)      (Express)     (user_data 整份快照)
```

- **后端 = 数据唯一真源（source of truth）**：所有业务数据（打卡/课程/阅读/运动/英语/待办/专注/个人信息）放进同一份 `chenguangData` JSON，**整份落库**，彻底规避「两处各记各的」导致的不一致。
- **前端 `store.js` = 本地缓存 + 离线兜底**：页面渲染逻辑不变，照常同步读写。
- **`js/sync.js` = 云端同步层**：登录后从后端拉取整份数据覆盖本地；本地变更（防抖 400ms）回写后端。
- **多端一致**：设备 A 改了数据 → 回写后端 → 设备 B 登录时 `GET /api/data` 拉到同一份 → 渲染一致。

---

## 二、目录结构

```
backend/
├── package.json          # 依赖与启动脚本
├── schema.sql            # 建表 SQL（users + user_data 单快照表）
├── .env.example          # 环境变量模板（JWT / AI_* / IMPORT_* / CORS…）
├── Dockerfile            # 容器化部署
├── render.yaml           # Render 平台部署配置
├── chenguang.db          # 运行后自动生成（SQLite 文件，勿提交）
├── test/                 # node:test 单元测试（临时数据库，互不影响）
│   ├── setup.js          # 测试公共 setup
│   ├── auth.test.js
│   ├── sync.test.js
│   └── scheduleImport.test.js
└── src/
    ├── server.js         # 服务入口：启动监听、可选托管前端静态产物
    ├── app.js            # Express 装配：中间件链 + 路由挂载 + /api/health
    ├── config/
    │   ├── env.js        # 环境变量集中加载与校验（全部配置项的唯一入口）
    │   └── collectionConfig.js
    ├── routes/           # API 路由
    │   ├── index.js      # /api 聚合：auth / data / ai / course
    │   ├── auth.js       # 注册 / 登录 / 当前用户
    │   ├── ai.js         # POST /api/ai/chat
    │   └── scheduleImport.js  # POST /api/course/import
    ├── controllers/      # 轻控制器（auth / sync / ai / scheduleImport）
    ├── services/         # 业务逻辑（auth / sync / ai / scheduleImportService）
    ├── middleware/       # auth、rateLimit、cors、csrf、sanitize、securityHeaders、error、response
    ├── utils/            # ApiError、logger、validator、hashPool、sanitizeResponse
    └── db/               # SQLite 数据访问（users / user_data）
```

> 早期版本的「7 张业务明细表 + 分集合 CRUD」已精简移除，改为 **单张 `user_data` 快照表** 作为唯一真源，避免双轨并存。

---

## 三、环境要求

- **Node.js ≥ 18**（已在 22.x 验证通过）
- 无需单独安装数据库（SQLite 文件库，自动建表）
- 可选：AI 服务的 `API Key`（不配置则 AI 对话返回 503，前端自动回退本地模板回复，应用不中断）

---

## 四、启动步骤

### 1. 安装依赖
```bash
cd backend
npm install
```
> `better-sqlite3` 会自动下载适配你系统的预编译二进制；若失败（罕见），按报错安装系统级编译工具后重试。

### 2. 启动后端
```bash
npm start
# 或自定义端口 / JWT 密钥 / 库路径：
# PORT=3000 JWT_SECRET=你的密钥 DB_PATH=./chenguang.db npm start
```
看到 `✅ 晨光自律台后端已启动: http://localhost:3000` 即成功。
首次启动会自动执行 `schema.sql` 建表并生成 `chenguang.db`。

### 3. 启动前端（Vite 开发服务器）
前端与后端分端口，靠 CORS 互通：
```bash
# 在项目根目录
npm install        # 首次
npm run dev        # 端口 5173
# 浏览器打开 http://localhost:5173/
```
> 也可让后端直接托管前端打包产物：设置环境变量 `STATIC_DIR=/绝对路径/到 dist 目录` 再 `npm start`，此时前后端同源（同端口 3000），免 CORS。

### 4. 验证
- 注册一个新账号 → 自动跳转到 `workbench.html`。
- 在「课程进度」添加一门课，或导入课表 → 数据立即写入后端。
- **换一个浏览器（或清掉 localStorage 后）用同一账号登录** → 课程依然存在，完全一致。

---

## 五、API 一览

基址：`http://localhost:3000/api`

所有受保护接口需带请求头：`Authorization: Bearer <token>`（前端 `apiClient.js` 自动携带，并额外带 `X-Requested-With` 防 CSRF）。

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册 `{email, nickname, password}` → `{token, user}` |
| POST | `/auth/login`    | 登录 `{email, password}` → `{token, user}` |
| GET  | `/auth/me`       | 获取当前用户 |
| PUT  | `/auth/me`       | 修改昵称/头像 |

### 全量数据（同步层核心）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/data` | 拉取整份 `chenguangData`（新设备/刷新时覆盖本地） |
| PUT  | `/data` | 覆盖整份 `chenguangData`（任一端变更后回写，`writeLimiter` 限流） |

### AI 教练（Phase 13 AI 2.0）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/ai/chat` | 教练对话 `{message, history, context, contextVersion}` → `{reply, mode:'coach', suggestions, actions, model}`；System Prompt 由后端 `promptBuilder` 生成，Context 由前端 `js/aiContext.js` 构建；`actions` 第一版只允许 `{type:'navigate'}`；需登录 + `aiLimiter`（15 次/分） |

### 课表导入（公开课表链接）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/course/import` | `{url}` → `{courses, source}`；后端代理抓取 HTML 表格，用 cheerio 解析；需登录 + `importLimiter`（10 次/分） |

### 其他
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/health` | 健康检查（在 `app.js` 中，无需登录） |

### 课表导入的安全约束
- 仅接受 `http / https` 协议 URL（杜绝 `file://`、`ftp://` 等协议攻击）。
- URL 长度上限 `IMPORT_MAX_URL_LEN`（默认 2000）、响应体上限 `IMPORT_MAX_BODY_BYTES`（默认 2MB）、抓取超时 `IMPORT_TIMEOUT_MS`（默认 15s）。
- `importLimiter` 限流，防止本服务被当作无限制代理去刷外网（SSRF 风险兜底）。

> 解析策略为 **best-effort**：按最常见布局（星期为列、节次为行/时间的二维表格）提取「课程名 + 星期 + 节次」，同名课程自动聚合时段。**纯图片课表或需登录的页面无法解析**，此时请改用前端的「粘贴课表文本」本地导入（纯前端、离线可用）。

---

## 六、限流体系（express-rate-limit）

| 限流器 | 作用于 | 限制 | 目的 |
|--------|--------|------|------|
| `apiLimiter` | 所有 `/api` | 100 次/分（可配） | 全局限流 |
| `authLimiter` | 注册/登录 | 15 分钟内最多 5 次失败 | 防暴力破解（成功不计数，`skipSuccessfulRequests`） |
| `writeLimiter` | 写操作（POST/PUT） | 30 次/分 | 防批量写滥用 |
| `aiLimiter` | `/api/ai/chat` | 15 次/分 | 防刷大模型额度 |
| `importLimiter` | `/api/course/import` | 10 次/分 | SSRF 风险兜底 |

当前为内存存储，适合 SQLite 单进程；多实例部署需更换为 Redis 存储共享计数。

---

## 七、数据结构（与前端 store.js 一致）

`user_data.payload` 存的就是整份 `chenguangData` JSON 快照：

```jsonc
{
  "user":      { "name": "", "startDate": "", "totalDays": 0, "continuousDays": 0 },
  "checkins":  [ { "date": "2026-08-23", "status": "done" } ],
  "sports":    [ { "id": "uuid", "date": "2026-08-23", "name": "跑步", "calories": 120, "duration": 30, "type": "running" } ],
  "readings":  [ { "id": "uuid", "date": "2026-08-23", "bookName": "书名", "pages": 20, "totalPages": 300 } ],
  "courses":   [ { "id": "uuid", "name": "Java", "totalChapters": 100, "learnedChapters": 30, "progress": 30, "status": "doing", "slots": [], "weeks": "", "location": "" } ],
  "english":   [ { "id": "uuid", "date": "2026-08-23", "words": 30, "minutes": 15 } ],
  "todos":     [ { "id": "uuid", "text": "写周报", "date": "2026-08-23", "done": false, "priority": "normal" } ],
  "focus":     [ { "id": "uuid", "date": "2026-08-23", "minutes": 25, "task": "刷题" } ]
}
```

课程对象上的 `slots`（已排课时段）、`weeks`（周次）、`location`（地点）由「课表导入」写入，手动添加的课程默认不含。存储时保留对象的扩展字段，老版本数据自动兼容。

---

## 八、环境变量一览

见 `src/config/env.js`。所有项均可选（开发环境有默认值），生产环境 `JWT_SECRET` 与 `CORS_ORIGIN` 必填。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `DB_PATH` | `backend/chenguang.db` | SQLite 文件路径 |
| `JWT_SECRET` | 开发默认值 | 生产环境**必须**改为强随机值 |
| `JWT_EXPIRES_IN` | 30d | token 有效期 |
| `CORS_ORIGIN` | 空 | 逗号分隔的跨域白名单；生产环境必填 |
| `AI_API_KEY` | 空 | 大模型密钥（空则 AI 接口 503，前端离线兜底） |
| `AI_BASE_URL` / `AI_MODEL` / `AI_TIMEOUT_MS` | `https://api.deepseek.com/v1` / `deepseek-chat` / 30000 | OpenAI 兼容代理配置 |
| `AI_MAX_MESSAGES` / `AI_MAX_MSG_LENGTH` | 20 / 8000 | 对话消息数 / 单条长度上限 |
| `IMPORT_TIMEOUT_MS` / `IMPORT_MAX_URL_LEN` / `IMPORT_MAX_COURSE` / `IMPORT_MAX_BODY_BYTES` | 15000 / 2000 / 50 / 2MB | 课表导入抓取约束 |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | 100 / 60000 | 全局限流 |
| `BCRYPT_ROUNDS` | 10 | 密码加密轮数 |
| `BODY_LIMIT` | 2mb | 请求体大小上限 |
| `STATIC_DIR` | 空 | 前端构建产物目录（空则不托管静态文件） |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY` | 空 | 可选 Realtime 广播，未使用可忽略 |

---

## 九、离线 / 后端未启动时的行为

- 无令牌（未登录）：纯本地 localStorage，行为与改造前完全一致。
- 已登录但后端临时不可用：`sync.js` 的 pull/push 静默失败并 `console.warn`，页面继续用本地缓存，后端恢复后下一次变更自动重试回写。
- 注册/登录接口若连不上后端：前端回退「演示登录」（保留旧体验，不影响使用）。
- 课表导入（链接方式）必须后端在线；「粘贴课表文本」为纯前端解析，完全离线可用。

---

## 十、生产部署提示

- **必填**：设置强随机 `JWT_SECRET` 与显式的 `CORS_ORIGIN`（两者缺失时生产环境直接拒绝启动，避免带病运行）。
- SQLite 适合个人/小团队；更高并发可替换为 PostgreSQL（只需改 `db/` 连接层）。
- `chenguang.db` 是用户数据，请在 `.gitignore` 中排除，并定期备份。
- AI Key 只存后端 `.env`，绝不下发浏览器。
- 提供 `Dockerfile` + `render.yaml`，可供容器化 / Render 平台部署。