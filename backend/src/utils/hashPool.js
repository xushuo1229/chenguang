/**
 * 知行 · bcrypt 线程池
 * ------------------------------------------------------------
 * 把 bcryptjs 的 CPU 密集计算（10 轮哈希约 80ms）从主事件循环
 * 移到 worker 线程池，登录风暴时不再拖慢同进程的其它接口。
 *
 * - 池大小：min(4, CPU 核数 - 1)，至少 2
 * - 保持 bcryptjs 依赖不变，已有密码哈希完全兼容
 * - 对外仅暴露 hash(plain) / compare(plain, hash) 两个 Promise API
 */
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

const WORKER_FILE = path.join(__dirname, 'hashWorkerThread.js');
const POOL_SIZE = Math.max(2, Math.min(4, (os.cpus() || [1]).length - 1));

const workers = []; // 保活引用
const free = [];    // 空闲 worker
const queue = [];   // 等待的任务 { msg, resolve, reject }
let initialized = false;
let seq = 0;

function spawnWorker() {
  const w = new Worker(WORKER_FILE);
  // 不把 worker 当作保活事件源：服务端靠 HTTP listener 保活，
  // 测试进程（node --test）才能在所有用例跑完后正常退出。
  w.unref();
  w.__job = null;

  w.on('message', (msg) => {
    const job = w.__job;
    w.__job = null;
    free.push(w);
    if (job) {
      if (msg.ok) job.resolve(msg.value);
      else job.reject(new Error(msg.error || '哈希线程执行失败'));
    }
    dispatch();
  });

  w.on('error', (err) => {
    const job = w.__job;
    w.__job = null;
    if (job) job.reject(err);
    // 线程意外退出后补充一个新线程，维持池大小
    const idx = workers.indexOf(w);
    if (idx >= 0) workers[idx] = spawnWorker();
  });

  workers.push(w);
  return w;
}

function ensureInit() {
  if (initialized) return;
  initialized = true;
  for (let i = 0; i < POOL_SIZE; i++) {
    free.push(spawnWorker());
  }
}

function dispatch() {
  while (free.length && queue.length) {
    const job = queue.shift();
    const w = free.pop();
    w.__job = job;
    w.postMessage({ id: ++seq, ...job.msg });
  }
}

function run(op, params) {
  ensureInit();
  return new Promise((resolve, reject) => {
    queue.push({ msg: { op, ...params }, resolve, reject });
    dispatch();
  });
}

/** 计算 bcrypt 哈希（线程池中执行） */
function hash(plain, rounds) {
  return run('hash', { plain, rounds });
}

/** 校验明文与哈希是否匹配（线程池中执行） */
function compare(plain, hashValue) {
  return run('compare', { plain, hash: hashValue });
}

/**
 * 关闭线程池并终止所有 worker。
 * 仅在进程即将退出时调用（如测试 teardown、优雅停机），
 * 否则 worker 线程会让 node 进程保持存活而无法退出。
 */
function close() {
  initialized = false;
  workers.slice().forEach(function (w) {
    try { w.terminate(); } catch (_) { /* 已终止则忽略 */ }
  });
  workers.length = 0;
  free.length = 0;
  queue.length = 0;
}

module.exports = { hash, compare, close };
