#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const BEHAVIOR_COLLECTIONS = [
  'checkins', 'sports', 'readings', 'english', 'todos', 'focus',
];

function defaultDbPath() {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, '..', 'chenguang.db');
}

function resolveDbPath(input) {
  return path.resolve(input || defaultDbPath());
}

function openDatabase(dbPath, { readOnly = false } = {}) {
  const resolvedPath = resolveDbPath(dbPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`数据库不存在：${resolvedPath}`);
  }

  return new Database(resolvedPath, readOnly
    ? { fileMustExist: true, readonly: true }
    : { fileMustExist: true });
}

function parsePayload(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function toDateKey(value) {
  const match = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function buildUserMetrics(userId, payload) {
  const activeDates = new Set();
  let recordCount = 0;

  BEHAVIOR_COLLECTIONS.forEach((collection) => {
    list(payload[collection]).forEach((record) => {
      if (!record || typeof record !== 'object') return;
      recordCount += 1;
      const dateKey = toDateKey(record.date);
      if (dateKey) activeDates.add(dateKey);
    });
  });

  const goals = list(payload.goals);
  const dates = [...activeDates].sort();
  const firstDate = dates[0] || null;
  const lastDate = dates[dates.length - 1] || null;
  const returnedDay2 = Boolean(firstDate && dates.some((date) => date === addDays(firstDate, 1)));
  const returnedWithin7Days = Boolean(firstDate && dates.some((date) =>
    date > firstDate && date <= addDays(firstDate, 7)));

  return {
    userId,
    activated: goals.length > 0,
    goalCount: goals.length,
    completedGoalCount: goals.filter((goal) =>
      goal && typeof goal === 'object' && ['completed', 'done'].includes(goal.status)).length,
    recordCount,
    activeDays: dates.length,
    firstDate,
    lastDate,
    returnedDay2,
    returnedWithin7Days,
  };
}

function buildMetrics(dbPath) {
  const resolvedPath = resolveDbPath(dbPath);
  const db = openDatabase(resolvedPath, { readOnly: true });

  try {
    const users = db.prepare('SELECT id, created_at FROM users ORDER BY id').all();
    const userDataRows = db.prepare('SELECT user_id, payload FROM user_data ORDER BY user_id').all();
    const payloadByUser = new Map(userDataRows.map((row) => [row.user_id, parsePayload(row.payload)]));
    const users2 = users.map((user) => {
      const metrics = buildUserMetrics(user.id, payloadByUser.get(user.id) || {});
      return { ...metrics, registeredAt: user.created_at };
    });

    const activatedUsers = users2.filter((user) => user.activated).length;
    const recordedUsers = users2.filter((user) => user.recordCount > 0).length;
    const returnedDay2 = users2.filter((user) => user.returnedDay2).length;
    const returnedWithin7Days = users2.filter((user) => user.returnedWithin7Days).length;
    const totalUsers = users2.length;

    return {
      generatedAt: new Date().toISOString(),
      dbPath: resolvedPath,
      summary: {
        totalUsers,
        activatedUsers,
        activationRate: totalUsers ? activatedUsers / totalUsers : 0,
        recordedUsers,
        recordedRate: totalUsers ? recordedUsers / totalUsers : 0,
        returnedDay2,
        returnedWithin7Days,
        behaviorRecords: users2.reduce((sum, user) => sum + user.recordCount, 0),
        activeDays: users2.reduce((sum, user) => sum + user.activeDays, 0),
        goals: users2.reduce((sum, user) => sum + user.goalCount, 0),
        completedGoals: users2.reduce((sum, user) => sum + user.completedGoalCount, 0),
        averageRecordsPerUser: totalUsers
          ? users2.reduce((sum, user) => sum + user.recordCount, 0) / totalUsers
          : 0,
        aiCalls: '请从服务器日志统计 POST /api/ai/chat 200 次数',
      },
      users: users2,
    };
  } finally {
    db.close();
  }
}

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`无效邮箱：${email}`);
  }
  return value;
}

function cleanupBetaUsers({ dbPath, emails, confirm = false, allowAll = false }) {
  if (!Array.isArray(emails) || emails.length === 0) {
    throw new Error('必须提供至少一个 --email');
  }
  if (!confirm) {
    throw new Error('清理操作必须同时提供 --yes 和 BETA_OPS_CONFIRM=YES');
  }

  const normalizedEmails = [...new Set(emails.map(normalizeEmail))];
  const resolvedPath = resolveDbPath(dbPath);
  const db = openDatabase(resolvedPath);

  try {
    db.pragma('foreign_keys = ON');
    const placeholders = normalizedEmails.map(() => '?').join(', ');
    const found = db.prepare(
      `SELECT id, email FROM users WHERE lower(email) IN (${placeholders}) ORDER BY id`
    ).all(...normalizedEmails);
    const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;

    if (found.length === totalUsers && !allowAll) {
      throw new Error('拒绝删除数据库中的全部用户；如确要清空，请额外提供 --allow-all');
    }

    const removeUser = db.transaction((userId) => {
      db.prepare('DELETE FROM user_data WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });

    found.forEach((user) => removeUser(user.id));

    return {
      dbPath: resolvedPath,
      requestedEmails: normalizedEmails,
      removed: found.map((user) => ({ id: user.id, email: user.email })),
      removedCount: found.length,
    };
  } finally {
    db.close();
  }
}

function printUsage() {
  console.log([
    '用法:',
    '  node scripts/betaOps.js metrics [--db <path>]',
    '  node scripts/betaOps.js cleanup --db <path> --email <email> [--email <email>...] --yes [--allow-all]',
    '',
    '清理命令还必须设置环境变量 BETA_OPS_CONFIRM=YES。',
  ].join('\n'));
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else if (options[key]) {
      options[key] = Array.isArray(options[key]) ? [...options[key], next] : [options[key], next];
      index += 1;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];

  if (command === 'metrics') {
    console.log(JSON.stringify(buildMetrics(options.db), null, 2));
    return;
  }

  if (command === 'cleanup') {
    const confirm = options.yes === true && process.env.BETA_OPS_CONFIRM === 'YES';
    const emails = Array.isArray(options.email) ? options.email : (options.email ? [options.email] : []);
    console.log(JSON.stringify(cleanupBetaUsers({
      dbPath: options.db,
      emails,
      confirm,
      allowAll: options['allow-all'] === true,
    }), null, 2));
    return;
  }

  printUsage();
  process.exitCode = command ? 1 : 0;
}

if (require.main === module) {
  main();
}

module.exports = {
  BEHAVIOR_COLLECTIONS,
  buildMetrics,
  cleanupBetaUsers,
  parseArgs,
};
