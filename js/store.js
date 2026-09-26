/**
 * Zeno · 统一本地数据层 (ES Module)
 * --------------------------------------------------------------------------
 * 所有页面（index / workbench / stats / ai）共享同一份数据，统一写入
 * localStorage 的单个 key：`chenguangData`。
 *
 * 设计原则：
 *  1. 单 key 真源（single source of truth），杜绝「多页面数据不通」。
 *  2. 零数据默认：未写入任何内容时，所有统计天然为 0 / 空态。
 *  3. 跨页面实时同步：写入后派发 `chenguang:update` 事件，并监听
 *     原生 `storage` 事件，实现同源多标签页即时刷新。
 *  4. 兼容迁移：首次运行时把旧的分散 `cg_*` 键数据合并进 `chenguangData`，
 *     并把 `cg_user` / `cg_token`（鉴权）继续镜像维护，避免改登录流程。
 *
 * ========== 文件在架构中的角色 ==========
 *  本文件是整个应用的数据心脏，所有页面读写数据都通过它。
 *  类比：就像一个"数据管家"，其他页面只需要告诉管家要什么数据、
 *  要存什么数据，管家负责安全地读写 localStorage。
 *
 *  依赖关系：
 *    - 本文件不依赖其他文件，是最底层的模块
 *    - sync.js 依赖本文件（调用 merge / set / get 等方法同步云端）
 *    - 所有页面 JS 文件通过 CGStore 全局对象或 import 使用本文件
 * --------------------------------------------------------------------------
 */
'use strict';

/* ===== 常量定义 ===== */

/**
 * localStorage 的存储键名
 *
 * 【什么是 localStorage？】
 * localStorage 是浏览器提供的一种"持久化存储"机制。
 * 你可以把它想象成浏览器里的一个小硬盘，数据写入后即使关闭页面也不会丢失。
 * 但它的容量有限（通常 5-10MB），而且只能存储字符串。
 *
 * 【为什么用单个 key？】
 * 早期版本把不同数据分散存成多个 key（如 cg_sports, cg_todos 等），
 * 导致跨页面数据不一致。现在统一存到一个 key `chenguangData` 里，
 * 所有数据都集中在一个 JSON 对象中，避免数据冲突。
 */
var STORAGE_KEY = 'chenguangData';

/**
 * 用户鉴权 Token 的存储键名
 *
 * Token（令牌）是登录后服务器发给前端的一串密文，
 * 前端每次请求 API 时带上它，服务器就知道"这个请求是哪个用户发的"。
 * 这里把 Token 单独存一个 key，方便 apiClient.js 直接读取。
 */
var TOKEN_KEY = 'cg_token';

/**
 * 用户信息的存储键名（为了兼容旧代码，暂时保留）
 */
var USER_KEY = 'cg_user';

/**
 * 设备 ID 的 localStorage 键名（Phase 8）
 * 每个浏览器/设备首次运行时生成一个稳定 ID，后续复用。
 * 用于区分多设备、标记"最后一次是谁写的"，不随刷新页面改变。
 */
var DEVICE_KEY = 'chenguangDeviceId';

/* ===== 工具函数 ===== */

/**
 * emptyData() —— 返回一个"空数据"模板
 *
 * 【作用】当用户首次使用（没有任何数据）时，返回一个所有字段都是空的默认结构。
 * 这样其他代码读取数据时不会因为字段不存在而报错。
 *
 * 【返回值】一个对象，包含：
 *   - user: 用户信息（姓名、起始日期、总天数、连续天数）
 *   - checkins: 打卡记录数组
 *   - sports: 运动记录数组
 *   - readings: 阅读记录数组
 *   - courses: 课程记录数组
 *   - english: 英语学习记录数组
 *   - todos: 待办事项数组
 *   - focus: 专注记录数组
 */
function emptyData() {
  return {
    user: { name: '', startDate: '', totalDays: 0, continuousDays: 0 },
    checkins: [],
    sports: [],
    readings: [],
    courses: [],
    english: [],
    todos: [],
    focus: [],
    // Phase 12：目标定义（业务数据，随 Phase 8 同步体系穿越设备；
    // 目标进度由 Goal Engine 实时计算，绝不写回这里）
    goals: []
  };
}

/**
 * uid() —— 生成一个全局唯一标识符（UUID）
 *
 * 【作用】每条记录（比如一条运动记录、一条待办）都需要一个唯一 ID，
 * 这样后面更新、删除时才能准确找到"是哪一条"。
 *
 * 【原理】
 *   - 优先使用浏览器内置的 crypto.randomUUID()，这是最可靠的 UUID 生成方式
 *   - 如果浏览器不支持（比如很老的浏览器），则用"时间戳 + 随机数"拼一个
 *     （虽然不是标准 UUID，但实际使用中几乎不会重复）
 */
function uid() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/**
 * todayStr() —— 获取今天的日期字符串，格式为 "YYYY-MM-DD"
 *
 * 【作用】很多记录需要标记"是哪天的"，这个函数返回今天的日期字符串。
 *
 * 【参数】d —— 可选，传入一个 Date 对象；不传则默认使用当前时间。
 *
 * 【原理】
 *   - getMonth() 返回 0-11（比实际月份少 1），所以要 +1
 *   - 用 ('0' + x).slice(-2) 确保月份和日期都是两位数（比如 3 → "03"）
 */
function todayStr(d) {
  d = d || new Date();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

/* ===== Phase 8：版本号 / 设备 ID / 墓碑（供离线同步与冲突合并使用） ===== */

/** 当前操作类型：'LOCAL'（用户在本机操作，唯一允许 bump 版本号） / 'REMOTE'（来自服务器或另一页签） */
var _activeOp = 'LOCAL';

/**
 * 最近一次写入是否为 REMOTE 语义。
 * 注意：_activeOp 在 _runAs 的 finally 里会立即复位，而真正的 emit 要等
 * flushPersist 的延迟定时器（100ms）才会跑——若在 emit 里读 _activeOp，
 * 永远读到 LOCAL，导致"服务器数据落本地"被误判成本机修改而触发自激 push。
 * 所以必须在这里持久记录"最近一次写入的语义"。
 */
var _lastWriteRemote = false;

/**
 * nowIso() —— 获得当前 ISO 时间字符串，用于记录"这次改动发生在什么时候"
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * getDeviceId() —— 获取（或首次生成）本设备的稳定 ID
 * 存在 localStorage 的 `chenguangDeviceId` 键里，跨刷新、跨页面复用。
 */
function getDeviceId() {
  try {
    var id = globalThis.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid();
      globalThis.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (_) {
    return '';
  }
}

/**
 * ensureMeta(d) —— 保证数据对象里有 `_meta` 元信息块
 * 旧版本 localStorage 没有 `_meta`，读到后自动补默认值（版本号从 0 开始，
 * 一旦首次推送到服务器，就会用服务器的版本号覆盖）。
 */
function ensureMeta(d) {
  if (!d || typeof d !== 'object') return;
  if (d._meta && typeof d._meta === 'object') {
    if (!d._meta.tombstones || typeof d._meta.tombstones !== 'object') d._meta.tombstones = {};
    return;
  }
  d._meta = { revision: 0, updatedAt: null, deviceId: getDeviceId(), tombstones: {} };
}

/**
 * _bump(col) —— 为"本机用户操作"递增版本号
 *
 * 【关键约定（用户拍板）】版本号在且只在本机业务写操作里 +1：
 *   - persist() / emit / 事件回调 / schedulePush / pull / 合并 一律不允许再 bump。
 *   - 也就是"用户每做一次操作，版本号 +1"，服务器用它判断谁更新。
 *
 * 【例外】_activeOp === 'REMOTE' 时（pull、合并应用、跨页签刷新），不 bump ——
 * 服务器数据即便落进本机 Store，也不算本机新改动。
 */
function _bump(col) {
  if (_activeOp !== 'LOCAL') return;
  var d = _cache; // 写方法在调用本函数前已经把数据加载进 _cache
  if (!d || !d._meta) return;
  d._meta.revision = (Number(d._meta.revision) || 0) + 1;
  d._meta.updatedAt = nowIso();
  d._meta.deviceId = getDeviceId();
}

/**
 * _addTombstone(name, id) —— 记录一条删除"墓碑"
 * 标记"这个 id 的记录在本机被删掉了"。同步合并时，墓碑拥有最高优先级：
 * 服务器旧副本里如果还留着该 id，也不能复活。
 */
function _addTombstone(name, id) {
  var d = _cache;
  if (!d || !d._meta) return;
  ensureMeta(d);
  if (!d._meta.tombstones) d._meta.tombstones = {};
  var arr = d._meta.tombstones[name] || (d._meta.tombstones[name] = []);
  if (arr.indexOf(id) === -1) arr.push(id);
}

/**
 * _runAs(kind, fn) —— 临时切换操作类型，执行完恢复
 * 用于 set / merge 的 REMOTE 调用：期间任何合并产生的写操作都不会 bump 版本号，
 * 也不会把服务器数据标成"本机脏集合"。
 */
function _runAs(kind, fn) {
  var prev = _activeOp;
  _activeOp = (kind === 'REMOTE') ? 'REMOTE' : 'LOCAL';
  try { return fn(); } finally {
    // 在 _activeOp 复位前，把本次写入语义记录到持久副本，供延迟的 emit 读取
    _lastWriteRemote = (kind === 'REMOTE');
    _activeOp = prev;
  }
}

/**
 * _applyRemoteMeta(d, opts) —— 把服务器的修订元信息写进本地 _meta
 * 服务器记录 revision / updatedAt / deviceId（最近一次写入者的设备）。
 * 仅 REMOTE 应用时调用；不改版本号（版本号来自服务器，直接赋值）。
 */
function _applyRemoteMeta(d, opts) {
  if (!d || !d._meta) return;
  if (opts && opts.revision != null) d._meta.revision = Number(opts.revision);
  if (opts && opts.updatedAt != null) d._meta.updatedAt = opts.updatedAt;
  if (opts && opts.deviceId != null) d._meta.deviceId = opts.deviceId;
}

/* ===== localStorage 读写封装 ===== */

/**
 * readRaw() —— 从 localStorage 读取并解析数据
 *
 * 【作用】从浏览器的 localStorage 中取出 `chenguangData` 这个 key 的值，
 * 并把 JSON 字符串解析成 JavaScript 对象。
 *
 * 【安全措施】
 *   - localStorage.getItem 可能返回 null（还没写入过数据）
 *   - JSON.parse 可能报错（数据被损坏了）
 *   - 所以用 try-catch 包裹，出错时返回 null 而不是让程序崩溃
 *
 * 【返回值】解析后的对象，或者 null（表示没有数据）
 */
function readRaw() {
  try {
    var raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch (_) {
    return null;
  }
}

/**
 * writeRaw() —— 将数据写入 localStorage
 *
 * 【作用】把数据对象转换成 JSON 字符串，存入浏览器的 localStorage。
 *
 * 【注意事项】
 *   - localStorage 只能存字符串，所以需要 JSON.stringify() 把对象转成字符串
 *   - 如果 localStorage 满了或者浏览器禁止写入，会抛异常，这里 catch 掉
 *
 * 【返回值】true 表示写入成功，false 表示写入失败
 */
function writeRaw(data) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * getLegacy(key, def) —— 读取旧版本的 localStorage 数据
 *
 * 【作用】读取旧版数据（比如 `cg_sports`, `cg_todos` 等旧 key），
 * 用于数据迁移时把旧数据转换成新格式。
 *
 * 【参数】
 *   - key: localStorage 的键名
 *   - def: 默认值，如果 key 不存在或解析失败，返回这个值
 *
 * 【为什么需要】旧版应用把数据分散存在多个 key 里，
 * 新版统一到一个 key 后，需要把旧数据"搬"过来。
 */
function getLegacy(key, def) {
  try {
    var v = globalThis.localStorage.getItem(key);
    if (v == null) return def;
    return JSON.parse(v);
  } catch (_) {
    return def;
  }
}

/* ===== 数据迁移逻辑 ===== */

/**
 * migrateIfNeeded(data) —— 首次运行时，把旧版分散数据合并进新版统一数据
 *
 * 【背景】
 *   早期版本把数据分散存在多个 localStorage key 中：
 *     cg_user     → 用户信息
 *     cg_courses  → 课程
 *     cg_books    → 阅读
 *     cg_sports   → 运动
 *     cg_todos    → 待办
 *     cg_checkins → 打卡
 *     cg_words    → 英语单词
 *     cg_focus    → 专注
 *
 *   新版把这些全部合并到一个 key `chenguangData` 里。
 *   这个函数在首次加载时自动执行，把旧数据"搬"过来。
 *
 * 【迁移标记】
 *   data.__migrated = true 表示已经迁移过了，下次不会重复迁移。
 *
 * 【参数】data —— 当前的数据对象
 * 【返回值】迁移后的数据对象
 */
function migrateIfNeeded(data) {
  // 如果已经迁移过，直接返回，不重复操作
  if (data.__migrated) return data;

  /* ----- 迁移用户信息 (cg_user) ----- */
  var lu = getLegacy(USER_KEY, null);
  if (lu && typeof lu === 'object') {
    // 旧版字段名可能不统一（created_at / startDate），这里都兼容
    var start = lu.created_at || lu.startDate || '';
    data.user = {
      name: lu.nickname || lu.username || lu.name || data.user.name,
      startDate: start,
      totalDays: lu.totalDays || 0,
      continuousDays: lu.continuousDays || 0
    };
  }

  /* ----- 迁移课程 (cg_courses) ----- */
  var lc = getLegacy('cg_courses', []);
  if (Array.isArray(lc) && lc.length) {
    data.courses = lc.map(function (c) {
      // 旧版用 total/learned 字段，新版统一用 progress 百分比
      var total = c.total || 0, learned = c.learned || 0;
      var progress = total > 0 ? Math.round((learned / total) * 100) : (c.progress || 0);
      return {
        id: c.id || uid(),
        name: c.name || '未命名课程',
        progress: progress,
        // 根据进度自动判断课程状态：完成/进行中/未开始
        status: progress >= 100 ? 'done' : (progress > 0 ? 'doing' : 'todo')
      };
    });
  }

  /* ----- 迁移阅读记录 (cg_books) ----- */
  var lb = getLegacy('cg_books', []);
  if (Array.isArray(lb) && lb.length) {
    data.readings = lb.map(function (b) {
      return {
        id: b.id || uid(),
        date: b.date || todayStr(),
        bookName: b.name || '未命名书籍',
        pages: b.read || b.pages || 0,         // 旧版字段名 read / pages 兼容
        totalPages: b.total || b.totalPages || 0 // 旧版字段名 total / totalPages 兼容
      };
    });
  }

  /* ----- 迁移运动记录 (cg_sports) ----- */
  var ls = getLegacy('cg_sports', []);
  if (Array.isArray(ls) && ls.length) {
    data.sports = ls.map(function (s) {
      return {
        id: s.id || uid(),
        date: s.date || todayStr(),
        name: s.name || '运动',
        calories: s.calories != null ? s.calories : (s.cal || 0),   // 旧版用 cal
        duration: s.duration != null ? s.duration : (s.min || 0),   // 旧版用 min
        type: s.type || 'general'
      };
    });
  }

  /* ----- 迁移待办事项 (cg_todos) ----- */
  var lt = getLegacy('cg_todos', []);
  if (Array.isArray(lt) && lt.length) {
    data.todos = lt.map(function (t) {
      return {
        id: t.id || uid(),
        text: t.text || t.t || '',              // 旧版字段名 t / text 兼容
        date: t.date || todayStr(),
        done: !!t.done,
        priority: t.priority || 'normal'
      };
    });
  }

  /* ----- 迁移打卡记录 (cg_checkins) ----- */
  var lk = getLegacy('cg_checkins', []);
  if (Array.isArray(lk) && lk.length) {
    data.checkins = lk.map(function (k) {
      return { date: k.date || todayStr(), status: k.status || 'done' };
    });
  }

  /* ----- 迁移英语学习记录 (cg_words / cg_study) ----- */
  var lw = getLegacy('cg_words', []) || getLegacy('cg_study', []);
  if (Array.isArray(lw) && lw.length) {
    data.english = lw.map(function (w) {
      return {
        id: w.id || uid(),
        date: w.date || todayStr(),
        words: w.words || 0,
        minutes: w.minutes || w.min || 0        // 旧版字段名 min 兼容
      };
    });
  }

  /* ----- 迁移专注记录 (cg_focus) ----- */
  var lf = getLegacy('cg_focus', []);
  if (Array.isArray(lf) && lf.length) {
    data.focus = lf.map(function (f) {
      return {
        id: f.id || uid(),
        date: f.date || todayStr(),
        minutes: f.minutes || 0,
        task: f.task || ''
      };
    });
  }

  // 标记迁移完成，下次加载不会再执行迁移逻辑
  data.__migrated = true;
  return data;
}

/* ===== 缓存 & 脏标记系统 ===== */

/**
 * _cache —— 内存缓存
 *
 * 【作用】避免每次都去读 localStorage（读取和解析 JSON 有开销）。
 * 第一次调用 load() 时从 localStorage 读取并缓存到这个变量，
 * 之后所有操作都在内存中进行，直到需要持久化时才写回 localStorage。
 *
 * 【类比】就像你办公桌上放着今天的文件（缓存），
 * 而不是每次都去档案室（localStorage）翻。
 */
var _cache = null;

/**
 * _dirty —— 脏标记（dirty flag）
 *
 * 【作用】标记"内存中的数据和 localStorage 中的不一致了"。
 * 当调用 persist() 时，_dirty 被设为 true，
 * 表示"有数据需要写回 localStorage"。
 *
 * 【为什么要延迟写入？】
 * 如果每次改一条数据就立刻写 localStorage，高频操作时会很慢。
 * 所以先标记为"脏"，然后用 setTimeout 延迟 100ms 再批量写入，
 * 这样多个快速修改会被合并成一次写入，性能更好。
 */
var _dirty = false;

/**
 * _persistTimer —— 延迟写入的定时器
 *
 * 每次调用 persist() 时，先清除上一个定时器，再设置一个新的。
 * 这样如果 100ms 内有多次修改，只会执行最后一次写入（防抖效果）。
 */
var _persistTimer = null;

/**
 * _dirtyCategories —— 增量同步：追踪哪些数据集合被修改了
 *
 * 【作用】sync.js 在向服务器推送数据时，可以只推送被修改的部分，
 * 而不是每次都推送全部数据，减少网络传输量。
 *
 * 【Set 的特点】同一个 key 多次加入只保留一个，自动去重。
 */
var _dirtyCategories = new Set();

/* ===== 核心读写函数 ===== */

/**
 * load() —— 加载数据（带缓存）
 *
 * 【作用】返回当前的数据对象。如果缓存中有就直接返回缓存，
 * 没有则从 localStorage 读取，如果 localStorage 也没有就创建空数据。
 *
 * 【流程】
 *   1. 检查 _cache 是否有数据 → 有则直接返回
 *   2. 从 localStorage 读取 → 有则使用
 *   3. 如果 localStorage 也没有 → 创建空数据
 *   4. 对数据执行迁移（如果有旧版数据的话）
 *   5. 写回 localStorage（确保迁移后的数据被保存）
 *   6. 存入 _cache 缓存
 */
function load() {
  if (_cache) return _cache;
  var data = readRaw();
  if (!data) {
    data = emptyData();
    data = migrateIfNeeded(data);
    writeRaw(data);
  }
  _cache = data;
  ensureMeta(_cache);
  return _cache;
}

/**
 * persist() —— 标记数据需要持久化（延迟写入）
 *
 * 【作用】当数据被修改后调用，设置脏标记并启动延迟写入。
 *
 * 【防抖原理】
 *   - 每次调用时清除之前的定时器（如果有的话）
 *   - 设置一个新的 100ms 定时器
 *   - 如果 100ms 内又调用了 persist()，之前的定时器会被清除
 *   - 这样多个快速修改最终只会触发一次实际写入
 *
 * 【类比】就像你在图书馆借书，每借一本就记到纸上（标记脏），
 * 然后每隔一段时间统一去柜台办理（flushPersist），
 * 而不是每借一本就跑一趟柜台。
 */
function persist() {
  if (!_cache) return;
  _dirty = true;
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(function () {
    flushPersist();
  }, 100);
}

/**
 * flushPersist() —— 立即将数据写入 localStorage
 *
 * 【作用】把缓存中的数据真正写入 localStorage，同时同步旧版 cg_user 键。
 *
 * 【为什么要同步 cg_user？】
 *   因为旧版的登录流程（apiClient.js）还在读 cg_user 键，
 *   如果不同步，登录后获取的用户信息和实际数据会不一致。
 *   等完全废弃旧登录流程后，这段镜像代码可以删除。
 *
 * 【写入后做了什么？】
 *   - 调用 emit() 触发自定义事件，通知同页面的其他代码"数据更新了"
 */
function flushPersist() {
  if (!_dirty || !_cache) return;
  _dirty = false;

  // 真正写入 localStorage
  writeRaw(_cache);

  // 镜像维护旧版 cg_user 键（兼容旧登录流程）
  try {
    if (_cache.user && (_cache.user.name || _cache.user.startDate)) {
      var mirror = null;
      try { mirror = JSON.parse(globalThis.localStorage.getItem(USER_KEY) || 'null'); } catch (_) {}
      if (!mirror || typeof mirror !== 'object') mirror = {};
      mirror.nickname = _cache.user.name;
      mirror.username = _cache.user.name;
      if (_cache.user.startDate) mirror.created_at = _cache.user.startDate;
      mirror.totalDays = _cache.user.totalDays;
      mirror.continuousDays = _cache.user.continuousDays;
      globalThis.localStorage.setItem(USER_KEY, JSON.stringify(mirror));
    }
  } catch (_) {}

  // 通知同页面的监听者"数据已更新"
  emit();
}

/* ===== 页面生命周期保护 ===== */

/**
 * 【为什么要监听 visibilitychange 和 pagehide？】
 *
 * 用户可能在修改数据后直接关闭页面或切换标签页，
 * 如果脏数据还没来得及写入 localStorage，数据就会丢失。
 * 所以在页面即将隐藏/卸载时，强制把脏数据写入 localStorage。
 *
 * visibilitychange: 标签页从可见变为不可见（比如切换到其他标签页）
 * pagehide: 页面即将被卸载（比如关闭页面）
 */
if (globalThis.document) {
  globalThis.document.addEventListener('visibilitychange', function () {
    if (globalThis.document.visibilityState === 'hidden' && _dirty) {
      flushPersist();
    }
  });
  globalThis.addEventListener('pagehide', function () {
    if (_dirty) flushPersist();
  });
}

/* ===== 事件系统 ===== */

/**
 * emit() —— 触发自定义事件，通知同页面的其他代码"数据已更新"
 *
 * 【作用】数据更新后，通知页面上的其他代码（比如仪表盘页面的图表）
 * 重新从 CGStore 读取最新数据并刷新显示。
 *
 * 【原理】
 *   - 使用浏览器原生的 CustomEvent API 创建一个自定义事件
 *   - 事件名是 'chenguang:update'
 *   - 其他代码通过 addEventListener 监听这个事件
 *
 * 【类比】就像公司发了一封"全员邮件"（事件），收到邮件的部门
 * （页面组件）就知道该更新自己的报表了。
 */
function emit() {
  try {
    var evt = globalThis.document.createEvent('CustomEvent');
    // detail.remote 标记这次更新是否由"远程数据落本地"（REMOTE 语义）引发。
    // 同步层据此跳过调度推送，避免 pull/合并成功 → emit → 又排一次 push 的
    // 自激循环；页面 UI 刷新不受影响（事件照常广播）。
    // 读 _lastWriteRemote 而非 _activeOp：_activeOp 早已被 _runAs 的 finally 复位，
    // emit 走 100ms 延迟定时器，读到的一律是 LOCAL（从而永久漏掉防回环）。
    evt.initCustomEvent('chenguang:update', false, false, {
      key: STORAGE_KEY,
      remote: _lastWriteRemote
    });
    globalThis.dispatchEvent(evt);
  } catch (_) {}
}

/* ===== 跨标签页同步 ===== */

/**
 * 【什么是跨标签页同步？】
 *
 * 用户可能同时打开多个标签页（比如一个标签页是仪表盘，另一个是工作台）。
 * 在一个标签页修改了数据，另一个标签页应该自动更新显示。
 *
 * 【原理】
 *   浏览器有一个原生的 `storage` 事件：
 *   当 localStorage 的内容被其他标签页修改时，当前标签页会收到这个事件。
 *   我们监听这个事件，收到后清空缓存（_cache = null），
 *   下次 load() 时就会从 localStorage 重新读取最新数据。
 */
globalThis.addEventListener('storage', function (e) {
  if (e.key === STORAGE_KEY || e.key == null) {
    _cache = null;
    // 别处写回 → 语义为远端刷新，本页不得再调度 push（防多标签互推）
    _lastWriteRemote = true;
    emit();
  }
});

/* ===== CGStore 对外暴露的 API ===== */

/**
 * CGStore —— 对外暴露的统一数据接口
 *
 * 【设计理念】
 *   所有数据操作都通过这个对象的方法来完成，
 *   页面代码不应该直接操作 localStorage。
 *   这样做的好处：
 *   1. 统一入口，方便管理
 *   2. 自动处理缓存和持久化
 *   3. 自动触发事件通知其他代码
 *   4. 自动追踪修改的集合（用于增量同步）
 *
 * 【使用方式】
 *   CGStore.get()           → 获取全部数据
 *   CGStore.getUser()       → 获取用户信息
 *   CGStore.addSport({...}) → 添加一条运动记录
 *   CGStore.merge({...})    → 合并部分数据（云端同步用）
 */
var CGStore = {
  KEY: STORAGE_KEY,

  /**
   * get() —— 获取全部数据
   *
   * 【返回值】完整的数据对象，包含 user、checkins、sports 等所有字段。
   * 【注意】返回的是缓存的引用，外部修改会影响内部状态。
   *        通常不需要深拷贝，因为所有修改都通过 CGStore 的方法进行。
   */
  get: function () { return load(); },

  /* ===== Phase 8：版本元信息 API（供同步层使用） ===== */

  /** getMeta() —— 取 { revision, updatedAt, deviceId, tombstones } 的浅拷贝 */
  getMeta: function () {
    var d = load();
    ensureMeta(d);
    return {
      revision: Number(d._meta.revision) || 0,
      updatedAt: d._meta.updatedAt || null,
      deviceId: d._meta.deviceId || getDeviceId(),
      tombstones: Object.assign({}, d._meta.tombstones || {})
    };
  },
  /** getRevision() —— 取当前本地版本号 */
  getRevision: function () { return this.getMeta().revision; },
  /** getDeviceId() —— 取本设备稳定 ID */
  getDeviceId: getDeviceId,
  /** getTombstones(name) —— 取某集合的墓碑 ID 列表（不存在返回空数组） */
  getTombstones: function (name) {
    var m = this.getMeta();
    return m.tombstones[name] ? m.tombstones[name].slice() : [];
  },
  /** clearTombstones(name) —— 清空某集合的墓碑（仅在确认服务器已吸收删除后调用） */
  clearTombstones: function (name) {
    var d = load();
    ensureMeta(d);
    if (d._meta.tombstones && d._meta.tombstones[name]) delete d._meta.tombstones[name];
    persist();
  },

  /**
   * set(data, opts) —— 用新数据完全替换当前数据
   *
   * 【作用】通常用于云端数据拉取后，用服务器数据覆盖本地数据。
   * 【参数】
   *   - data —— 新的完整数据对象
   *   - opts.kind —— 'LOCAL'（默认，本机操作，版本号 +1）或 'REMOTE'（来自服务器，不 bump，采用服务器版本号）
   *   - opts.revision / opts.updatedAt / opts.deviceId —— kind 为 REMOTE 时传入服务器元信息
   * 【返回值】替换后的数据对象
   */
  set: function (data, opts) {
    opts = opts || {};
    return _runAs(opts.kind || 'LOCAL', function () {
      var prev = _cache || null;
      _cache = data || emptyData();
      ensureMeta(_cache);
      if (_activeOp === 'LOCAL') {
        _bump('user');
      } else {
        // 保留本机墓碑：REMOTE 全量替换不该丢掉"删除过谁"的记忆，
        // 否则服务器旧副本会在后续合并时把已删除的记录复活。
        // 确认服务器已吸收删除后，才允许 clearTombstones: true。
        if (!opts.clearTombstones && prev && prev._meta && prev._meta.tombstones) {
          _cache._meta.tombstones = prev._meta.tombstones;
        }
        _applyRemoteMeta(_cache, opts);
      }
      persist();
      return _cache;
    });
  },

  /**
   * merge(patch, opts) —— 合并部分数据（不覆盖未提及的字段）
   *
   * 【作用】云端同步时，服务器可能只返回了部分更新的数据，
   * 这个方法把新数据合并到现有数据中，保留未提及的字段。
   *
   * 【参数】
   *   - patch —— 需要合并的字段和值，如 { sports: [...], user: {...} }
   *   - opts.kind —— 'LOCAL'（默认）或 'REMOTE'（服务器数据）
   *   - opts.revision/updatedAt/deviceId —— kind 为 REMOTE 时传入服务器元信息
   * 【返回值】合并后的完整数据
   *
   * 【与 set() 的区别】
   *   set() 会完全替换所有字段
   *   merge() 只覆盖 patch 中提到的字段，其他字段保持不变
   *
   * 【REMOTE 时注意事项】服务器数据落进本地不算"本机新改动"：
   *   不 bump 版本号，也不标记脏集合（避免把服务器数据原样推回去）。
   */
  merge: function (patch, opts) {
    opts = opts || {};
    return _runAs(opts.kind || 'LOCAL', function () {
      var d = load();
      ensureMeta(d);
      if (patch && typeof patch === 'object') {
        for (var k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) {
            if (k === '_meta') continue; // 元信息单独处理，不当作业务集合
            d[k] = patch[k];
            // 标记这个集合被修改了，用于增量同步（仅本机操作才标记）
            if (_activeOp === 'LOCAL') _dirtyCategories.add(k);
          }
        }
      }
      if (_activeOp === 'LOCAL') {
        _bump('user');
      } else {
        _applyRemoteMeta(d, opts);
      }
      persist();
      return d;
    });
  },

  /**
   * resetData() —— 重置所有数据为空（保留用户信息结构）
   *
   * 【作用】退出登录或清除数据时调用，把所有记录清空为空数组。
   * 【注意】会保留 emptyData() 的结构，但内容全部清空。
   */
  resetData: function () {
    // 清空业务数据，同时重置版本号/墓碑（保留设备 ID，因为它属于"这台设备"而非"账号数据"）
    _cache = emptyData();
    ensureMeta(_cache);
    _cache._meta.revision = 0;
    _cache._meta.updatedAt = null;
    _cache._meta.tombstones = {};
    _cache._meta.deviceId = getDeviceId();
    persist();
    return _cache;
  },

  /* ===== 用户信息相关 ===== */

  /**
   * getUser() —— 获取用户信息
   * 【返回值】user 对象，包含 name、startDate、totalDays、continuousDays
   */
  getUser: function () { return load().user || emptyData().user; },

  /**
   * setUser(u) —— 更新用户信息
   *
   * 【作用】更新用户的姓名、起始日期等信息。
   * 【原理】Object.assign 会把三个对象的属性合并：
   *   emptyData().user（默认值）→ d.user（现有值）→ u（新值）
   *   这样确保即使新值缺少某些字段，也有默认值兜底。
   */
  setUser: function (u) {
    var d = load();
    ensureMeta(d);
    d.user = Object.assign(emptyData().user, d.user, u || {});
    _dirtyCategories.add('user');
    _bump('user');
    persist();
    return d.user;
  },

  /**
   * getSemester() —— 读取「学期/周次」配置
   * 【为什么放 user 上】后端 PAYLOAD_KEYS 与前端 mergeState 都按 user 做字段级
   * 合并，配置放这里才能随 Phase 8 同步协议穿越设备，而不必改同步层。
   * 【返回】{ semesterStart:'', currentWeek:0 } —— currentWeek=0 表示自动从开始日推算。
   */
  getSemester: function () {
    var u = load().user || {};
    return {
      semesterStart: typeof u.semesterStart === 'string' ? u.semesterStart : '',
      currentWeek: Number(u.currentWeek) || 0
    };
  },

  /**
   * setSemester(patch) —— 更新「学期/周次」配置
   * 仅更新传入的字段（semesterStart / currentWeek），其余保持。
   * 本机改配置 = 一次业务写，revision 恰好 +1。
   * 【返回】更新后的配置对象
   */
  setSemester: function (patch) {
    patch = patch && typeof patch === 'object' ? patch : {};
    var u = load().user || {};
    var next = {};
    if (patch.semesterStart !== undefined) next.semesterStart = patch.semesterStart;
    if (patch.currentWeek !== undefined) next.currentWeek = Number(patch.currentWeek) || 0;
    this.setUser(next);
    return this.getSemester();
  },

  /* ===== 通用 CRUD 操作（内部方法） ===== */

  /**
   * _list(name) —— 获取某个集合的全部数据
   *
   * 【作用】获取指定名称的数组（如 'sports'、'todos' 等）。
   * 【为什么返回数组？】因为每个集合都是一个记录数组。
   * 【兜底逻辑】如果数据中没有这个集合，返回空数组并自动创建。
   */
  _list: function (name) {
    var d = load();
    return Array.isArray(d[name]) ? d[name] : (d[name] = []);
  },

  /**
   * _add(name, item) —— 向集合中添加一条记录
   *
   * 【作用】给指定集合添加一条新记录，自动分配唯一 ID。
   * 【参数】
   *   - name: 集合名称（如 'sports'、'todos'）
   *   - item: 新记录的数据对象
   * 【返回值】添加后的记录（包含自动生成的 id）
   */
  _add: function (name, item) {
    var d = load();
    ensureMeta(d);
    if (!Array.isArray(d[name])) d[name] = [];
    var rec = Object.assign({ id: uid() }, item);
    d[name].push(rec);
    _dirtyCategories.add(name);
    _bump(name);
    persist();
    return rec;
  },

  /**
   * _update(name, id, patch) —— 更新集合中的某条记录
   *
   * 【作用】根据 ID 找到记录，把 patch 的属性合并进去。
   * 【参数】
   *   - name: 集合名称
   *   - id: 要更新的记录的 ID
   *   - patch: 要更新的字段和值
   * 【返回值】更新后的记录，如果没找到则返回 null
   */
  _update: function (name, id, patch) {
    var d = load();
    ensureMeta(d);
    var arr = Array.isArray(d[name]) ? d[name] : [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr[i] = Object.assign({}, arr[i], patch); _dirtyCategories.add(name); _bump(name); persist(); return arr[i]; }
    }
    return null;
  },

  /**
   * _remove(name, id) —— 删除集合中的某条记录
   *
   * 【作用】根据 ID 从集合中移除一条记录。
   * 【原理】filter() 返回一个新数组，不包含 ID 匹配的那条。
   * 【返回值】true 表示删除成功，false 表示没找到
   */
  _remove: function (name, id) {
    var d = load();
    ensureMeta(d);
    if (!Array.isArray(d[name])) return false;
    var before = d[name].length;
    d[name] = d[name].filter(function (x) { return x.id !== id; });
    if (d[name].length !== before) {
      // 记录墓碑：此 id 在本机被删除，防止服务器旧副本在合并时把记录"复活"
      _addTombstone(name, id);
      _dirtyCategories.add(name);
      _bump(name);
      persist();
      return true;
    }
    return false;
  },

  /**
   * _byDate(name, date) —— 获取某天的记录
   *
   * 【作用】从集合中筛选出指定日期的记录。
   * 【参数】
   *   - name: 集合名称
   *   - date: 日期字符串（如 "2024-01-15"），不传则默认今天
   * 【返回值】符合条件的记录数组
   */
  _byDate: function (name, date) {
    date = date || todayStr();
    return this._list(name).filter(function (x) { return (x.date || '').slice(0, 10) === date; });
  },

  /* ===== 打卡记录相关 ===== */

  /** getCheckins() —— 获取所有打卡记录 */
  getCheckins: function () { return this._list('checkins'); },

  /**
   * addCheckin(date, status) —— 添加或更新某天的打卡记录
   *
   * 【作用】如果那天已经有打卡记录，就更新状态；
   * 如果没有，就创建一条新记录。
   * 【参数】
   *   - date: 日期（不传则默认今天）
   *   - status: 打卡状态（不传则默认 'done'，表示已完成）
   */
  addCheckin: function (date, status) {
    date = date || todayStr();
    var d = load();
    var exist = (Array.isArray(d.checkins) ? d.checkins : []).filter(function (x) { return x.date === date; })[0];
    if (exist) {
      // 历史迁移产生的新打卡记录可能没有 id（旧版数据结构本无 id），
      // 用 id 更新会找不到 —— 这种情况下直接改对象并 bump（Phase 8 顺带修复）
      if (!exist.id) {
        exist.status = status || 'done';
        _dirtyCategories.add('checkins');
        _bump('checkins');
        persist();
        return exist;
      }
      return this._update('checkins', exist.id, { status: status || 'done' });
    }
    return this._add('checkins', { date: date, status: status || 'done' });
  },

  /**
   * isCheckedIn(date) —— 检查某天是否已打卡
   *
   * 【返回值】true 表示已打卡，false 表示未打卡
   * 【原理】some() 方法只要有一个元素满足条件就返回 true
   */
  isCheckedIn: function (date) {
    date = date || todayStr();
    return this._list('checkins').some(function (x) { return x.date === date && x.status === 'done'; });
  },

  /* ===== 运动记录相关 ===== */

  /** getSports() —— 获取所有运动记录 */
  getSports: function () { return this._list('sports'); },
  /** getSportsByDate(date) —— 获取某天的运动记录 */
  getSportsByDate: function (date) { return this._byDate('sports', date); },

  /**
   * addSport(s) —— 添加一条运动记录
   *
   * 【参数】s —— 运动数据对象，可以包含 name（运动名称）、calories（卡路里）、
   *   duration（时长，分钟）、type（类型）等字段
   * 【默认值】未提供的字段会自动填充默认值（如 calories 默认 0）
   */
  addSport: function (s) { return this._add('sports', Object.assign({ date: todayStr(), name: '运动', calories: 0, duration: 0, type: 'general' }, s)); },
  /** updateSport(id, patch) —— 更新某条运动记录 */
  updateSport: function (id, patch) { return this._update('sports', id, patch); },
  /** removeSport(id) —— 删除某条运动记录 */
  removeSport: function (id) { return this._remove('sports', id); },

  /* ===== 阅读记录相关 ===== */

  /** getReadings() —— 获取所有阅读记录 */
  getReadings: function () { return this._list('readings'); },
  /** getReadingsByDate(date) —— 获取某天的阅读记录 */
  getReadingsByDate: function (date) { return this._byDate('readings', date); },

  /**
   * addReading(r) —— 添加一条阅读记录
   * 【参数】r —— 阅读数据，包含 bookName（书名）、pages（已读页数）、totalPages（总页数）
   */
  addReading: function (r) { return this._add('readings', Object.assign({ date: todayStr(), bookName: '书籍', pages: 0, totalPages: 0 }, r)); },
  /** updateReading(id, patch) —— 更新某条阅读记录 */
  updateReading: function (id, patch) { return this._update('readings', id, patch); },
  /** removeReading(id) —— 删除某条阅读记录 */
  removeReading: function (id) { return this._remove('readings', id); },

  /**
   * totalPagesRead() —— 计算所有阅读记录的总阅读页数
   *
   * 【原理】reduce() 把数组中每个元素的 pages 值累加起来。
   * 【返回值】总页数（数字）
   */
  totalPagesRead: function () {
    return this._list('readings').reduce(function (s, x) { return s + (Number(x.pages) || 0); }, 0);
  },

  /**
   * totalBooksFinished() —— 计算已读完的书的数量
   *
   * 【判断标准】totalPages > 0 且 pages >= totalPages（已读页数 ≥ 总页数）
   * 【返回值】已读完的书的数量
   */
  totalBooksFinished: function () {
    return this._list('readings').filter(function (x) { return x.totalPages && x.pages >= x.totalPages; }).length;
  },

  /* ===== 课程记录相关 ===== */

  /** getCourses() —— 获取所有课程 */
  getCourses: function () { return this._list('courses'); },
  /** addCourse(c) —— 添加一门课程 */
  addCourse: function (c) { return this._add('courses', Object.assign({ name: '新课', progress: 0, status: 'todo' }, c)); },
  /** updateCourse(id, patch) —— 更新某门课程 */
  updateCourse: function (id, patch) { return this._update('courses', id, patch); },
  /** removeCourse(id) —— 删除某门课程 */
  removeCourse: function (id) { return this._remove('courses', id); },

  /**
   * courseCount() —— 获取课程总数
   * 【返回值】课程的数量（数字）
   */
  courseCount: function () { return this._list('courses').length; },

  /**
   * courseAvgProgress() —— 计算所有课程的平均进度
   *
   * 【原理】
   *   1. 先用 reduce() 累加所有课程的 progress 值
   *   2. 再除以课程数量得到平均值
   *   3. 用 Math.round() 四舍五入取整
   * 【返回值】平均进度百分比（0-100），没有课程时返回 0
   */
  courseAvgProgress: function () {
    var c = this._list('courses');
    if (!c.length) return 0;
    var sum = c.reduce(function (s, x) { return s + (Number(x.progress) || 0); }, 0);
    return Math.round(sum / c.length);
  },

  /* ===== 英语学习记录相关 ===== */

  /** getEnglish() —— 获取所有英语学习记录 */
  getEnglish: function () { return this._list('english'); },
  /** getEnglishByDate(date) —— 获取某天的英语学习记录 */
  getEnglishByDate: function (date) { return this._byDate('english', date); },
  /** addEnglish(e) —— 添加一条英语学习记录 */
  addEnglish: function (e) { return this._add('english', Object.assign({ date: todayStr(), words: 0, minutes: 0 }, e)); },
  /** updateEnglish(id, patch) —— 更新某条英语学习记录 */
  updateEnglish: function (id, patch) { return this._update('english', id, patch); },
  /** removeEnglish(id) —— 删除某条英语学习记录 */
  removeEnglish: function (id) { return this._remove('english', id); },

  /* ===== 待办事项相关 ===== */

  /** getTodos() —— 获取所有待办事项 */
  getTodos: function () { return this._list('todos'); },
  /** getTodosByDate(date) —— 获取某天的待办事项 */
  getTodosByDate: function (date) { return this._byDate('todos', date); },
  /** addTodo(t) —— 添加一条待办事项 */
  addTodo: function (t) { return this._add('todos', Object.assign({ text: '', date: todayStr(), done: false, priority: 'normal' }, t)); },
  /** updateTodo(id, patch) —— 更新某条待办事项 */
  updateTodo: function (id, patch) { return this._update('todos', id, patch); },

  /**
   * toggleTodo(id) —— 切换待办事项的完成状态
   *
   * 【作用】把待办事项的 done 字段在 true/false 之间切换。
   * 【使用场景】点击待办事项前面的勾选框时调用。
   */
  toggleTodo: function (id) {
    var arr = this._list('todos');
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr[i].done = !arr[i].done; _dirtyCategories.add('todos'); _bump('todos'); persist(); return arr[i]; }
    }
    return null;
  },
  /** removeTodo(id) —— 删除某条待办事项 */
  removeTodo: function (id) { return this._remove('todos', id); },

  /* ===== 专注记录相关 ===== */

  /** getFocus() —— 获取所有专注记录 */
  getFocus: function () { return this._list('focus'); },
  /** getFocusByDate(date) —— 获取某天的专注记录 */
  getFocusByDate: function (date) { return this._byDate('focus', date); },
  /** addFocus(f) —— 添加一条专注记录 */
  addFocus: function (f) { return this._add('focus', Object.assign({ date: todayStr(), minutes: 0, task: '' }, f)); },
  /** updateFocus(id, patch) —— 更新某条专注记录 */
  updateFocus: function (id, patch) { return this._update('focus', id, patch); },
  /** removeFocus(id) —— 删除某条专注记录 */
  removeFocus: function (id) { return this._remove('focus', id); },

  /**
   * totalFocusMinutes() —— 计算所有专注记录的总专注时长（分钟）
   *
   * 【原理】用 reduce() 把所有记录的 minutes 值累加。
   * 【返回值】总分钟数（数字）
   */
  totalFocusMinutes: function () {
    return this._list('focus').reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0);
  },

  /* ===== 目标相关（Phase 12） =====
   目标定义属于业务数据：进 revision + 同步 / 合并 / 墓碑 / 导出导入。
   目标「当前进度」是 Goal Engine 的实时计算结果，绝不持久化到 goals 记录里。 */

  /** getGoals() —— 获取所有目标定义 */
  getGoals: function () { return this._list('goals'); },
  /** getGoal(id) —— 按 ID 取一条目标，未找到返回 null */
  getGoal: function (id) {
    return this._list('goals').filter(function (g) { return g && g.id === id; })[0] || null;
  },
  /**
   * addGoal(g) —— 新增一条目标定义
   * 【参数】g —— { title, type, metric, targetValue, period, startDate, endDate, status }
   * status 默认 'active'；createdAt/updatedAt 自动写入。
   * 返回插入后的记录（含自动 id）；targetValue <= 0 的非法目标拒绝返回 null。
   */
  addGoal: function (g) {
    g = g && typeof g === 'object' ? g : {};
    var tv = Number(g.targetValue);
    if (!g.title || !(tv > 0)) return null; // 沿用 UI 校验，Store 层做最后防线
    var now = nowIso();
    return this._add('goals', {
      title: String(g.title),
      type: String(g.type || ''),
      metric: String(g.metric || ''),
      targetValue: tv,
      period: String(g.period || 'custom'),
      startDate: String(g.startDate || ''),
      endDate: String(g.endDate || ''),
      status: g.status === 'archived' ? 'archived' : 'active',
      createdAt: now,
      updatedAt: now
    });
  },
  /**
   * updateGoal(id, patch) —— 编辑一条目标定义
   * 自动刷新 updatedAt；编辑是一次业务写 → revision +1。
   * 不会触碰任何进度字段（进度由 Goal Engine 实时计算）。
   */
  updateGoal: function (id, patch) {
    patch = patch && typeof patch === 'object' ? patch : {};
    // 与 addGoal 同口径的最后防线：编辑也不得把 targetValue 改成 <=0
    if ('targetValue' in patch) {
      var tv = Number(patch.targetValue);
      if (!(tv > 0) || !isFinite(tv)) return null;
    }
    var next = Object.assign({}, patch);
    next.updatedAt = nowIso();
    return this._update('goals', id, next);
  },
  /**
   * archiveGoal(id) —— 归档目标（优先归档而非删除；revision +1）
   * 返回更新后的记录；未找到返回 null。
   */
  archiveGoal: function (id) {
    return this._update('goals', id, { status: 'archived', updatedAt: nowIso() });
  },
  /**
   * unarchiveGoal(id) —— 取消归档，恢复为 active（revision +1）
   */
  unarchiveGoal: function (id) {
    return this._update('goals', id, { status: 'active', updatedAt: nowIso() });
  },
  /** removeGoal(id) —— 永久删除一条目标（沿用既有删除 + 墓碑语义；revision +1） */
  removeGoal: function (id) { return this._remove('goals', id); },

  /* ===== Token 管理（鉴权相关） ===== */

  /**
   * getToken() —— 获取登录 Token
   *
   * 【什么是 Token？】
   *   Token 是用户登录后服务器发给前端的"身份凭证"。
   *   前端每次请求 API 时带上这个 Token，服务器就知道"这是哪个用户的请求"。
   *   类似于你去政府办事需要带身份证。
   *
   * 【返回值】Token 字符串，或者 null（未登录）
   */
  getToken: function () { try { return globalThis.localStorage.getItem(TOKEN_KEY); } catch (_) { return null; } },

  /**
   * setToken(t) —— 设置或清除 Token
   *
   * 【参数】t —— Token 字符串；传 null 则清除 Token（等同于退出登录）
   */
  setToken: function (t) { try { if (t) globalThis.localStorage.setItem(TOKEN_KEY, t); else globalThis.localStorage.removeItem(TOKEN_KEY); } catch (_) {} },

  /* ===== 数据清理 ===== */

  /**
   * clearNewUserData() —— 清除所有旧版 localStorage 键
   *
   * 【作用】在数据迁移完成后，清理旧版遗留的各种 cg_* 键，
   * 释放 localStorage 空间，避免数据混乱。
   *
   * 【注意】这个方法会同时重置所有数据！
   */
  clearNewUserData: function () {
    ['cg_courses', 'cg_books', 'cg_sports', 'cg_todos', 'cg_words', 'cg_study',
     'cg_checkins', 'cg_tasks', 'cg_goals', 'cg_word_progress', 'cg_remember',
     'cg_demo_users'].forEach(function (k) {
      try { globalThis.localStorage.removeItem(k); } catch (_) {}
    });
    this.resetData();
  },

  /**
   * logout() —— 退出登录，清除所有数据
   *
   * 【做了什么】
   *   1. 清除 Token（cg_token）
   *   2. 清除用户信息（cg_user）
   *   3. 清除所有 cg_* 和 cgl_* 开头的 localStorage 键
   *   4. 重置所有数据为空
   *
   * 【注意】这会清除本地所有数据！如果需要保留数据，不要调用这个方法。
   */
  logout: function () {
    this.setToken(null);
    try { globalThis.localStorage.removeItem(USER_KEY); } catch (_) {}
    var keys = [];
    try { for (var i = 0; i < globalThis.localStorage.length; i++) { var k = globalThis.localStorage.key(i); if (k && (k.indexOf('cg_') === 0 || k.indexOf('cgl_') === 0)) keys.push(k); } } catch (_) {}
    keys.forEach(function (k) { try { globalThis.localStorage.removeItem(k); } catch (_) {} });
    this.resetData();
  },

  // 暴露工具函数供外部使用
  uid: uid,
  today: todayStr,

  // ===== 增量同步：脏集合追踪 =====
  /**
   * getDirtyCategories() —— 获取已修改的集合名称列表
   *
   * 【作用】sync.js 调用此方法，知道哪些集合被修改了，
   * 从而只推送修改过的部分（增量同步），而不是每次都推送全部数据。
   *
   * 【返回值】数组，包含被修改的集合名称，如 ['sports', 'user']
   */
  getDirtyCategories: function () { return Array.from(_dirtyCategories); },

  /**
   * clearDirtyCategories() —— 清除脏标记
   *
   * 【作用】在增量同步成功后调用，表示所有修改都已推送到服务器，
   * 清除脏标记，下次同步时不需要再推送这些集合。
   */
  clearDirtyCategories: function () { _dirtyCategories.clear(); },

  /**
   * markDirty(name) —— 手动标记某个集合为已修改
   *
   * 【作用】供 sync 层合并云端数据时使用，
   * 确保合并的数据在下次推送时被包含在内。
   */
  markDirty: function (name) { _dirtyCategories.add(name); },
};

/* ===== 事件监听注册 ===== */

/**
 * onUpdate(fn) —— 注册数据更新监听器
 *
 * 【作用】当数据被修改后，fn 函数会被自动调用。
 * 页面代码可以用这个方法来刷新 UI。
 *
 * 【参数】fn —— 回调函数，无参数
 * 【返回值】取消监听的函数（调用后不再接收通知）
 *
 * 【使用示例】
 *   var unsub = CGStore.onUpdate(function() {
 *     console.log('数据更新了！');
 *     refreshUI();
 *   });
 *   // 不需要监听时：
 *   unsub();
 */
CGStore.onUpdate = function (fn) {
  var handler = function (e) { try { fn(e); } catch (_) {} };
  globalThis.addEventListener('chenguang:update', handler);
  return function () { globalThis.removeEventListener('chenguang:update', handler); };
};

// 向后兼容：暴露到全局，方便不使用 ES Module 的旧代码访问
globalThis.CGStore = CGStore;

export default CGStore;
export { CGStore, uid, todayStr, getDeviceId };
