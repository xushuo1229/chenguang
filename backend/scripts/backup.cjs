#!/usr/bin/env node
/**
 * Zeno · SQLite 在线备份
 * ============================================================
 * 使用 better-sqlite3 的 backup()，在 WAL 模式下也能得到一致性快照
 * （不会拷贝到半个事务），备份期间服务可继续读写。
 *
 * 用法：
 *   node scripts/backup.cjs
 * 环境变量：
 *   DB_PATH        数据库路径（默认 backend/chenguang.db）
 *   BACKUP_DIR     备份目录（默认 backend/backups）
 *   BACKUP_KEEP    保留份数（默认 14），超出按时间删除最旧
 *
 * 建议用系统计划任务定时执行：
 *   Windows 任务计划程序 / Linux cron（如每 6 小时）：
 *   0 0,6,12,18 * * * cd /app/backend && node scripts/backup.cjs
 */
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbPath = path.resolve(
  process.env.DB_PATH || path.join(__dirname, '..', 'chenguang.db')
);
const backupDir = path.resolve(
  process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups')
);
const keep = Math.max(1, parseInt(process.env.BACKUP_KEEP, 10) || 14);

if (!fs.existsSync(dbPath)) {
  console.error('[backup] 数据库文件不存在:', dbPath);
  process.exit(1);
}
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, 'chenguang-' + stamp + '.db');

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.backup(target)
  .then(() => {
    db.close();
    const stat = fs.statSync(target);
    console.log('[backup] 已保存 ' + target + ' (' + (stat.size / 1048576).toFixed(2) + ' MB)');

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^chenguang-.*\.db$/.test(f))
      .map((f) => ({ f: f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    const stale = files.slice(keep);
    stale.forEach((item) => fs.unlinkSync(path.join(backupDir, item.f)));
    console.log('[backup] 保留最近 ' + keep + ' 份，清理 ' + stale.length + ' 份旧备份');
  })
  .catch((err) => {
    db.close();
    console.error('[backup] 备份失败:', err.message);
    process.exit(1);
  });
