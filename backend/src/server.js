/**
 * 晨光自律台 · 后端服务入口 (SQLite)
 * ============================================================
 * 启动流程：
 *   1. 初始化 SQLite 数据库文件（不存在会自动创建）和表结构
 *   2. 启动 HTTP 服务器
 */
const app = require('./app');
const config = require('./config/env');
const { initDatabase } = require('./db/index');

// 先初始化数据库，再启动服务器
initDatabase()
  .then(function () {
    app.listen(config.port, function () {
      console.log('✅ 晨光自律台后端已启动: http://localhost:' + config.port);
      console.log('   API 基址: http://localhost:' + config.port + '/api');
      console.log('   环境: ' + config.env + (config.isProd ? ' (生产)' : ' (开发)'));
    });
  })
  .catch(function (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    process.exit(1);
  });

module.exports = app;
