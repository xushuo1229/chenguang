/**
 * Zeno · Express 应用装配
 * ============================================================
 * 【文件职责】
 * 这个文件是后端的"大脑"，负责把所有功能模块组装在一起。
 * 它创建了一个 Express 应用对象（app），然后按顺序挂载各种"中间件"和"路由"。
 *
 * 【核心概念】
 *
 * 1. 什么是 Express？
 *    Express 是一个 Node.js 的 Web 框架，它帮我们简化了 HTTP 服务器的开发。
 *    如果说 HTTP 服务器是"接线员"，那 Express 就是一个"智能接线员"——
 *    它能自动解析请求、路由到正确的处理函数、返回格式化的响应。
 *
 * 2. 什么是中间件（Middleware）？
 *    中间件就像一条"流水线上的工人"。每个请求进来后，
 *    会依次经过这些工人，每个工人负责处理一件特定的事：
 *    - 有的检查安全头
 *    - 有的做跨域检查
 *    - 有的解析请求体
 *    - 有的记录日志
 *    请求从第一个中间件流到最后一个，中间任何环节出错都会被拦截。
 *    中间件的顺序非常重要！比如安全头必须在所有响应之前设置。
 *
 * 3. 12 步安全链路详解：
 *    这是本项目最重要的设计——12 个中间件按严格顺序排列，
 *    形成一条完整的安全防护链：
 *
 *    ① securityHeaders（安全响应头）
 *       → 给所有响应加上安全相关的 HTTP 头
 *       → 比如 X-Content-Type-Options 防止浏览器猜测文件类型
 *       → 这些头告诉浏览器"请用安全的方式处理我的响应"
 *
 *    ② compression（gzip 压缩）
 *       → 把响应体压缩后返回给前端，减少网络传输量
 *       → JSON 数据压缩率约 75%，能显著加快加载速度
 *
 *    ③ cors（跨域资源共享）
 *       → 浏览器有"同源策略"，默认不允许网页向不同域名发请求
 *       → CORS 中间件设置允许哪些域名可以访问我们的 API
 *       → 预检请求（OPTIONS）必须先通过 CORS 检查
 *
 *    ④ express.json（请求体解析）
 *       → 前端发送的 JSON 数据是字符串，需要解析成 JavaScript 对象
 *       → 这个中间件自动把请求体解析好，挂载到 req.body 上
 *       → limit 参数限制请求体大小，防止恶意发送超大数据
 *
 *    ⑤ sanitize（XSS 输入净化）
 *       → 恶意用户可能在输入中嵌入 <script> 等危险代码（XSS 攻击）
 *       → 这个中间件在解析后立即清理所有输入中的危险字符
 *       → 位于 body 解析之后、业务处理之前，确保所有数据都是干净的
 *
 *    ⑥ responseEnhancer（响应方法注入）
 *       → 给 res 对象添加 res.success() 和 res.fail() 方法
 *       → 这样所有路由可以用统一的格式返回成功/失败响应
 *       → 保证前端收到的数据格式始终一致
 *
 *    ⑦ csrf（跨站请求伪造防护）
 *       → CSRF 攻击：恶意网站诱导用户浏览器向我们的 API 发送请求
 *       → 这个中间件检查写操作（POST/PUT/DELETE）是否来自合法来源
 *       → 通过检查 X-Requested-With 头来判断请求是否来自我们的前端
 *
 *    ⑧ logger（请求日志）
 *       → 记录每个请求的方法、路径、耗时等信息
 *       → 帮助开发者调试和监控服务运行状况
 *
 *    ⑨ apiLimiter（全局限流）
 *       → 限制每个 IP 在一定时间内的请求次数
 *       → 防止恶意用户疯狂刷接口（DDoS 攻击的简化版）
 *       → 默认每分钟最多 100 次请求
 *
 *    ⑩ routes（业务路由）
 *       → 这里才是真正的"业务逻辑"——处理注册、登录、数据同步等
 *       → 所有 /api 开头的请求都会被路由到对应的处理函数
 *
 *    ⑪ 静态文件托管（可选）
 *       → 如果配置了静态目录，就把该目录下的文件直接返回给前端
 *       → 常用于托管前端打包后的 SPA（单页应用）
 *
 *    ⑫ notFound + error（错误兜底）
 *       → notFound：处理 404（找不到路由）
 *       → error：统一处理所有错误（必须放在最后，4 参数签名）
 *       → 任何中间件或路由抛出的错误都会被 error 处理器捕获
 *
 * 【与其他文件的关系】
 * - server.js：调用 app.listen() 把这个 app 启动起来
 * - middleware/*.js：各个中间件的具体实现
 * - routes/*.js：各个路由的具体实现
 * - config/env.js：提供配置参数
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const config = require('./config/env');

// 引入各个中间件（每个中间件负责一件事）
const securityHeaders = require('./middleware/securityHeaders');
const corsMiddleware = require('./middleware/cors');
const sanitizeInput = require('./middleware/sanitize');
const responseEnhancer = require('./middleware/response');
const csrfProtection = require('./middleware/csrf');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, handler } = require('./middleware/error');

// 引入路由（定义了所有 API 接口）
const routes = require('./routes/index');

// 创建 Express 应用实例
// 这个 app 对象就是我们后面挂载中间件和路由的"容器"
const app = express();

// 隐藏 X-Powered-By 响应头
// 默认 Express 会在响应头里暴露 "X-Powered-By: Express"
// 这会告诉黑客"我们用的是 Express"，增加了被攻击的风险
// 关闭它是一种基本的安全实践
app.disable('x-powered-by');

// 信任反向代理，获取真实客户端 IP
// 在生产环境中，请求通常经过 Nginx 等反向代理
// 开启信任后，req.ip 才能拿到真实的客户端 IP，限流功能才能正确工作
app.set('trust proxy', 1);

// ===== 健康检查接口（挂载在中间件链最前面） =====
// 健康检查不需要经过安全头、日志、限流等中间件
// 运维/监控系统会定期调用这个接口来判断服务是否正常
// 返回 { ok: true, ts: 当前时间戳 }
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ===== 中间件链（按严格顺序挂载） =====
// 注意：中间件的顺序决定了请求的处理流程，顺序错误可能导致安全漏洞

app.use(securityHeaders);                              // 第1步：安全响应头（必须最先，影响所有响应）
app.use(compression());                                // 第2步：gzip 压缩（在数据发送前压缩）
app.use(corsMiddleware);                               // 第3步：CORS 跨域检查（预检请求需要先通过）
app.use(express.json({ limit: config.bodyLimit }));   // 第4步：解析请求体中的 JSON 数据
app.use(sanitizeInput);                                // 第5步：XSS 输入净化（解析后立即清理）
app.use(responseEnhancer);                             // 第6步：注入 res.success/res.fail 统一响应方法
app.use(csrfProtection);                               // 第7步：CSRF 防护（写操作需要验证来源）
app.use(logger);                                       // 第8步：记录请求日志
app.use('/api', apiLimiter);                           // 第9步：全局限流（只对 /api 路径生效）
app.use('/api', routes);                               // 第10步：业务路由（匹配具体的 API 接口）

// ===== 静态文件托管（可选，用于托管前端打包后的 SPA） =====
// 如果配置了静态目录（比如前端构建产物目录），就把该目录下的文件直接返回
// SPA（单页应用）的兜底：任何未匹配的路径都返回 index.html
// 这样前端的多页面路由才能正常工作
if (config.staticDir && fs.existsSync(path.resolve(config.staticDir))) {
  const staticDir = path.resolve(config.staticDir);
  app.use(express.static(staticDir));
  // SPA 路由兜底：当前端路由没有对应的文件时，返回 index.html
  // 这样前端的 JavaScript 就能接管路由，实现客户端路由
  app.get('*', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  console.log(`[static] 已启用静态托管: ${staticDir}`);
}

// ===== 错误兜底（必须放在最后） =====
// notFound：处理所有未匹配的路由（404 错误）
// handler：统一处理所有错误（包括 500 服务器错误）
// 必须是 4 个参数的函数签名：(err, req, res, next)
// Express 通过参数个数来区分"正常中间件"和"错误处理器"
app.use(notFound);                                     // 第11步：404 兜底
app.use(handler);                                      // 第12步：统一错误处理

module.exports = app;
