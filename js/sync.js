/**
 * 晨光自律台 · 云端同步层 (ES Module)
 * --------------------------------------------------------------------------
 * 设计目标：在「不改动任何页面渲染代码」的前提下，让后端数据库成为数据的
 * 唯一真源（source of truth），前端 localStorage 仅作为本地缓存 + 离线兜底，
 * 并且**任何情况下都不允许把过期的本地数据覆盖服务器的更新**。
 *
 * ===== Phase 8：版本化同步 =====
 *  - 每个设备有个稳定 deviceId（store.js 生成）。
 *  - 本地每做一次本机操作，CGStore 的 revision 就 +1（见 store.js _bump）。
 *  - 推送时携带 { data, baseRevision, deviceId }：
 *      * 服务器保存成功 → 返回服务器最终 data + 新 revision，本地采纳（不 bump）。
 *      * baseRevision 落后于服务器 → 409 SYNC_CONFLICT + 服务器数据，
 *        前端做防线式合并（合并结果永远基于服务器版本）后重推，绝不覆盖。
 *  - 服务器数据落本地（pull / 合并 / 跨页签）一律采用 REMOTE 语义，
 *    不 bump 版本号（防止把服务器数据当成新改动推回去）。
 *
 * 工作流程：
 *   1. 登录后：CGSync.afterLogin()
 *        Case A（本地无待同步）：直接 pull，采用服务器版本 → synced
 *        Case B（本地有离线修改）：pull → 合并（本地优先，墓碑最高）→
 *                                 新 revision → push → 验证 → synced
 *        【禁令】绝不允许"先 push 旧本地覆盖服务器再 pull"。
 *   2. 任意本机变更：debounce 400ms → push
 *   3. 离线：单槽离线队列标记待同步，指数退避 1/2/4/8/16s（最多 5 次），
 *      网络恢复后自动重推；数据始终留在本地。
 *
 * ========== 文件在架构中的角色 ==========
 *  本文件是"数据同步管家"，不直接操作 UI，只负责数据的推拉与冲突合并。
 *  依赖 store.js（CGStore），被页面 JS（CGSync.afterLogin() 等）调用。
 * --------------------------------------------------------------------------
 */
'use strict';

/* ===== 导入依赖 ===== */

/**
 * 导入 CGStore —— 本地数据存储层
 * sync.js 需要通过 CGStore 读写本地数据 / 版本元信息
 */
import CGStore from './store.js';

/* ===== 常量配置 ===== */

import { getApiBase } from './config/apiBase.js';

/** TOKEN_KEY —— 登录 Token 在 localStorage 中的键名（与 store.js 一致） */
var TOKEN_KEY = 'cg_token';

/** 离线队列标记的 localStorage 键名：存 '1'（有待同步）/'0'（无） */
var PENDING_KEY = 'chenguangSyncPending';

/**
 * PUSH_DEBOUNCE —— 推送防抖延迟（毫秒）
 * 快速连续修改只提交最后一次，减少请求。
 */
var PUSH_DEBOUNCE = 400;

/** TOAST_THROTTLE —— 离线提示节流间隔（毫秒），避免反复打扰 */
var TOAST_THROTTLE = 30000;

/** 业务集合白名单（与后端同步、用于合并；Phase 12 加入 goals——by-id 合并/墓碑/payload 通用继承） */
var COLLECTIONS = ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus', 'goals'];

/**
 * BACKOFF_BASE —— 指数退避基数（毫秒）
 * 1s → 2s → 4s → 8s → 16s，最多 5 次重试，之后待在 pending 状态等网络恢复。
 */
var BACKOFF_BASE = 1000;
var BACKOFF_MAX = 5;

/** 冲突后自动合并重推的循环上限，防止 409→合并→409 死循环 */
var CONFLICT_LOOP_MAX = 3;

/* ===== 状态变量 ===== */

/**
 * lastDataETag —— 上次从服务器获取的 ETag
 * 保留历史行为（GET 附带 If-None-Match）；主判据仍是 revision。
 */
var lastDataETag = null;

/** lastOfflineToast —— 上次离线提示时间戳（节流用） */
var lastOfflineToast = 0;

/** pushTimer —— 防抖定时器 */
var pushTimer = null;

/** pushing —— 推送锁（同一时间只有一个推送在途） */
var pushing = false;

/** merging —— 合并锁（合并期间不并发拉取） */
var merging = false;

/** pendingFlush —— 推送期间又有新的本地修改，标记完成后重推 */
var pendingFlush = false;

/** retryCount —— 网络退避已重试次数 */
var retryCount = 0;

/** conflictCount —— 连续 409 合并/重推次数（循环护栏） */
var conflictCount = 0;

/** syncStatus —— 当前同步状态（用于 UI 与测试） */
var syncStatus = 'idle';

/* ===== Token 工具函数 ===== */

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
}
function hasToken() { return !!getToken(); }

/* ===== 同步状态机 ===== */

/**
 * setStatus(status) —— 更新同步状态并广播
 *
 * 状态取值与含义：
 *   idle       未开始（未登录/尚未触发）
 *   pending    本地有修改待同步
 *   syncing    正在推送/拉取
 *   synced     已同步（本地与云端一致）
 *   offline    离线模式，已把修改暂存本地，恢复网络后自动同步
 *   conflict   检测到云端与新本地数据冲突
 *   merging    正在合并冲突数据
 *   failed     同步失败（参数/服务器错误，非临时性）
 *   auth-error 登录凭证失效
 */
function setStatus(status) {
  syncStatus = status;
  setSyncUI(status);
  try {
    var evt = globalThis.document.createEvent('CustomEvent');
    evt.initCustomEvent('chenguang:sync-status', false, false, { status: status });
    globalThis.dispatchEvent(evt);
  } catch (_) {}
}

/** getSyncStatus() —— 读取当前同步状态 */
function getSyncStatus() { return syncStatus; }

/* ===== UI 状态指示 ===== */

var STATUS_TEXT = {
  idle:       '未同步',
  pending:    '待同步',
  syncing:    '同步中…',
  synced:     '已同步',
  offline:    '离线模式',
  conflict:   '有冲突',
  merging:    '合并中…',
  failed:     '同步失败',
  'auth-error': '登录失效'
};

/**
 * setSyncUI(state) —— 更新页面上所有 [data-sync-status] 元素的文案与状态
 */
function setSyncUI(state) {
  try {
    var els = globalThis.document ? document.querySelectorAll('[data-sync-status]') : [];
    if (!els.length) return;
    var info = STATUS_TEXT[state];
    if (!info) return;
    els.forEach(function (el) {
      el.textContent = info;
      el.setAttribute('data-sync-state', state);
    });
  } catch (_) {}
}

/**
 * warnOffline() —— 显示离线警告（节流 30s）
 */
function warnOffline() {
  var now = Date.now();
  if (now - lastOfflineToast < TOAST_THROTTLE) return;
  lastOfflineToast = now;
  try {
    if (typeof globalThis.toast === 'function') {
      globalThis.toast('云端暂不可达，修改已保存在本地，恢复网络后自动同步', 'warn');
    }
  } catch (_) {}
}

/* ===== HTTP 请求封装 ===== */

/**
 * req(method, path, body) —— 发送 HTTP 请求
 * 自动带 Token / CSRF 头 / GET 的 If-None-Match，5 秒超时。
 * 【返回】Promise<{ ok, status, data, headers }>
 * 【错误】网络错误 / 无 Token 时 reject
 */
function req(method, path, body) {
  var token = getToken();
  if (!token) return Promise.reject(new Error('no-token'));
  var headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Authorization': 'Bearer ' + token
  };
  if (method === 'GET' && lastDataETag) headers['If-None-Match'] = lastDataETag;
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
  return fetch(getApiBase() + path, fetchOpts).then(function (r) {
    if (timeoutId) clearTimeout(timeoutId);
    // 204 无内容、304 未修改：不解析 JSON 体（304 若硬解析会因空体抛错）
    if (r.status === 204 || r.status === 304) {
      return { ok: r.status === 204, status: r.status, data: null, headers: r.headers };
    }
    return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j, headers: r.headers }; });
  }).catch(function (e) {
    if (timeoutId) clearTimeout(timeoutId);
    return Promise.reject(e);
  });
}

/* ===== 业务数据 / 元信息转换 ===== */

/**
 * _stripMeta(d) —— 去掉 _meta / __migrated / _syncMode 等内部字段
 * 只把纯业务字段（user + 各集合）交给服务器。
 */
function _stripMeta(d) {
  var out = {};
  if (!d || typeof d !== 'object') return out;
  Object.keys(d).forEach(function (k) {
    if (k === '_meta' || k === '__migrated' || k === '_syncMode') return;
    out[k] = d[k];
  });
  return out;
}

/** _snapshotBusiness() —— 拿一份不含内部字段的本地业务快照 */
function _snapshotBusiness() { return _stripMeta(CGStore.get()); }

/**
 * _applyRemote(data, meta) —— 把服务器数据采纳进本地（REMOTE 语义）
 * meta 可选 { revision, updatedAt, deviceId }，全部来自服务器 envelope。
 * 不 bump 版本号、采用服务器版本/更新时间/最近写入设备、保留墓碑；
 * 服务器 user 缺失时回退到本地名字。meta.deviceId 随之记录"上次在哪台设备改过"。
 */
function _applyRemote(data, meta) {
  meta = meta && typeof meta === 'object' ? meta : (meta == null ? {} : { revision: meta });
  var local = CGStore.get();
  if ((!data.user || !data.user.name) && local.user && local.user.name) {
    data = Object.assign({}, data, { user: Object.assign({}, local.user) });
  }
  CGStore.set(data, {
    kind: 'REMOTE',
    revision: meta.revision != null ? meta.revision : undefined,
    updatedAt: meta.updatedAt != null ? meta.updatedAt : undefined,
    deviceId: meta.deviceId != null ? meta.deviceId : undefined
  });
}

/** _setPending(v) / _hasPending() —— 单槽离线队列标记（持久化） */
function _setPending(v) {
  try { localStorage.setItem(PENDING_KEY, v ? '1' : '0'); } catch (_) {}
}
function _hasPending() {
  try { return localStorage.getItem(PENDING_KEY) === '1'; } catch (_) { return false; }
}

/**
 * _clearSettledTombstones(srvData) —— 墓碑清理（保守）
 * 只有当服务器返回的数据里，某个集合已完全不含本机记过的墓碑 id（即删除被
 * 服务器吸收），才清掉该集合的墓碑；否则保留，防止旧副本把记录复活。
 */
function _clearSettledTombstones(srvData) {
  if (!srvData || typeof srvData !== 'object') return;
  ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus', 'goals'].forEach(function (name) {
    var ts = CGStore.getTombstones(name);
    if (!ts.length) return;
    var arr = Array.isArray(srvData[name]) ? srvData[name] : [];
    var stillThere = ts.some(function (id) {
      return arr.some(function (r) { return r.id === id; });
    });
    // 只要服务器还有一个墓碑 id 残留 → 不清；全部消失 → 已吸收，可清
    if (!stillThere) CGStore.clearTombstones(name);
  });
}

/* ===== 错误分类 ===== */

/** classifyError(e, status) —— 把异常归类，决定"能否重试" */
var FAIL = { NETWORK: 'NETWORK', AUTH: 'AUTH', VERSION: 'VERSION', VALIDATION: 'VALIDATION', SERVER: 'SERVER', UNKNOWN: 'UNKNOWN' };

function classifyError(e, status) {
  if (status === 0 || !status) {
    // fetch 网络错误：code 多为 fetch 内部抛的 TypeError/Abort；或根本没有响应
    if (e && (e.name === 'TypeError' || e.name === 'AbortError')) return FAIL.NETWORK;
    if (e) return FAIL.NETWORK;
    return FAIL.NETWORK;
  }
  if (status >= 401 && status <= 403) return FAIL.AUTH;
  if (status === 409) return FAIL.VERSION;
  if (status >= 400 && status < 500) return FAIL.VALIDATION;
  if (status >= 500) return FAIL.SERVER;
  return FAIL.UNKNOWN;
}

/* ===== 断言：错误处理 ===== */

/**
 * _scheduleRetry() —— 网络失败后指数退避重推（1/2/4/8/16s，最多 5 次）
 * 达到上限后保持 pending，等待 window 'online' 事件触发。
 */
function _scheduleRetry() {
  if (retryCount >= BACKOFF_MAX) return; // 到位后保持 offline，等 online 事件
  var delay = BACKOFF_BASE * Math.pow(2, retryCount);
  retryCount++;
  setTimeout(function () {
    if (_hasPending()) push();
  }, delay);
}

/**
 * _backoffTimerInFlight 由 setTimeout 调度，测试通过 fake timers 控制
 */

/* ===== 冲突合并（所以本地不会覆盖更新过的云端） ===== */

/**
 * _mergeKey(name, x) —— 集合内记录的唯一键
 * 不同集合的"同一条记录"判定依据不同：
 *   - checkins：一天一条，按 date 去重（本地 _add 会给打卡生成 id，
 *     若按 id 合并，两台设备同一天的打卡就是两条 → 跨设备重复打卡破坏不变量）
 *   - 其余集合：按 id 合并（_add 生成的稳定 id）
 * 统一加类型前缀，避免 id 值与 date 值恰好相等时误合并。
 */
function _mergeKey(name, x) {
  if (!x) return '';
  if (name === 'checkins' && x.date) return 'date:' + x.date;
  if (x.id != null) return 'id:' + x.id;
  return x.date ? 'date:' + x.date : '';
}

/**
 * mergeState(local, remote, tombstones) —— 防线式合并
 *
 * 【规则】
 *   - user：以本地为准（本地是推送方，通常是更新的操作者），字段级浅合并
 *   - checkins：按 date 合并（一天一条），同日期本地优先
 *   - 其它集合：按 id 合并，同 id 本地优先
 *   - 墓碑最高优先级：凡墓碑里的 id 一律剔除（不允许复活）
 *
 * 【不变量】合并结果永远"包含本地修改 + 服务器上本地没有的记录"，
 *   且绝不会把服务器上更新的数据删掉（对未冲突字段完整保留服务器值）。
 *
 * 【参数】
 *   local      本地业务数据（不含 _meta）
 *   remote     服务器业务数据
 *   tombstones { collection: [ids] }（本地删除记忆）
 * 【返回】合并后的业务数据对象
 *
 * 【已知边界】
 *   - 墓碑只是"本机删除记忆"，不随服务器传播：设备 A 删除某记录并同步后，
 *     离线旧的设备 B 合并时会把它带回来（B 无墓碑）→ 可能出现删除—复活抖动。
 *     当前策略是"不确定时保守多留一次"，待服务端持久化墓碑后再根治。
 *   - user 的空字符串视为"未表态"，合并时不清空服务器已填的值（防误删）。
 */
function mergeState(local, remote, tombstones) {
  local = local && typeof local === 'object' ? local : {};
  remote = remote && typeof remote === 'object' ? remote : {};
  var out = {};

  // user：字段级合并，本地已填写的值优先；本地"空字符串/null"视为未表态，
  // 保留服务器真实值（防止新设备/默认模板把云端真实资料覆盖成空再推回去）。
  var mergedUser = Object.assign({}, remote.user || {});
  if (local.user && typeof local.user === 'object') {
    Object.keys(local.user).forEach(function (k) {
      var lv = local.user[k];
      if (lv === '' || lv === null || lv === undefined) return;
      mergedUser[k] = lv;
    });
  }
  out.user = mergedUser;

  COLLECTIONS.forEach(function (name) {
    var remoteArr = Array.isArray(remote[name]) ? remote[name] : [];
    var localArr = Array.isArray(local[name]) ? local[name] : [];
    var ts = (tombstones && tombstones[name]) ? tombstones[name] : [];

    var map = {};
    remoteArr.forEach(function (r) {
      var k = _mergeKey(name, r);
      if (k) map[k] = r;
    });
    // 本地覆盖（同 id / 同日期本地优先）：
    // 字段级合并 —— 本地改过的字段赢，服务器独有的字段保留（不丢云端数据）
    localArr.forEach(function (l) {
      var k = _mergeKey(name, l);
      if (!k) return;
      if (map[k]) {
        map[k] = Object.assign({}, map[k], l);
      } else {
        map[k] = l;
      }
    });
    // 墓碑最高优先级：谁都不能复活它
    ts.forEach(function (id) {
      if (!id) return;
      var k = (name === 'checkins') ? 'date:' + id : 'id:' + id;
      delete map[k];
    });

    out[name] = Object.keys(map).map(function (k) { return map[k]; });
  });
  return out;
}

/**
 * resolveMergeRevision(localRev, remoteRev) —— 合并后应采用的新版本号
 * 合并是一次"新改动"，版本号 = 双方较大版本 + 1。
 */
function resolveMergeRevision(localRev, remoteRev) {
  return Math.max(Number(localRev) || 0, Number(remoteRev) || 0) + 1;
}

/* ===== Pull（拉取）相关 ===== */

/**
 * pull() —— 从服务器拉取并采纳最新数据（REMOTE 语义）
 *
 * 【流程】
 *   1. 检查 Token
 *   2. GET /data
 *   3. 304（数据未变）→ 直接返回已同步
 *   4. 服务器 revision 与本地相同且无待同步 → 已同步，跳过
 *   5. 否则采纳服务器数据（不 bump、采用服务器版本、保留墓碑）
 *
 * 【注意】pull 只应在"本地无待同步修改"时调用（afterLogin Case A）。
 * 若有待同步修改，必须先走合并（Case B），禁止先推旧数据覆盖云端。
 *
 * 【返回】Promise<boolean>
 */
function pull() {
  if (!hasToken()) return Promise.resolve(false);
  if (pushing || merging) return Promise.resolve(false);
  setStatus('syncing');
  return req('GET', '/data').then(function (res) {
    if (!res) { warnOffline(); setStatus('offline'); return false; }
    if (res.status === 304) { setStatus('synced'); return true; }
    if (!res.ok || !res.data || !res.data.data) return false;
    var server = res.data.data;
    var srvRev = Number(server.revision);
    var srvData = server.data;
    if (!srvData || typeof srvData !== 'object') return false;
    var etag = res.headers && res.headers.get ? res.headers.get('ETag') : null;
    if (etag) lastDataETag = etag;
    if (Number(CGStore.getRevision()) === srvRev && !_hasPending()) {
      setStatus('synced');
      return true;
    }
    // 说明：pull 是"显式拉取 = 强制采纳服务器"语义，不检查脏集合（与 afterLogin
    // 的 Case B 分工：有待同步修改时走合并，绝不直接 pull 覆盖）。
    // 保护点：400 校验失败已 _setPending(true)，登录路径经 Case B 合并，不会误覆盖。
    _applyRemote(srvData, { revision: srvRev, updatedAt: server.updatedAt, deviceId: server.deviceId });
    CGStore.clearDirtyCategories();
    setStatus('synced');
    return true;
  }).catch(function (e) {
    if (e && e.message === 'no-token') return false;
    console.warn('[CGSync] pull 失败（离线或后端未启动），继续使用本地数据', e);
    warnOffline();
    setStatus('offline');
    return false;
  });
}

/* ===== Push（推送）相关 ===== */

/**
 * _buildPushBody() —— 根据脏集合决定增量/全量载荷
 *   - 脏集合 1~3 个 → 增量（只发脏集合 + user），并标记 _syncMode:'partial'
 *   - 否则 → 全量快照（._syncMode:'full'）
 */
function _buildPushBody() {
  var dirty = CGStore.getDirtyCategories();
  var full = _snapshotBusiness();
  var meta = CGStore.getMeta();
  var payload;
  if (dirty.length > 0 && dirty.length < 4) {
    payload = {};
    dirty.forEach(function (k) { payload[k] = full[k]; });
    if (!payload.user && full.user) payload.user = full.user;
    payload._syncMode = 'partial';
  } else {
    payload = full;
    payload._syncMode = 'full';
  }
  return {
    data: payload,
    baseRevision: meta.revision,
    deviceId: meta.deviceId
  };
}

/**
 * _handlePushResult(res, startRev) —— push 成功后的收敛逻辑
 *
 * 【关键】push 成功后采纳服务器返回的"最终融合数据"（而不是保留本地快照），
 * 这样增量推送后也能与服务器完全一致，且同步吸收服务器在并发窗口内的新数据。
 * 但推送期间若本地又发生了新修改（版本号已前进），则不覆盖——保留本地新改动，
 * 标记 pendingFlush 后再补推一轮（见 _maybeReflush）。
 *
 * 【startRev】发起推送那一刻的本地版本号（对本机改动与 afterLogin/409 合并
 * 的 force 推送一视同仁）：返回时若本地版本前进，说明在途窗口有用户新操作，
 * 服务器快照不能整份覆盖它。
 */
function _handlePushResult(res, startRev) {
  if (!res) return false;
  var srvData = null;
  var srvRev = null;
  var srvUpdatedAt = null;
  var srvDeviceId = null;
  if (res.data && res.data.data) {
    srvData = res.data.data.data;
    srvRev = res.data.data.revision;
    srvUpdatedAt = res.data.data.updatedAt;
    srvDeviceId = res.data.data.deviceId;
  }
  var curRev = CGStore.getRevision();
  if (curRev !== startRev) {
    // 推送期间本地又有新修改：保留本地新改动，标记补推
    pendingFlush = true;
    setStatus('pending');
    return false;
  }
  if (srvData) {
    _applyRemote(srvData, { revision: srvRev != null ? srvRev : startRev, updatedAt: srvUpdatedAt, deviceId: srvDeviceId });
    _clearSettledTombstones(srvData);
  } else if (srvRev == null) {
    // 老后端格式兜底：把当前本地视为已同步
    _applyRemote(_snapshotBusiness(), { revision: startRev });
  }
  CGStore.clearDirtyCategories();
  _setPending(false);
  retryCount = 0;
  conflictCount = 0;
  setStatus('synced');
  return true;
}

/**
 * _handlePushError(res, payload, baseRev, force) —— push 失败的分支处理
 *  409 → 合并云端 → 重推（护栏最多 CONFLICT_LOOP_MAX 次）
 *  401/403 → auth-error（停止）
 *  4xx 其它 → validation，失败停止（不重试）
 *  5xx    → 服务器错误，有限退避重试
 */
function _handlePushError(res, payload, baseRev, force) {
  var status = res ? res.status : 0;
  var kind = classifyError(null, status);

  if (status === 409) {
    // ===== 版本冲突：本地 baseRevision 落后于服务器 =====
    if (conflictCount >= CONFLICT_LOOP_MAX) {
      conflictCount = 0;
      setStatus('conflict');
      try {
        if (typeof globalThis.toast === 'function') {
          globalThis.toast('多处设备数据冲突且已重试多次，请刷新页面后重新进入', 'warn');
        }
      } catch (_) {}
      return false;
    }
    var serverData = res.data && res.data.error && res.data.error.serverData;
    var serverRev = res.data && res.data.error && res.data.error.serverRevision;
    if (!serverData || serverRev == null) {
      // 冲突响应没有携带服务器数据 → 保守处理：
      // 不覆盖本地（否则离线新增会丢），标记冲突并保留待同步，等下一次机会。
      _setPending(true);
      setStatus('conflict');
      try {
        if (typeof globalThis.toast === 'function') {
          globalThis.toast('云端数据版本冲突，已保留本地修改，请稍后自动同步', 'warn');
        }
      } catch (_) {}
      return false;
    }
    merging = true;
    conflictCount++;
    setStatus('merging');
    try {
      // 合并永远基于服务器版本做增量吸收（不覆盖服务器新数据）
      var local = _snapshotBusiness();
      var tombstones = CGStore.getMeta().tombstones;
      var merged = mergeState(local, serverData, tombstones);
      var newRev = resolveMergeRevision(CGStore.getRevision(), Number(serverRev));
      _applyRemote(merged, { revision: newRev });
      CGStore.clearDirtyCategories();
      _setPending(false);
      // 重推合并结果，以服务器版本为基准
      return push({ data: merged, baseRevision: Number(serverRev) });
    } finally {
      merging = false;
    }
  }

  if (kind === FAIL.AUTH) {
    setStatus('auth-error');
    return false;
  }
  if (kind === FAIL.VALIDATION) {
    // 校验失败不自动重试（避免 400 风暴）；但必须保留待同步标记，
    // 否则下次 afterLogin 会当成"无本地修改"纯拉取，把用户数据静默覆盖。
    console.warn('[CGSync] push 校验失败（400），不自动重试', status, res.data);
    _setPending(true);
    setStatus('failed');
    return false;
  }
  if (kind === FAIL.SERVER) {
    // 服务器 5xx：临时性问题，照网络退避重试
    _setPending(true);
    setStatus('offline');
    _scheduleRetry();
    return false;
  }
  // 其它（429 限流等）同样按有限重试处理
  _setPending(true);
  setStatus('offline');
  _scheduleRetry();
  return false;
}

/**
 * push(force) —— 把本地修改推送到服务器
 *
 * 【参数】force —— 可选，{ data, baseRevision }：推送既定载荷（合并/登录后场景）
 * 【返回】Promise<boolean>：成功 true；失败 false（数据保留本地，进入待同步）
 */
function push(force) {
  if (!hasToken()) return Promise.resolve(false);
  if (pushing && !force) { pendingFlush = true; return Promise.resolve(false); }
  pushing = true;

  var payload = force || _buildPushBody();
  // 记录发起推送瞬间的本地版本：返回时若版本前进，说明在途窗口有本地新操作，
  // 服务器快照不得整份覆盖（见 _handlePushResult）。
  var startRev = CGStore.getRevision();

  setStatus('syncing');
  return req('PUT', '/data', payload).then(function (res) {
    pushing = false;
    var ok = false;
    if (res && res.ok) ok = _handlePushResult(res, startRev);
    else ok = _handlePushError(res || { status: 0 }, payload.data, payload.baseRevision, !!force);
    return _maybeReflush(ok);
  }).catch(function (e) {
    pushing = false;
    if (e && e.message === 'no-token') return false;
    console.warn('[CGSync] push 失败（离线或后端未启动），本地已保留', e);
    warnOffline();
    _setPending(true);
    setStatus('offline');
    // 不重置 retryCount：让退避计时器按 1/2/4/8/16s 递增，网络恢复后自愈
    _scheduleRetry();
    return _maybeReflush(false);
  });
}

/**
 * _maybeReflush(ok) —— push 收尾：若推送期间本地又产生新修改（pendingFlush 置位），
 * 立即补推一轮，兑现"自动补推"，让改动不被滞留。返回入参 ok，不改变本轮结果。
 */
function _maybeReflush(ok) {
  if (pendingFlush) {
    pendingFlush = false;
    setTimeout(push, 0);
  }
  return ok;
}

/* ===== 防抖推送调度 ===== */

function schedulePush(e) {
  if (!hasToken()) return;
  // 跨标签页刷新（另一页签的 storage 事件）不触发本页推送，防止多开互相 ping
  if (e && e.detail && e.detail.remote === true) return;
  setStatus('pending');
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE);
}

function flushPush() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  return push();
}

/* ===== 事件监听 ===== */

// 本机数据修改 → 防抖推送
if (CGStore.onUpdate) {
  CGStore.onUpdate(schedulePush);
}

// 跨标签页：store.js 已在 storage 事件里被动刷新缓存并触发 chenguang:update。
// 该事件链会走到 schedulePush，但跨页签写入属于 REMOTE 语义 —— 不需要本页
// 把它"原样推回"服务器（数据本来就来自云端）。这里在 store.js 的 handler 之后
// 执行（注册顺序保证），直接取消这轮防抖推送，避免无谓请求与潜在回环。
globalThis.addEventListener('storage', function (e) {
  if (e.key === CGStore.KEY && pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
});

// 离线 → 在线：有待同步数据立即重推
if (typeof navigator !== 'undefined') {
  var onlineHandler = function () {
    if (hasToken() && (_hasPending() || CGStore.getDirtyCategories().length > 0)) {
      push();
    }
  };
  globalThis.addEventListener('online', onlineHandler);
}

// 页面隐藏/卸载：把未推送的数据立即推上去，避免刷新时丢数据
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

/* ===== 登录后同步 ===== */

/**
 * afterLogin() —— 登录后的同步策略（Phase 8 修正版）
 *
 * 【Case A】本地没有待同步修改 → 直接 pull，采纳服务器版本 → synced
 * 【Case B】本地有待同步修改（离线攒下的）→
 *     pull（拿服务器最数据）→ mergeState(本地, 服务器) → 新 revision →
 *     push 合并结果（以服务器版本为基准）→ synced。
 *
 * 【禁令】绝不允许"先 push 旧本地 → 覆盖服务器 → 再 pull"。
 * 服务器上的更新永远是一等公民：合并只能"在服务器版本之上叠加本地修改"。
 *
 * 【返回】Promise<boolean>
 */
function afterLogin() {
  if (!hasToken()) return Promise.resolve(false);

  // 判断本地是否有未同步修改：pending 队列 或 脏集合（覆盖 400 校验失败后
  // 未置 pending 的情况，防止纯 pull 把本地改动静默覆盖掉）
  var hasLocalEdits = _hasPending() || CGStore.getDirtyCategories().length > 0;

  // Case A：本地没有未同步修改 → 纯拉取（只 GET，绝不先推送旧数据覆盖云端）
  if (!hasLocalEdits) return pull();

  // Case B：本地有未同步修改 → 先 GET 服务器数据，防线式合并后再 PUT。
  // 绝对禁止 "先 push 旧本地覆盖云端再 pull"。
  setStatus('merging');
  return req('GET', '/data').then(function (res) {
    if (!res || !res.ok || !res.data || !res.data.data) {
      // 拿不到服务器数据：保持 pending/dirty，等下一次机会
      warnOffline();
      setStatus('offline');
      return false;
    }
    var server = res.data.data;
    var srvData = server.data;
    var srvRev = Number(server.revision) || 0;
    if (!srvData || typeof srvData !== 'object') return false;

    var localData = _snapshotBusiness();
    var localMeta = CGStore.getMeta();
    var merged = mergeState(localData, srvData, localMeta.tombstones);
    var newRev = resolveMergeRevision(localMeta.revision, srvRev);
    _applyRemote(merged, { revision: newRev, updatedAt: server.updatedAt, deviceId: server.deviceId });
    CGStore.clearDirtyCategories();
    _setPending(false); // 本地修改已并入合并结果

    // 推送合并结果（基准 = 服务器 revision）；若仍 409 会在 push 内再合并（护栏有限）
    setStatus('syncing');
    return push({ data: merged, baseRevision: srvRev });
  }).catch(function (e) {
    if (e && e.message === 'no-token') return false;
    warnOffline();
    setStatus('offline');
    return false;
  });
}

/* ===== 对外暴露的 API ===== */

/**
 * CGSync —— 云端同步接口
 *
 * 【使用方式】
 *   CGSync.pull()        → 从服务器拉取最新数据
 *   CGSync.push()        → 把本地数据推送到服务器
 *   CGSync.afterLogin()  → 登录后自动同步（Case A/B）
 *   CGSync.afterRegister() → 注册后占位
 *   CGSync.isEnabled()   → 检查是否已登录
 *   CGSync.getSyncStatus() → 当前同步状态
 *   CGSync.mergeState()  → 防线式合并（纯函数，供测试）
 */
var CGSync = {
  pull: pull,
  push: push,
  afterLogin: afterLogin,
  afterRegister: function () { return Promise.resolve(true); },
  isEnabled: hasToken,
  getSyncStatus: getSyncStatus,
  mergeState: mergeState,
  resolveMergeRevision: resolveMergeRevision
};

// 暴露到全局，方便不使用 ES Module 的代码访问
globalThis.CGSync = CGSync;

export default CGSync;
export { CGSync, mergeState, resolveMergeRevision };
