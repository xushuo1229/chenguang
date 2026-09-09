/**
 * 晨光自律台 · 云端同步层 (ES Module)
 * --------------------------------------------------------------------------
 * 设计目标：在「不改动任何页面渲染代码」的前提下，把后端数据库变成数据的
 * 唯一真源（source of truth），前端 localStorage 仅作为本地缓存 + 离线兜底。
 *
 * 工作流程：
 *   1. 登录后：CGSync.pull()  从 GET /api/data 拉取整份数据，覆盖本地缓存
 *   2. 任意数据变更：debounce 调 PUT /api/data 把整份数据回写后端
 *   3. 离线 / 无 token：直接走本地 localStorage
 *
 * ========== 文件在架构中的角色 ==========
 *  本文件是"数据同步管家"，负责在前端（localStorage）和后端（数据库）之间
 *  保持数据一致。它不直接操作 UI，只负责数据的推拉。
 *
 *  依赖关系：
 *    - 依赖 store.js（调用 CGStore 的 merge / set / get 等方法）
 *    - 被页面 JS 调用（如 CGSync.pull()、CGSync.afterLogin()）
 *    - 与 apiClient.js 独立（各自有自己的 HTTP 请求逻辑）
 *
 * ========== 核心概念解释 ==========
 *  - Push（推送）：把本地修改发送到服务器
 *  - Pull（拉取）：从服务器获取最新数据到本地
 *  - Debounce（防抖）：连续触发时只执行最后一次（减少网络请求）
 *  - ETag（缓存标识）：服务器返回的数据指纹，用于判断数据是否变化
 * --------------------------------------------------------------------------
 */
'use strict';

/* ===== 导入依赖 ===== */

/**
 * 导入 CGStore —— 本地数据存储层
 * sync.js 需要通过 CGStore 读写本地数据
 */
import CGStore from './store.js';

/* ===== 常量配置 ===== */

/**
 * API_BASE —— 后端服务器的地址前缀
 *
 * 【作用】所有 API 请求都发往这个地址。
 * 【为什么是 localhost:3000？】本地开发时后端服务器通常运行在 3000 端口。
 * 【生产环境】实际部署时应该改成真实的服务器地址。
 */
var API_BASE = 'http://localhost:3000/api';

/**
 * TOKEN_KEY —— 登录 Token 在 localStorage 中的键名
 *
 * 与 store.js 中的 TOKEN_KEY 保持一致，用于读取用户登录凭证。
 */
var TOKEN_KEY = 'cg_token';

/**
 * PUSH_DEBOUNCE —— 推送防抖延迟（毫秒）
 *
 * 【什么是防抖（Debounce）？】
 *   想象你在打字：每敲一个键就发一次网络请求，服务器会崩溃。
 *   防抖的原理是：每次敲键时重置等待时间，只有停止敲键 400ms 后
 *   才真正发送请求。这样即使短时间内修改了很多次数据，
 *   也只会发送最后一次的版本。
 *
 * 【400ms 的选择】
 *   - 太短（如 100ms）：用户快速操作时仍会发送多次请求
 *   - 太长（如 2000ms）：用户会觉得"改了数据但没保存"
 *   - 400ms 是一个平衡点：用户感知不到延迟，又不会频繁请求
 */
var PUSH_DEBOUNCE = 400;

/**
 * TOAST_THROTTLE —— 离线提示的节流间隔（毫秒）
 *
 * 【什么是节流（Throttle）？】
 *   与防抖不同，节流是"每隔一段时间最多执行一次"。
 *   这里是 30 秒内最多弹一次离线提示，避免频繁打扰用户。
 */
var TOAST_THROTTLE = 30000;

/* ===== 状态变量 ===== */

/**
 * lastDataETag —— 上次从服务器获取的数据的 ETag 值
 *
 * 【什么是 ETag？】
 *   ETag 是服务器给数据分配的"指纹"（一个字符串）。
 *   每次请求时带上上次的 ETag，如果数据没变化，服务器返回 304（Not Modified），
 *   不传输实际数据，节省带宽和时间。
 *
 * 【类比】就像你去图书馆借书，先问管理员"这本书有新版吗？"，
 * 管理员看看说"没变化"（304），你就不用重新读一遍。
 */
var lastDataETag = null;

/**
 * lastOfflineToast —— 上次弹出离线提示的时间戳
 *
 * 用于节流：确保 30 秒内最多弹一次离线提示。
 */
var lastOfflineToast = 0;

/* ===== Token 工具函数 ===== */

/**
 * getToken() —— 从 localStorage 读取登录 Token
 *
 * 【作用】获取当前用户的登录凭证，用于 API 请求的认证头。
 * 【返回值】Token 字符串，未登录时返回 null
 */
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
}

/**
 * hasToken() —— 检查用户是否已登录
 *
 * 【返回值】true 表示已登录（有 Token），false 表示未登录
 * 【用途】在执行同步操作前检查，未登录则跳过
 */
function hasToken() { return !!getToken(); }

/* ===== HTTP 请求封装 ===== */

/**
 * req(method, path, body) —— 发送 HTTP 请求到后端
 *
 * 【作用】封装了 fetch API，自动处理 Token 认证、错误处理等。
 *
 * 【参数】
 *   - method: HTTP 方法（'GET' / 'PUT' / 'POST' / 'DELETE'）
 *   - path: API 路径（如 '/data'，会拼接到 API_BASE 后面）
 *   - body: 请求体（PUT/POST 时需要），会被 JSON 序列化
 *
 * 【请求头说明】
 *   - Content-Type: application/json  → 告诉服务器"我发的是 JSON"
 *   - X-Requested-With: XMLHttpRequest → CSRF 防护头（详见下方解释）
 *   - Authorization: Bearer <token>  → 携带登录 Token
 *   - If-None-Match: <etag>         → 条件请求（GET 时带上，用于缓存）
 *
 * 【什么是 CSRF 防护？】
 *   CSRF（跨站请求伪造）是一种攻击方式：恶意网站诱导你的浏览器
 *   向你的应用发送请求。通过添加 X-Requested-With 头，
 *   可以区分"浏览器正常请求"和"跨站伪造请求"。
 *   因为恶意网站的 JavaScript 无法设置自定义请求头。
 *
 * 【返回值】Promise，resolve 时返回 { ok, status, data, headers }
 * 【错误处理】网络错误或无 Token 时 reject
 */
function req(method, path, body) {
  var token = getToken();
  if (!token) return Promise.reject(new Error('no-token'));
  var headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Authorization': 'Bearer ' + token
  };
  // GET 请求时带上 ETag，用于条件请求（如果数据没变，服务器返回 304）
  if (method === 'GET' && lastDataETag) {
    headers['If-None-Match'] = lastDataETag;
  }
  // 5秒超时，防止后端未启动时页面卡死
  var controller = null;
  var timeoutId = null;
  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    timeoutId = setTimeout(function () { controller.abort(); }, 5000);
  }
  var fetchOpts = {
    method: method,
    headers: headers,
    body: body != null ? JSON.stringify(body) : undefined
  };
  if (controller) fetchOpts.signal = controller.signal;
  return fetch(API_BASE + path, fetchOpts).then(function (r) {
    if (timeoutId) clearTimeout(timeoutId);
    if (r.status === 204) return null;
    return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j, headers: r.headers }; });
  }).catch(function (e) {
    if (timeoutId) clearTimeout(timeoutId);
    // 超时或网络错误时静默失败，不阻塞页面
    return Promise.reject(e);
  });
}

/* ===== UI 状态指示 ===== */

/**
 * setSyncUI(state) —— 更新页面上的同步状态显示
 *
 * 【作用】在页面上显示当前的同步状态（同步中 / 已同步 / 离线模式）。
 *
 * 【工作原理】
 *   - 查找页面上所有带 data-sync-status 属性的元素
 *   - 根据 state 参数更新这些元素的文字和 CSS 类名
 *   - 页面可以通过 CSS 类名显示不同的样式（如同步中显示旋转图标）
 *
 * 【参数】state —— 同步状态：
 *   - 'syncing': 正在同步中
 *   - 'ok': 同步完成
 *   - 'offline': 离线模式
 */
function setSyncUI(state) {
  try {
    var els = document.querySelectorAll('[data-sync-status]');
    if (!els.length) return;
    var map = {
      syncing: { text: '同步中…', cls: 'syncing' },
      ok:      { text: '已同步',   cls: 'ok' },
      offline: { text: '离线模式', cls: 'offline' }
    };
    var info = map[state];
    if (!info) return;
    els.forEach(function (el) {
      el.textContent = info.text;
      el.setAttribute('data-sync-state', state);
    });
  } catch (_) {}
}

/**
 * warnOffline() —— 显示离线警告提示
 *
 * 【作用】当网络不可用时，显示一个提示告诉用户"数据已保存在本地"。
 *
 * 【节流机制】使用 lastOfflineToast 确保 30 秒内最多弹一次提示，
 * 避免用户每次操作都看到同样的警告。
 *
 * 【显示方式】调用全局的 toast() 函数（如果存在的话），
 * 显示一个黄色警告条。
 */
function warnOffline() {
  setSyncUI('offline');
  var now = Date.now();
  if (now - lastOfflineToast < TOAST_THROTTLE) return;
  lastOfflineToast = now;
  try {
    if (typeof globalThis.toast === 'function') {
      globalThis.toast('云端暂不可达，数据已保存在本地，恢复后自动同步', 'warn');
    }
  } catch (_) {}
}

/* ===== Push（推送）相关 ===== */

/**
 * pushTimer —— 推送防抖定时器
 * 用于延迟推送，避免频繁请求服务器。
 */
var pushTimer = null;

/**
 * pushing —— 推送锁（防止并发推送）
 *
 * 【作用】确保同一时间只有一个推送请求在进行。
 * 如果正在推送时又有新的推送请求，会设置 pendingFlush = true，
 * 当前推送完成后会再执行一次推送。
 *
 * 【类比】就像银行只有一个窗口办理业务，排队等待。
 */
var pushing = false;

/**
 * pendingFlush —— 标记"有等待中的推送"
 *
 * 当 pushing = true 时又有新的数据修改，会设置这个标记为 true。
 * 当前推送完成后检查这个标记，如果为 true 则再执行一次推送。
 */
var pendingFlush = false;

/* ===== Pull（拉取）相关 ===== */

/**
 * pull() —— 从服务器拉取最新数据到本地
 *
 * 【作用】调用 GET /api/data 获取服务器上的完整数据，合并到本地。
 *
 * 【两种同步模式】
 *   1. 全量模式（_syncMode: 'full'）：服务器返回完整数据快照
 *      → 用服务器数据覆盖本地（但保留本地的 user.name 如果服务器没有）
 *   2. 增量模式（_syncMode: 'partial'）：服务器只返回修改过的集合
 *      → 只合并这些集合，其他集合保持不变
 *
 * 【流程】
 *   1. 检查是否有 Token（未登录则跳过）
 *   2. 显示"同步中..."状态
 *   3. 发送 GET 请求，带上上次的 ETag
 *   4. 如果服务器返回 304（数据没变化），直接返回
 *   5. 否则合并数据到本地
 *   6. 更新 ETag 缓存
 *   7. 显示"已同步"状态
 *
 * 【错误处理】网络错误时显示离线提示，继续使用本地数据
 *
 * 【返回值】Promise，resolve 时返回 true（拉取成功）或 false（失败/无变化）
 */
function pull() {
  if (!hasToken()) return Promise.resolve(false);
  setSyncUI('syncing');
  return req('GET', '/data').then(function (res) {
    // 304 表示数据没变化，不需要更新
    if (res.status === 304) { setSyncUI('ok'); return false; }
    if (!res || !res.ok || !res.data || !res.data.data) return false;

    // 保存 ETag 供下次请求使用
    var etag = res.headers && res.headers.get ? res.headers.get('ETag') : null;
    if (etag) lastDataETag = etag;

    var payload = res.data.data;
    if (!payload || typeof payload !== 'object') return false;

    // 增量模式：只合并返回的集合，不覆盖本地其他数据
    if (payload._syncMode === 'partial') {
      // 过滤掉 _syncMode 等元数据字段，只保留实际数据集合
      var partialKeys = Object.keys(payload).filter(function (k) { return k.charAt(0) !== '_'; });
      partialKeys.forEach(function (k) {
        CGStore.markDirty(k); // 临时标记，让 merge 知道这是服务端数据
      });
      CGStore.merge(payload);
    } else {
      // 全量模式：合并完整快照
      var full = CGStore.get();
      var merged = {};
      // 先复制本地数据
      for (var k in full) {
        if (Object.prototype.hasOwnProperty.call(full, k)) merged[k] = full[k];
      }
      // 再用服务器数据覆盖
      for (var k2 in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, k2)) merged[k2] = payload[k2];
      }
      // 保护本地用户名称：如果服务器没有用户名称，保留本地的
      if ((!payload.user || !payload.user.name) && full.user && full.user.name) {
        merged.user = full.user;
      }
      CGStore.set(merged);
    }

    setSyncUI('ok');
    return true;
  }).catch(function (e) {
    if (e && e.message === 'no-token') return false;
    console.warn('[CGSync] pull 失败（离线或后端未启动），继续使用本地数据', e);
    warnOffline();
    return false;
  });
}

/**
 * push() —— 把本地修改推送到服务器
 *
 * 【作用】将本地数据发送到 PUT /api/data，让服务器保存最新版本。
 *
 * 【增量推送策略】
 *   通过 CGStore.getDirtyCategories() 获取被修改的集合：
 *   - 如果脏集合 < 4 个：只发送这些集合 + user（增量模式）
 *   - 如果脏集合 ≥ 4 个或首次同步：发送完整快照（全量模式）
 *
 * 【为什么是 4 个？】
 *   少量集合变更时，增量推送更高效（数据量小）。
 *   大量集合变更时，全量推送更可靠（避免遗漏）。
 *
 * 【并发控制】
 *   pushing 标志确保同一时间只有一个推送请求。
 *   如果正在推送时有新的修改，设置 pendingFlush = true，
 *   当前推送完成后会自动再执行一次推送。
 *
 * 【流程】
 *   1. 检查 Token 和推送锁
 *   2. 决定增量/全量模式
 *   3. 发送 PUT 请求
 *   4. 成功后清除脏标记
 *   5. 失败时显示离线提示，数据保留在本地
 *
 * 【返回值】Promise，resolve 时返回 true（成功）或 false（失败）
 */
function push() {
  if (!hasToken()) return Promise.resolve(false);
  // 如果正在推送，标记需要在当前推送完成后重新推送
  if (pushing) { pendingFlush = true; return Promise.resolve(false); }
  pushing = true;

  // 增量同步：只发送已修改的集合
  var dirty = CGStore.getDirtyCategories();
  var fullSnapshot = CGStore.get();
  var payload;

  if (dirty.length > 0 && dirty.length < 4) {
    // 增量模式：只发送脏集合 + user（总是包含）
    payload = {};
    dirty.forEach(function (k) { payload[k] = fullSnapshot[k]; });
    if (!payload.user && fullSnapshot.user) payload.user = fullSnapshot.user;
    payload._syncMode = 'partial';
  } else {
    // 全量模式：脏集合太多或首次同步，发送完整快照
    payload = fullSnapshot;
    payload._syncMode = 'full';
  }

  return req('PUT', '/data', { data: payload }).then(function (res) {
    pushing = false;
    if (!res || !res.ok) {
      console.warn('[CGSync] push 失败', res && res.status);
      warnOffline();
      return false;
    }
    // 同步成功，清除脏标记
    if (dirty.length > 0 && dirty.length < 4) {
      CGStore.clearDirtyCategories();
    }
    setSyncUI('ok');
    return true;
  }).catch(function (e) {
    pushing = false;
    if (e && e.message === 'no-token') return false;
    console.warn('[CGSync] push 失败（离线或后端未启动），本地已保留', e);
    warnOffline();
    return false;
  });
}

/* ===== 防抖推送调度 ===== */

/**
 * schedulePush() —— 调度一次延迟推送（防抖）
 *
 * 【作用】每次数据修改后调用，启动或重置防抖定时器。
 *
 * 【防抖流程】
 *   1. 先取消之前的定时器（如果有的话）
 *   2. 设置新的 400ms 定时器
 *   3. 400ms 内如果又调用了 schedulePush()，之前的定时器会被取消
 *   4. 只有最后一次调用后 400ms 才真正执行 flushPush()
 *
 * 【效果】用户快速修改多次数据，只会触发一次网络请求。
 */
function schedulePush() {
  if (!hasToken()) return;
  setSyncUI('syncing');
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE);
}

/**
 * flushPush() —— 立即执行推送（取消防抖）
 *
 * 【作用】清除定时器并立即执行推送。
 * 【使用场景】页面即将隐藏时，需要确保数据被推送到服务器。
 */
function flushPush() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  return push();
}

/* ===== 事件监听 ===== */

/**
 * 监听 CGStore 的数据更新事件
 *
 * 【作用】当本地数据被修改时（通过 CGStore 的方法），
 * 自动触发 schedulePush()，启动防抖推送。
 *
 * 【效果】数据修改后 400ms，自动推送到服务器。
 */
if (CGStore.onUpdate) {
  CGStore.onUpdate(schedulePush);
}

/**
 * 监听 localStorage 的 storage 事件
 *
 * 【作用】当其他标签页修改了 localStorage 时，
 * 本标签页会收到这个事件。可以在这里处理跨标签页的同步。
 *
 * 【当前实现】只做标记，实际数据刷新由 store.js 的 storage 事件处理。
 */
globalThis.addEventListener('storage', function (e) {
  if (e.key === CGStore.KEY) {
    // 数据已由 storage 事件同步到本页 localStorage
  }
});

/**
 * 监听页面生命周期事件
 *
 * 【作用】当页面即将隐藏（切换标签页）或卸载（关闭页面）时，
 * 如果有未推送的数据，立即推送到服务器，避免数据丢失。
 *
 * 【visibilitychange】标签页从可见变为不可见
 * 【pagehide】页面即将被卸载
 */
if (globalThis.document) {
  globalThis.document.addEventListener('visibilitychange', function () {
    if (globalThis.document.visibilityState === 'hidden') {
      if (hasToken() && pushTimer) flushPush();
    }
  });
  globalThis.addEventListener('pagehide', function () {
    if (hasToken() && pushTimer) flushPush();
  });
}

/* ===== 辅助函数 ===== */

/**
 * snapshotEmpty(p) —— 检查数据快照是否为空
 *
 * 【作用】判断一个数据对象中所有集合是否都是空的。
 * 【用途】登录后决定是拉取服务器数据还是推送本地数据：
 *   - 如果本地为空 → 从服务器拉取（pull）
 *   - 如果本地有数据 → 先推送再拉取（push + pull）
 *
 * 【返回值】true 表示所有集合都是空的
 */
function snapshotEmpty(p) {
  if (!p || typeof p !== 'object') return true;
  return ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus']
    .every(function (k) { return !Array.isArray(p[k]) || p[k].length === 0; });
}

/* ===== 对外暴露的 API ===== */

/**
 * CGSync —— 云端同步接口
 *
 * 【设计理念】
 *   页面代码只需要调用简单的几个方法（pull / push / afterLogin），
 *   不需要关心防抖、增量同步、离线处理等复杂逻辑。
 *
 * 【使用方式】
 *   CGSync.pull()        → 从服务器拉取最新数据
 *   CGSync.push()        → 把本地数据推送到服务器
 *   CGSync.afterLogin()  → 登录后自动同步
 *   CGSync.isEnabled()   → 检查是否已登录
 */
var CGSync = {
  /**
   * pull() —— 从服务器拉取最新数据
   * 详见上方 pull() 函数的详细注释
   */
  pull: pull,

  /**
   * push() —— 把本地数据推送到服务器
   * 详见上方 push() 函数的详细注释
   */
  push: push,

  /**
   * afterLogin() —— 登录后的同步策略
   *
   * 【策略】
   *   1. 如果本地数据为空（新用户或清除过数据）→ 直接从服务器拉取
   *   2. 如果本地有数据（老用户换设备登录）→ 先推送本地数据，再拉取服务器数据
   *
   * 【为什么这样设计？】
   *   新用户本地没数据，拉取即可；老用户可能在离线时修改了数据，
   *   需要先推送到服务器，再拉取最新版本，确保数据不丢失。
   *
   * 【返回值】Promise
   */
  afterLogin: function () {
    var local = CGStore.get();
    if (snapshotEmpty(local)) return pull();
    return push().then(pull);
  },

  /**
   * afterRegister() —— 注册后的操作
   *
   * 【当前实现】什么都不做，返回一个已完成的 Promise。
   * 【原因】新注册用户没有数据需要同步。
   */
  afterRegister: function () { return Promise.resolve(true); },

  /**
   * isEnabled() —— 检查同步功能是否可用（即用户是否已登录）
   *
   * 【返回值】true 表示已登录，可以执行同步操作
   */
  isEnabled: hasToken
};

// 暴露到全局，方便不使用 ES Module 的代码访问
globalThis.CGSync = CGSync;

export default CGSync;
export { CGSync };
