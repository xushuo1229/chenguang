# ⚠️ DEPRECATED · 此目录已废弃

**`server/` 是「晨光自律台」早期的 MySQL/Supabase 版后端，当前不再使用，仅作历史参考保留。**

## 当前后端在哪里？

当前项目使用 **`backend/`** 目录（Node.js + Express + SQLite + JWT）：

```bash
cd backend
npm install
npm start        # 端口 3000
```

前端所有页面加载的同步层 `js/sync.js` 指向的 API 基址为 `http://localhost:3000/api`（backend 服务），**与 server/ 无关**。

## 为什么保留？

- 早期版本含 PostgreSQL/Supabase 迁移代码、Realtime WebSocket、Vercel Serverless 适配等实现，可作为历史参考。
- 未删除以避免破坏任何历史引用或丢失可能需要的代码片段。

## 请勿混淆

- 启动后端 → 进入 **`backend/`**（不要进 `server/`）。
- 端口 3000 由 `backend/` 占用；`server/` 若被启动会与之冲突。
- 若确认不再需要，可整体删除 `server/` 目录（建议先备份）。
