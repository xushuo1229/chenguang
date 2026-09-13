const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');

const { buildMetrics, cleanupBetaUsers, parseArgs } = require('../scripts/betaOps');

const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

function createTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chenguang-beta-ops-'));
  const dbPath = path.join(dir, 'beta.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  return { db, dbPath };
}

function seedUser(db, email, payload) {
  const user = db.prepare(
    `INSERT INTO users (email, nickname, password_hash) VALUES (?, ?, ?) RETURNING id`
  ).get(email, 'Beta User', 'hash');
  db.prepare(
    'INSERT INTO user_data (user_id, payload, revision) VALUES (?, ?, 1)'
  ).run(user.id, JSON.stringify(payload));
  return user.id;
}

test('beta metrics 只读导出激活、记录和回访摘要', () => {
  const { db, dbPath } = createTempDb();
  try {
    seedUser(db, 'active@example.com', {
      goals: [{ id: 'g1', status: 'completed' }],
      checkins: [{ date: '2026-09-13' }],
      todos: [{ date: '2026-09-14', done: true }],
    });
    seedUser(db, 'empty@example.com', { goals: [] });

    const result = buildMetrics(dbPath);
    assert.equal(result.summary.totalUsers, 2);
    assert.equal(result.summary.activatedUsers, 1);
    assert.equal(result.summary.returnedDay2, 1);
    assert.equal(result.summary.returnedWithin7Days, 1);
    assert.equal(result.summary.behaviorRecords, 2);
    assert.equal(result.summary.completedGoals, 1);
    assert.ok(result.users.every((user) => !('email' in user)));
  } finally {
    db.close();
  }
});

test('beta cleanup 只删除精确匹配的邮箱及其数据', () => {
  const { db, dbPath } = createTempDb();
  try {
    const removedId = seedUser(db, 'Remove@Example.com', { goals: [] });
    const keptId = seedUser(db, 'keep@example.com', { goals: [] });

    const result = cleanupBetaUsers({
      dbPath,
      emails: ['remove@example.com'],
      confirm: true,
    });

    assert.equal(result.removedCount, 1);
    assert.equal(result.removed[0].id, removedId);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
    assert.equal(db.prepare('SELECT id FROM users WHERE id = ?').get(keptId).id, keptId);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_data WHERE user_id = ?').get(removedId).count, 0);
  } finally {
    db.close();
  }
});

test('beta cleanup 缺少确认或试图清空全部用户时拒绝执行', () => {
  const { db, dbPath } = createTempDb();
  try {
    seedUser(db, 'only@example.com', {});
    assert.throws(
      () => cleanupBetaUsers({ dbPath, emails: ['only@example.com'] }),
      /BETA_OPS_CONFIRM/
    );
    assert.throws(
      () => cleanupBetaUsers({ dbPath, emails: ['only@example.com'], confirm: true }),
      /全部用户/
    );
  } finally {
    db.close();
  }
});

test('beta CLI 参数解析支持重复 email', () => {
  const options = parseArgs([
    'cleanup', '--db', 'test.db', '--email', 'a@example.com',
    '--email', 'b@example.com', '--yes',
  ]);
  assert.deepEqual(options.email, ['a@example.com', 'b@example.com']);
  assert.equal(options.db, 'test.db');
  assert.equal(options.yes, true);
});
