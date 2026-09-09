/**
 * Express 应用配置
 * ----------------------------------------------------------
 * 中间件挂载顺序非常重要 (从上到下执行):
 *   HTTPS 重定向 → 安全头 → CORS → body 解析 → 限流 → 路由 → 404 → 错误处理
 *
 * 此文件只导出 app, 不调用 listen (供 Vercel serverless 复用)
 * listen 在 src/index.js 中, 仅本地开发时启动
 */
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const config = require('./config/env');
const corsMiddleware = require('./middleware/cors');
const securityHeaders = require('./middleware/securityHeaders');
const { cspDirectives } = require('./middleware/securityHeaders');
const { apiLimiter, writeLimiter } = require('./middleware/rateLimit');
const csrfProtection = require('./middleware/csrf');
const sanitizeInput = require('./middleware/sanitize');
const { notFound, errorHandler } = require('./middleware/error');
const attachResponseMethods = require('./utils/response');
const routes = require('./routes');

const app = express();

// 信任反向代理 (Vercel), 让 req.protocol / req.ip 取真实值
app.set('trust proxy', 1);

// --- 0. 生产环境 HTTPS 强制 ---
if (config.isProd) {
  app.use((req, res, next) => {
    // Vercel 会设置 x-forwarded-proto = https
    // 若非 HTTPS 则永久重定向到 HTTPS 版本
    if (req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// --- 1. 安全与基础中间件 ---
// Helmet: 生产环境启用 HSTS + 增强 CSP, 开发环境宽松
app.use(helmet(
  config.isProd
    ? {
        // HSTS: 强制浏览器 1 年内只走 HTTPS
        strictTransportSecurity: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        // CSP: 使用增强策略 (含 CDN + Supabase + WebSocket)
        contentSecurityPolicy: { directives: cspDirectives },
        // 禁止嵌入 (防点击劫持)
        frameguard: { action: 'deny' },
      }
    : {} // 开发环境: helmet 默认配置
));

// 补充安全头 (Permissions-Policy / Referrer-Policy / CORP)
app.use(securityHeaders);

app.use(corsMiddleware);                          // CORS 白名单
app.use(compression({                              // gzip 压缩响应体 (减少 ~70% 传输量)
  threshold: 1024,
  level: 6,
}));
app.use(express.json({ limit: config.bodyLimit })); // JSON body 解析 (限制大小)
app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));
app.use(sanitizeInput);                            // XSS 输入净化 (移除 script 标签 + HTML 编码)
app.use(attachResponseMethods);                    // 注入 res.success() 统一响应 (自动脱敏)
if (!config.isProd) {
  app.use(morgan('dev'));                         // 开发环境请求日志
} else {
  app.use(morgan('combined'));                    // 生产环境标准日志
}

// --- 2. 全局限流 (对所有 /api 请求生效) ---
app.use('/api', apiLimiter);
app.use('/api', csrfProtection);                  // CSRF 防护 (写操作需 X-Requested-With 头)
app.use('/api', writeLimiter);                     // 写操作限流 (POST/PUT/DELETE 每分钟 30 次)

// --- 3. 业务路由 ---

// 根路由：访问 http://localhost:3000/ 时显示服务状态页
app.get('/', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>晨光自律台 API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: linear-gradient(135deg, #0a1140 0%, #1a1a5c 50%, #2d1b69 100%);
           color: #e0e7ff; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: rgba(255,255,255,.08); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,.15);
            border-radius: 24px; padding: 48px 56px; max-width: 520px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 8px; background: linear-gradient(90deg,#60a5fa,#a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .status { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 999px;
              background: rgba(34,197,94,.15); border: 1px solid rgba(34,197,94,.3); font-size: 13px; color: #4ade80; margin: 16px 0 24px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
    .endpoints { text-align: left; margin-top: 24px; }
    .endpoints h3 { font-size: 14px; color: #a5b4fc; margin-bottom: 12px; }
    .endpoint { padding: 8px 14px; background: rgba(255,255,255,.05); border-radius: 8px; margin-bottom: 6px;
                font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 13px; display: flex; gap: 12px; align-items: center; }
    .method { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
    .get { background: rgba(59,130,246,.2); color: #60a5fa; }
    .post { background: rgba(168,85,247,.2); color: #c084fc; }
    .path { color: #e0e7ff; }
    .desc { color: #94a3b8; font-size: 12px; margin-left: auto; }
    .hint { margin-top: 20px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🌅</div>
    <h1>晨光自律台 API</h1>
    <div class="status"><span class="dot"></span> 服务运行中</div>
    <div class="endpoints">
      <h3>可用接口</h3>
      <div class="endpoint"><span class="method get">GET</span><span class="path">/api/health</span><span class="desc">健康检查</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="path">/api/auth/register</span><span class="desc">注册</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="path">/api/auth/login</span><span class="desc">登录</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="path">/api/tasks</span><span class="desc">任务列表</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="path">/api/checkins</span><span class="desc">打卡记录</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="path">/api/stats/overview</span><span class="desc">统计总览</span></div>
    </div>
    <p class="hint">前端页面: <a href="http://localhost:8000/index.html" style="color:#60a5fa;">http://localhost:8000</a></p>
  </div>
</body>
</html>`);
});

app.use('/api', routes);

// --- 4. 兜底 404 与错误处理 (必须最后挂载) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
