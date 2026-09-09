/**
 * 数据库初始化脚本 (MySQL)
 * - 读取 init.sql, 按语句拆分后逐条执行 (避免开启多语句)
 * - 幂等 (可重复执行, 表用 IF NOT EXISTS)
 * 运行: npm run db:init
 * 重置: npm run db:reset  (先 DROP 四张表再重建)
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const TABLES = ['study_records', 'checkins', 'tasks', 'users'];

// 按分号拆分, 逐段去除行内/整行 "--" 注释后, 保留非空语句
function splitStatements(sql) {
  return sql
    .split(';')
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.replace(/--.*$/, '')) // 去掉行尾注释
        .join('\n')
        .trim()
    )
    .filter((s) => s.length > 0);
}

async function init() {
  const reset = process.argv.includes('--reset');
  const sqlPath = path.join(__dirname, 'init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const statements = splitStatements(sql);

  if (reset) {
    console.log('[db:init] --reset: 先删除旧表 ...');
    for (const t of TABLES) {
      await pool.query(`DROP TABLE IF EXISTS ${t}`);
      console.log(`  - dropped ${t}`);
    }
  }

  console.log(`[db:init] 开始执行 init.sql (${statements.length} 条语句) ...`);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  console.log('[db:init] 数据表初始化完成 ✓');

  await pool.end();
  process.exit(0);
}

init().catch((err) => {
  console.error('[db:init] 初始化失败:', err.message);
  process.exit(1);
});
