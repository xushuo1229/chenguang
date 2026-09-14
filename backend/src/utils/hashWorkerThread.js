/**
 * 知行 · 哈希工作线程入口
 * ------------------------------------------------------------
 * 在独立线程中执行 bcryptjs 的同步哈希/校验，避免阻塞主事件循环。
 * 与主线程的通信协议见 utils/hashPool.js
 */
const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', ({ id, op, plain, hash, rounds }) => {
  try {
    if (op === 'hash') {
      parentPort.postMessage({ id, ok: true, value: bcrypt.hashSync(plain, rounds) });
    } else if (op === 'compare') {
      parentPort.postMessage({ id, ok: true, value: bcrypt.compareSync(plain, hash) });
    } else {
      parentPort.postMessage({ id, ok: false, error: '未知操作: ' + op });
    }
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e.message });
  }
});
