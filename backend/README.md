# 晨光自律台 · 后端服务 + 云端同步方案

把原有「纯 localStorage 本地存储」升级为「**后端数据库（SQLite）+ JWT 鉴权**」，
实现 **同一账号跨浏览器 / 跨设备数据完全一致**。

技术栈：**Node.js + Express + SQLite(better-sqlite3) + JWT**。

---

## 一、架构总览

```
浏览器 A (Chrome)  ─┐
浏览器 B (Safari)  ─┼──►  前端 store.js (本地缓存)  ◄──►  js/sync.js  ──►  后端 API  ──►  SQLite
手机浏览器        ─┘        (离线兜底 / 即时渲染)        (云端同步层)      (Express)     (user_data 整份快照)
```

- **后端 = 数据唯一真源（source of truth）**：所有用户的课程/阅读/运动/英语/打卡/待办/专注都按 `user_id` 存进数据库。
- **前端 `store.js` = 本地缓存 + 离线兜底**：页面渲染逻辑完全不变，照常同步读取。
- **`js/sync.js` = 云端同步层**：登录后从后端拉取整份数据覆盖本地；任意本地变更（防抖 400ms）回写后端。
- **多端一致**：设备 A 改了数据 → 回写后端 → 设备 B 登录时 `GET /api/data` 拉到同一份 → 渲染一致。

---

## 二、目录结构

```
backend/
├── package.json          # 依赖与启动脚本
├── schema.sql            # 建表 SQL（users + 7 张业务表 + user_data 快照）
├── chenguang.db          # 运行后自动生成（SQLite 文件，勿提交）
├── src/
│   ├── server.js         # Express 入口：路由 + 静态托管
│   ├── db.js             # 数据库初始化 / 建表 / 读写封装
│   └── auth.js           # JWT 签发校验 + bcrypt 密码哈希
└── README.md

前端改动（沿用现有页面，零重写渲染代码）：
├── js/sync.js            # 【新增】云端同步层
├── js/apiClient.js       # API 基址 http://localhost:3000/api（已存在）
├── index.html            # 登录/注册成功后调用 CGSync.afterLogin()
├── dashboard.html        # 加载 sync.js；进入时先 pull 云端数据
└── workbench.html        # 加载 sync.js；进入时先 pull 云端数据
```

---

## 三、环境要求

- **Node.js ≥ 18**（已在 22.x 验证通过）
- 无需单独安装数据库（SQLite 文件库，自动建表）

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

### 3. 启动前端（静态服务）
前端仍是静态文件，任意静态服务器即可（与后端分端口，靠 CORS 互通）：
```bash
# 在项目根目录
python -m http.server 8080
# 浏览器打开 http://localhost:8080/index.html
```
> 也可让后端直接托管前端：设置环境变量 `STATIC_DIR=/绝对路径/到前端目录` 再 `npm start`，
> 此时前后端同源（同端口 3000），免 CORS。

### 4. 验证
- 注册一个新账号 → 自动跳转到 `dashboard.html`。
- 在「课程进度」添加一门课 → 数据立即写入后端。
- **换一个浏览器（或清掉 localStorage 后）用同一账号登录** → 课程依然存在，完全一致。

---

## 五、API 一览

基址：`http://localhost:3000/api`

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册 `{email, nickname, password}` → `{token, user}` |
| POST | `/auth/login`    | 登录 `{email, password}` → `{token, user}` |
| GET  | `/auth/me`       | 获取当前用户（需 Bearer Token） |
| PUT  | `/auth/me`       | 修改昵称/头像 |

### 全量数据（同步层核心）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/data` | 拉取整份 `chenguangData`（新设备/刷新时覆盖本地） |
| PUT  | `/data` | 覆盖整份 `chenguangData`（任一端变更后回写） |

### 分集合 CRUD（按 id 粒度，便于未来精细统计）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST  | `/courses` `/sports` `/readings` `/english` `/checkins` `/todos` `/focus` | 列表 / 新增 |
| DELETE    | `/<集合>/:id` | 删除某条 |

> 所有受保护接口需在请求头带：`Authorization: Bearer <token>`。
> 前端 `apiClient.js` 已自动携带该头与 `X-Requested-With` 防 CSRF。

---

## 六、数据结构（与前端 store.js 一致）

```jsonc
{
  "user":      { "name": "", "startDate": "", "totalDays": 0, "continuousDays": 0 },
  "checkins":  [ { "date": "2026-08-23", "status": "done" } ],
  "sports":    [ { "id": "uuid", "date": "2026-08-23", "name": "跑步", "calories": 120, "duration": 30, "type": "running" } ],
  "readings":  [ { "id": "uuid", "date": "2026-08-23", "bookName": "书名", "pages": 20, "totalPages": 300 } ],
  "courses":   [ { "id": "uuid", "name": "Java", "totalChapters": 100, "learnedChapters": 30, "progress": 30, "status": "doing" } ],
  "english":   [ { "id": "uuid", "date": "2026-08-23", "words": 30, "minutes": 15 } ],
  "todos":     [ { "id": "uuid", "text": "写周报", "date": "2026-08-23", "done": false, "priority": "normal" } ],
  "focus":     [ { "id": "uuid", "date": "2026-08-23", "minutes": 25, "task": "刷题" } ]
}
```

数据库中 `user_data.payload` 存的就是这份 JSON 的完整快照；各业务明细表（`courses` 等）同步落库，便于未来做统计/排行榜查询。

---

## 七、离线 / 后端未启动时的行为

- 无令牌（未登录）：纯本地 localStorage，行为与改造前完全一致。
- 已登录但后端临时不可用：`sync.js` 的 pull/push 会静默失败并 `console.warn`，
  页面继续使用本地缓存，待后端恢复后下一次变更会自动重试回写。
- 注册/登录接口若连不上后端：`index.html` 会回退到「演示登录」（保留旧体验，不影响使用）。

---

## 八、生产部署提示

- 改 `JWT_SECRET` 为强随机值（环境变量注入，勿写死在代码）。
- SQLite 适合个人/小团队；若要更高并发，可把 `db.js` 换成 PostgreSQL（表结构一致，仅需改连接层）。
- `chenguang.db` 是用户数据，请在 `.gitignore` 中排除，并定期备份。
- 前端若部署到独立域名，确保后端 CORS 允许该源（当前 `cors()` 已默认放行全部，生产建议显式白名单）。
