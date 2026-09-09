/**
 * 晨光自律台 · 后端压力测试脚本
 * ------------------------------------------------------------
 * 用法:  node stress/stress-test.mjs <scenario>
 *
 * 场景:
 *   burst    生产限流突刺测试（验证限流器行为）
 *   health   GET /api/health       — 基线吞吐（纯事件循环）
 *   login    POST /api/auth/login  — bcrypt CPU 密集
 *   read     GET  /api/data        — 鉴权读（核心同步接口）
 *   write    PUT  /api/data        — SQLite 单写者 + JSON 快照回写
 *   mixed    80% 读 + 20% 写       — 混合真实负载
 *
 * 环境变量:
 *   CONCURRENCY  并发数（默认 20）
 *   DURATION_MS  持续时间（默认 10000）
 */

const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const DURATION_MS = parseInt(process.env.DURATION_MS || '10000', 10);

// 测试账号（本地开发库中已存在）
const EMAIL = process.env.TEST_EMAIL || 'testbug05@chenguang.com';
const PASSWORD = process.env.TEST_PASSWORD || 'test123456';

const scenario = process.argv[2] || 'read';

/* ---------- 工具 ---------- */

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function buildPayload() {
  // 模拟真实规模的 chenguangData 快照（约 3KB）
  const mk = (n, fn) => Array.from({ length: n }, fn);
  return {
    user: { name: '压测同学', startDate: '2026-09-01', totalDays: 6, continuousDays: 3 },
    checkins: mk(30, (_, i) => ({ id: 'ck' + i, date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, status: 'done' })),
    sports: mk(20, (_, i) => ({ id: 'sp' + i, date: '2026-09-06', name: '跑步', calories: 200 + i, duration: 30, type: '跑步' })),
    readings: mk(15, (_, i) => ({ id: 'rd' + i, date: '2026-09-06', bookName: '书' + i, pages: 50, totalPages: 300 })),
    courses: mk(8, (_, i) => ({ id: 'cs' + i, name: '课程' + i, totalChapters: 20, learnedChapters: i, progress: i * 5, status: 'doing' })),
    english: mk(20, (_, i) => ({ id: 'en' + i, date: '2026-09-06', words: 20, minutes: 15 })),
    todos: mk(25, (_, i) => ({ id: 'td' + i, text: '任务' + i, date: '2026-09-06', done: i % 2 === 0, priority: 'mid' })),
    focus: mk(12, (_, i) => ({ id: 'fc' + i, date: '2026-09-06', minutes: 25, task: '专注' + i })),
  };
}

async function login() {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok || !json.token) throw new Error('登录失败: ' + JSON.stringify(json).slice(0, 200));
  return json.token;
}

/* ---------- 压测引擎 ---------- */

async function runLoad({ name, worker }) {
  const latencies = [];
  const errors = {};
  let ok = 0, total = 0;
  const stopAt = Date.now() + DURATION_MS;

  async function loop() {
    while (Date.now() < stopAt) {
      const t0 = performance.now();
      let status = 0;
      try {
        status = await worker();
      } catch (e) {
        status = -1; // 网络异常
      }
      const dt = performance.now() - t0;
      total++;
      latencies.push(dt);
      if (status >= 200 && status < 300) ok++;
      else errors[status] = (errors[status] || 0) + 1;
    }
  }

  const t0 = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, loop));
  const wallMs = performance.now() - t0;

  latencies.sort((a, b) => a - b);
  const rps = (total / wallMs * 1000).toFixed(1);
  const report = {
    场景: name,
    并发: CONCURRENCY,
    总请求: total,
    成功: ok,
    RPS: rps,
    'p50(ms)': percentile(latencies, 50).toFixed(1),
    'p90(ms)': percentile(latencies, 90).toFixed(1),
    'p95(ms)': percentile(latencies, 95).toFixed(1),
    'p99(ms)': percentile(latencies, 99).toFixed(1),
    错误分布: Object.keys(errors).length ? errors : '无',
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/* ---------- 场景实现 ---------- */

const headers = (token) => ({
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  ...(token ? { Authorization: 'Bearer ' + token } : {}),
});

async function main() {
  console.log(`>>> 压测目标: ${BASE}  场景: ${scenario}  并发: ${CONCURRENCY}  时长: ${DURATION_MS}ms\n`);

  if (scenario === 'burst') {
    // 生产限流突刺：串行快速打 130 发，观察 429 出现位置
    const results = [];
    for (let i = 0; i < 130; i++) {
      const res = await fetch(BASE + '/health');
      results.push(res.status);
      if (res.status === 429) {
        const rl = res.headers.get('ratelimit-remaining');
        if (i === 0 || rl === '0') { /* 首个 429 */ }
      }
    }
    const first429 = results.indexOf(429);
    const counts = results.reduce((m, s) => ((m[s] = (m[s] || 0) + 1), m), {});
    console.log(JSON.stringify({
      场景: '生产限流突刺（串行 130 发 GET /api/health）',
      状态分布: counts,
      首个429位置: first429 >= 0 ? '第 ' + (first429 + 1) + ' 发' : '未触发',
    }, null, 2));
    return;
  }

  const token = await login();

  if (scenario === 'health') {
    await runLoad({
      name: 'GET /api/health（基线）',
      worker: async () => (await fetch(BASE + '/health')).status,
    });
  } else if (scenario === 'login') {
    await runLoad({
      name: 'POST /api/auth/login（bcrypt 10 轮）',
      worker: async () => {
        const res = await fetch(BASE + '/auth/login', {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        });
        return res.status;
      },
    });
  } else if (scenario === 'read') {
    await runLoad({
      name: 'GET /api/data（鉴权读，整份快照）',
      worker: async () => (await fetch(BASE + '/data', { headers: headers(token) })).status,
    });
  } else if (scenario === 'write') {
    const payload = JSON.stringify({ data: buildPayload() });
    await runLoad({
      name: 'PUT /api/data（~3KB 快照回写）',
      worker: async () => (await fetch(BASE + '/data', { method: 'PUT', headers: headers(token), body: payload })).status,
    });
  } else if (scenario === 'mixed') {
    const payload = JSON.stringify({ data: buildPayload() });
    let seq = 0;
    await runLoad({
      name: '混合负载 80% 读 + 20% 写',
      worker: async () => {
        seq++;
        if (seq % 5 === 0) {
          return (await fetch(BASE + '/data', { method: 'PUT', headers: headers(token), body: payload })).status;
        }
        return (await fetch(BASE + '/data', { headers: headers(token) })).status;
      },
    });
  } else {
    console.error('未知场景: ' + scenario);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('压测失败:', e.message);
  process.exit(1);
});
