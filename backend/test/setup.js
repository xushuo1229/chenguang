/**
 * Zeno · 后端测试统一环境初始化
 * ============================================================
 * node:test 会用独立子进程跑每个测试文件，
 * 每个文件 require 本 setup 后，在当前进程里用一个临时 SQLite 文件建表，
 * 测试结束由 node:test 的 after 钩子清理。
 *
 * 用法（每个测试文件第一行）：
 *   require('./setup');
 *   const authService = require('../src/services/authService');  // 之后再引入业务模块
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { after } = require('node:test');

// —— 必须在 require 任何 src/db 之前设置 ——
process.env.NODE_ENV = 'test';
// 用更快的 bcrypt 轮数，加速测试
process.env.BCRYPT_ROUNDS = '4';
// 每个进程一个唯一临时库，避免并发测试互相污染
const tmpPath = path.join(
  os.tmpdir(),
  'chenguang-test-' + process.pid + '-' + Date.now() + '.db'
);
process.env.DB_PATH = tmpPath;

// 现在安全地初始化：db/index.js 在 require 时打开 config.dbPath
// initDatabase 内部是同步 db.exec（无 await），函数体在加载时即执行完毕，
// 因此建表在测试/钩子之前完成，无需 beforeEach。
const { initDatabase } = require('../src/db/index');
initDatabase();

// 测试结束清理临时 DB 文件（含 WAL/SHM 副文件），
// 并关闭 bcrypt worker 线程池，否则 worker 会让 node 进程保持存活而无法退出。
after(() => {
  require('../src/utils/hashPool').close();
  [tmpPath, tmpPath + '-wal', tmpPath + '-shm', tmpPath + '-journal'].forEach((p) => {
    try { fs.unlinkSync(p); } catch (_) { /* 已删除则忽略 */ }
  });
});

module.exports = { tmpPath };
