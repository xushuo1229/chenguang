/**
 * 晨光自律台 · API 路由聚合
 * ============================================================
 * 【文件职责】
 * 这个文件是所有 API 路由的"总调度中心"。
 * 它把各个子路由（认证、同步、集合 CRUD）统一挂载到 /api 路径下。
 *
 * 【核心概念】
 *
 * 1. 什么是 REST API？
 *    REST 是一种 API 设计风格，它用 URL 来表示"资源"，用 HTTP 方法来表示"操作"：
 *    - GET    → 查询/获取数据（不会修改数据）
 *    - POST   → 创建新数据
 *    - PUT    → 更新已有数据
 *    - DELETE → 删除数据
 *
 *    举例：
 *    - GET  /api/courses    → 查询课程列表
 *    - POST /api/courses    → 创建一门新课程
 *    - GET  /api/courses/123 → 查询 id 为 123 的课程
 *    - DELETE /api/courses/123 → 删除 id 为 123 的课程
 *
 * 2. 为什么路由顺序很重要？
 *    Express 按照代码中的注册顺序来匹配路由，找到第一个匹配的就停止。
 *    比如：如果把 /:name 放在 /data 前面，那么请求 /api/data
 *    会被 /:name 匹配到，name 的值是 "data"——这就出 bug 了！
 *    所以具体的路由（如 /data）必须放在动态路由（如 /:name）之前。
 *
 * 3. 路由参数（:name）：
 *    :name 是一个动态参数，匹配任意值。
 *    比如请求 /api/courses，name 的值就是 "courses"。
 *    这样一个路由就能处理所有集合的查询，非常灵活。
 *
 * 4. 中间件的组合使用：
 *    每个路由可以挂载多个中间件，用逗号分隔：
 *    router.get('/data', authRequired, ctrl.getData);
 *    表示：先执行 authRequired（检查登录状态），再执行 ctrl.getData（处理业务逻辑）。
 *
 * 【挂载路径】
 * 在 app.js 中：app.use('/api', routes)
 * 所以这里的 /data 实际对应 /api/data
 *
 * 【与其他文件的关系】
 * - app.js：引入本文件，挂载到 /api 路径
 * - auth.js：认证相关的子路由
 * - syncController.js：数据同步的处理逻辑
 * - collectionController.js：集合 CRUD 的处理逻辑
 * - middleware/auth.js：authRequired 中间件，检查用户是否登录
 * - middleware/rateLimit.js：writeLimiter 中间件，限制写操作频率
 */
const express = require('express');
const router = express.Router();
const auth = require('./auth');
const syncCtrl = require('../controllers/syncController');
const collectionCtrl = require('../controllers/collectionController');
const { authRequired } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

// ===== 认证路由 =====
// /api/auth/* 的所有请求都交给 auth 子路由处理
// 比如 POST /api/auth/login、POST /api/auth/register 等
// 认证路由不需要登录即可访问（登录本身就是获取登录状态的过程）
router.use('/auth', auth);

// ===== 整份数据同步 =====
// 这是"全量同步"接口：一次性获取/保存用户的所有数据
// 必须在 /:name 之前注册！否则 /data 会被当作 :name 参数匹配到
// authRequired：要求用户必须登录
// writeLimiter：限制写操作频率（PUT 请求会修改数据，需要限流保护）

// GET /api/data → 获取用户的整份数据（只读，不需要限流）
router.get('/data', authRequired, syncCtrl.getData);

// PUT /api/data → 保存用户的整份数据（写操作，需要限流）
router.put('/data', authRequired, writeLimiter, syncCtrl.saveData);

// ===== 分集合 CRUD =====
// 动态路由 :name 会匹配所有集合名（courses、sports、readings 等）
// :name 就是 URL 中的变量，比如 GET /api/courses 中 name = "courses"
// 这种设计让一个路由就能处理所有集合的查询和新增
// 放在最后是因为它的匹配范围最广，不能覆盖前面的具体路由

// GET /api/:name → 查询某个集合的所有记录（如 GET /api/courses）
router.get   ('/:name',     authRequired, collectionCtrl.list);

// POST /api/:name → 向某个集合新增一条记录（如 POST /api/courses）
router.post  ('/:name',     authRequired, writeLimiter, collectionCtrl.create);

// DELETE /api/:name/:id → 删除某个集合中的某条记录（如 DELETE /api/courses/123）
// 注意这个路由有两个参数：:name 是集合名，:id 是记录 ID
router.delete('/:name/:id', authRequired, writeLimiter, collectionCtrl.remove);

module.exports = router;
