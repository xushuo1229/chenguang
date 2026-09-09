/**
 * 服务入口
 * ----------------------------------------------------------
 * - 本地开发: node src/index.js (或 npm run dev) 启动监听
 * - Vercel 部署: 模块导出 app, 由 Vercel 包装为 serverless 函数
 *
 * require.main === module 判断用于区分:
 *   - 直接运行 (本地开发): 启动 listen
 *   - 被 require 引入 (Vercel): 仅导出 app, 不 listen
 */
const app = require('./app');
const config = require('./config/env');

// 仅在直接运行时启动监听
if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log('-------------------------------------------');
    console.log('[server] 晨光自律台 API 已启动 ✓');
    console.log(`[server] 本地: http://localhost:${config.port}`);
    console.log(`[server] 环境: ${config.env}`);
    console.log('-------------------------------------------');
  });

  // 优雅关闭: 收到信号时停止接收新请求, 等待已有请求完成
  const shutdown = (signal) => {
    console.log(`[server] 收到 ${signal}, 准备关闭...`);
    server.close(() => {
      console.log('[server] 已关闭');
      process.exit(0);
    });
    // 5 秒内未关闭则强制退出
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// 暴露给 Vercel serverless (作为模块被 require 时)
module.exports = app;
