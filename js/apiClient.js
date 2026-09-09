/**
 * 晨光自律台 · 前端 API 客户端 (ES Module)
 * ------------------------------------------------------------
 * - 自动携带 JWT Token 请求头
 * - 自动携带 CSRF 防护头 (X-Requested-With)
 * - 统一错误处理
 * - 登录/注册/获取用户/更新资料 接口封装
 *
 * ========== 文件在架构中的角色 ==========
 *  本文件是"HTTP 通信管家"，负责与后端服务器的所有网络通信。
 *  它不关心数据如何存储（那是 store.js 的事），
 *  也不关心数据如何同步（那是 sync.js 的事），只负责"发请求、拿响应"。
 *
 *  依赖关系：
 *    - 本文件不依赖其他 JS 模块（独立的 HTTP 客户端）
 *    - 被页面 JS 调用（如 CGAPI.auth.login()、CGAPI.stats.overview()）
 *    - 与 sync.js 独立（各自有自己的 HTTP 请求逻辑）
 *
 * ========== 核心概念解释 ==========
 *  - JWT（JSON Web Token）：一种常用的身份认证令牌格式
 *  - CSRF（Cross-Site Request Forgery）：跨站请求伪造，一种 web 攻击方式
 *  - Bearer Token：一种 HTTP 认证方案，Token 放在 Authorization 头中
 * ------------------------------------------------------------
 */
'use strict';

/* ===== 常量配置 ===== */

/**
 * API_BASE —— 后端 API 的基础地址
 *
 * 【作用】所有 API 请求都发往这个地址 + 具体路径。
 * 【默认值】http://localhost:3000/api（本地开发环境）
 * 【注意】可以通过 CGAPI.config.setBaseUrl() 动态修改
 */
var API_BASE = 'http://localhost:3000/api';

/**
 * STORAGE —— localStorage 中的键名常量
 *
 * 【TOKEN】存储登录 Token 的键名（与 store.js 保持一致）
 * 【USER】存储用户信息的键名（与 store.js 保持一致）
 */
var STORAGE = {
  TOKEN: 'cg_token',
  USER: 'cg_user'
};

/* ===== Token & 用户信息管理 ===== */

/**
 * getToken() —— 从 localStorage 读取登录 Token
 *
 * 【什么是 JWT Token？】
 *   JWT（JSON Web Token）是服务器发给客户端的一串加密字符串，
 *   包含了用户身份信息。前端每次请求 API 时带上它，
 *   服务器解密后就知道"这是哪个用户的请求"。
 *
 *   JWT 的结构：header.payload.signature（三部分用点连接）
 *   - header: 算法信息（如 HS256）
 *   - payload: 用户信息（如 user_id, 过期时间）
 *   - signature: 签名（防篡改）
 *
 * 【为什么存在 localStorage？】
 *   因为需要在页面刷新后仍然保持登录状态。
 *   localStorage 的数据不会因页面刷新而丢失。
 *
 * 【安全注意】
 *   localStorage 容易被 XSS 攻击窃取。
 *   更安全的做法是用 HttpOnly Cookie，但实现更复杂。
 *   对于这种小型个人应用，localStorage 够用。
 *
 * 【返回值】Token 字符串，未登录时返回 null
 */
function getToken() {
  try { return localStorage.getItem(STORAGE.TOKEN); }
  catch (_) { return null; }
}

/**
 * setToken(token) —— 保存或清除 Token
 *
 * 【作用】登录成功后保存 Token，退出登录时清除 Token。
 * 【参数】token —— Token 字符串；传 null 或 undefined 则清除 Token
 */
function setToken(token) {
  try {
    if (token) localStorage.setItem(STORAGE.TOKEN, token);
    else localStorage.removeItem(STORAGE.TOKEN);
  } catch (_) {}
}

/**
 * getUser() —— 从 localStorage 读取用户信息
 *
 * 【作用】获取缓存在本地的用户资料（如昵称、邮箱等）。
 * 【返回值】用户信息对象，或者 null（未登录或无缓存）
 */
function getUser() {
  try {
    var raw = localStorage.getItem(STORAGE.USER);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

/**
 * setUser(user) —— 保存用户信息到 localStorage
 *
 * 【作用】登录成功后，把服务器返回的用户信息缓存到本地。
 * 【参数】user —— 用户信息对象；传 null 则清除缓存
 */
function setUser(user) {
  try {
    if (user) localStorage.setItem(STORAGE.USER, JSON.stringify(user));
    else localStorage.removeItem(STORAGE.USER);
  } catch (_) {}
}

/**
 * clearAuth() —— 清除所有认证信息
 *
 * 【作用】退出登录时调用，同时清除 Token 和用户信息。
 * 【实现】简单地调用 setToken(null) 和 setUser(null)
 */
function clearAuth() {
  setToken(null);
  setUser(null);
}

/**
 * isAuthenticated() —— 检查用户是否已登录
 *
 * 【原理】只要 Token 存在就认为已登录（不验证 Token 是否过期）。
 * 【返回值】true 表示已登录
 */
function isAuthenticated() {
  return !!getToken();
}

/* ===== HTTP 请求核心 ===== */

/**
 * request(method, path, data) —— 发送 HTTP 请求（核心方法）
 *
 * 【作用】封装了浏览器的 fetch API，自动处理：
 *   1. Token 认证（自动添加 Authorization 头）
 *   2. CSRF 防护（添加 X-Requested-With 头）
 *   3. Token 续期（从响应头读取新 Token）
 *   4. 错误处理（统一的错误格式）
 *   5. 响应解析（自动 JSON 解析）
 *
 * 【参数】
 *   - method: HTTP 方法（'GET' / 'POST' / 'PUT' / 'DELETE'）
 *   - path: API 路径（如 '/auth/login'）
 *   - data: 请求体数据（POST/PUT 时需要），会被 JSON 序列化
 *
 * 【请求头详解】
 *   Content-Type: application/json
 *     → 告诉服务器"我发送的数据是 JSON 格式"
 *
 *   X-Requested-With: XMLHttpRequest
 *     → CSRF 防护头。恶意网站的 JavaScript 无法设置自定义请求头，
 *       所以服务器可以通过检查这个头来区分"正常请求"和"跨站攻击请求"。
 *
 *   Authorization: Bearer <token>
 *     → 携带 JWT Token。服务器收到后解密验证身份。
 *       "Bearer" 是一种认证方案的名称，表示"持有此令牌的人"。
 *
 * 【Token 续期机制】
 *   服务器可以在响应头 X-Renewed-Token 中返回新的 Token。
 *   前端收到后自动替换旧 Token。
 *   这样用户不需要频繁重新登录（Token 快过期时服务器自动续期）。
 *
 * 【错误处理】
 *   - HTTP 状态码非 2xx：解析错误消息，抛出带 status 的 Error
 *   - 网络连接失败（TypeError）：抛出友好的中文提示
 *   - 其他错误：直接抛出
 *
 * 【返回值】Promise，resolve 时返回解析后的 JSON 数据
 * 【错误】reject 时抛出 Error 对象（包含 message 和 status）
 */
function request(method, path, data) {
  var url = API_BASE + path;
  var headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  };

  // 如果有 Token，添加到请求头
  var token = getToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  var options = {
    method: method,
    headers: headers
  };

  // 只有 POST/PUT/DELETE 等需要请求体
  if (data !== undefined && data !== null) {
    options.body = JSON.stringify(data);
  }

  // 8秒超时，防止请求挂起
  var controller = null;
  var timeoutId = null;
  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    timeoutId = setTimeout(function () { controller.abort(); }, 8000);
  }
  if (controller) options.signal = controller.signal;

  return fetch(url, options).then(function (response) {
    if (timeoutId) clearTimeout(timeoutId);
    // 【Token 续期】检查响应头是否有新 Token
    try {
      var renewed = response.headers.get('X-Renewed-Token');
      if (renewed) setToken(renewed);
    } catch (_) {}

    // 先读取响应体文本（因为 response.body 是一个流，只能读一次）
    var text = response.text();

    // HTTP 状态码非 2xx → 处理错误
    if (!response.ok) {
      return text.then(function (bodyText) {
        // 尝试解析 JSON 错误信息
        var body;
        try { body = JSON.parse(bodyText); }
        catch (_) { body = bodyText; }

        // 从响应体中提取错误消息（兼容不同的错误格式）
        var errorMsg = '请求失败';
        if (body && body.error && body.error.message) {
          errorMsg = body.error.message;
        } else if (body && body.message) {
          errorMsg = body.message;
        } else if (typeof body === 'string') {
          errorMsg = body;
        }

        // 创建带状态码的错误对象
        var error = new Error(errorMsg);
        error.status = response.status;
        error.data = body;
        throw error;
      });
    }

    // 204 No Content → 返回 null（没有响应体）
    if (response.status === 204) return null;

    // 正常响应 → 解析 JSON
    return text.then(function (bodyText) {
      try { return JSON.parse(bodyText); }
      catch (_) { return bodyText; }
    });
  }).catch(function (err) {
    if (timeoutId) clearTimeout(timeoutId);
    // 请求被取消（超时）→ 静默处理
    if (err.name === 'AbortError') {
      var timeoutErr = new Error('请求超时，请检查网络连接');
      timeoutErr.status = 0;
      throw timeoutErr;
    }
    // 网络连接失败（fetch 本身失败时抛 TypeError）
    if (err instanceof TypeError) {
      var netErr = new Error('网络连接失败，请检查后端服务是否启动');
      netErr.status = 0;
      throw netErr;
    }
    throw err;
  });
}

/* ===== API 接口封装 ===== */

/**
 * CGAPI —— 对外暴露的 API 接口对象
 *
 * 【设计理念】
 *   把所有后端 API 按功能分组，提供语义化的方法名。
 *   页面代码不需要手动拼 URL、设置请求头，只需要调用对应方法即可。
 *
 * 【分组】
 *   - config: 配置相关（如修改 API 地址）
 *   - auth: 认证相关（登录、注册、获取用户信息）
 *   - stats: 统计相关（总览、周报、月报等）
 *   - checkins: 打卡相关
 *   - tasks: 任务相关
 *   - study: 学习相关
 *   - leaderboard: 排行榜相关
 *
 * 【使用示例】
 *   CGAPI.auth.login('user@example.com', 'password')
 *     .then(function(res) { console.log('登录成功', res); })
 *     .catch(function(err) { console.log('登录失败', err.message); });
 */
var CGAPI = {

  /* ===== 配置接口 ===== */

  /**
   * config —— 配置管理
   *
   * 【setBaseUrl(url)】动态修改 API 地址
   * 【用途】比如从本地开发切换到生产环境时调用
   */
  config: {
    setBaseUrl: function (url) { API_BASE = url; }
  },

  /* ===== 认证接口 ===== */

  /**
   * auth —— 用户认证相关接口
   *
   * 【什么是认证？】
   *   认证 = 证明"我是谁"。用户通过登录（输入邮箱+密码）来证明身份，
   *   服务器验证后发给前端一个 Token，后续请求带上 Token 就不需要
   *   每次都输入密码了。
   */
  auth: {
    /**
     * register(nickname, email, password) —— 用户注册
     *
     * 【作用】创建新用户账号
     * 【参数】
     *   - nickname: 昵称（显示名称）
     *   - email: 邮箱（作为登录账号）
     *   - password: 密码
     * 【流程】发送 POST 请求 → 成功后自动保存 Token 和用户信息
     * 【返回值】Promise，resolve 时返回服务器响应（包含 token 和 user）
     */
    register: function (nickname, email, password) {
      return request('POST', '/auth/register', {
        nickname: nickname,
        email: email,
        password: password
      }).then(function (res) {
        if (res.token) setToken(res.token);
        if (res.user) setUser(res.user);
        return res;
      });
    },

    /**
     * login(email, password) —— 用户登录
     *
     * 【作用】验证用户身份，获取访问令牌
     * 【参数】
     *   - email: 注册时使用的邮箱
     *   - password: 密码
     * 【流程】发送 POST 请求 → 成功后自动保存 Token 和用户信息
     * 【返回值】Promise，resolve 时返回服务器响应
     */
    login: function (email, password) {
      return request('POST', '/auth/login', {
        email: email,
        password: password
      }).then(function (res) {
        if (res.token) setToken(res.token);
        if (res.user) setUser(res.user);
        return res;
      });
    },

    /**
     * getCurrentUser() —— 获取当前登录用户的信息
     *
     * 【作用】从服务器获取最新的用户资料，并更新本地缓存。
     * 【使用场景】页面加载时调用，确保用户信息是最新的。
     * 【返回值】Promise，resolve 时返回 { user: {...} }
     */
    getCurrentUser: function () {
      return request('GET', '/auth/me').then(function (res) {
        if (res.user) setUser(res.user);
        return res;
      });
    },

    /**
     * updateProfile(profile) —— 更新用户资料
     *
     * 【作用】修改用户的昵称、密码等信息
     * 【参数】profile —— 要更新的字段，如 { nickname: '新昵称' }
     * 【返回值】Promise，resolve 时返回更新后的用户信息
     */
    updateProfile: function (profile) {
      return request('PUT', '/auth/me', profile).then(function (res) {
        if (res.user) setUser(res.user);
        return res;
      });
    },

    /**
     * logout() —— 退出登录
     *
     * 【作用】清除本地的 Token 和用户信息。
     * 【注意】这只是清除本地凭证，不会通知服务器。
     *        服务器端的 Token 会在过期后自动失效。
     */
    logout: function () { clearAuth(); },

    /**
     * isAuthenticated() —— 检查是否已登录
     * 【返回值】true 表示已登录
     */
    isAuthenticated: function () { return isAuthenticated(); },

    /**
     * getLocalUser() —— 获取本地缓存的用户信息
     *
     * 【作用】不发网络请求，直接从 localStorage 读取。
     * 【使用场景】页面快速显示用户昵称等信息。
     * 【返回值】用户信息对象，未登录时返回 null
     */
    getLocalUser: function () { return getUser(); },

    /**
     * getToken() —— 获取当前的 Token
     * 【返回值】Token 字符串，未登录时返回 null
     */
    getToken: function () { return getToken(); }
  },

  /* ===== 统计接口 ===== */

  /**
   * stats —— 数据统计相关接口
   *
   * 【用途】仪表盘页面调用这些接口获取各种统计数据。
   * 【注意】这些接口需要登录才能访问（会自动带上 Token）。
   */
  stats: {
    /**
     * overview() —— 获取总览统计
     * 【返回值】总打卡天数、总运动时长、总阅读页数等汇总数据
     */
    overview: function () { return request('GET', '/stats/overview'); },

    /**
     * weekly() —— 获取本周统计
     * 【返回值】本周每天的打卡、运动、阅读等数据
     */
    weekly: function () { return request('GET', '/stats/weekly'); },

    /**
     * monthly() —— 获取本月统计
     * 【返回值】本月每天的打卡、运动、阅读等数据
     */
    monthly: function () { return request('GET', '/stats/monthly'); },

    /**
     * today() —— 获取今日统计
     * 【返回值】今天的打卡、运动、阅读等数据
     */
    today: function () { return request('GET', '/stats/today'); },

    /**
     * heatmap() —— 获取热力图数据
     * 【返回值】一年中每天的活跃程度数据，用于在日历上显示热力图
     */
    heatmap: function () { return request('GET', '/stats/heatmap'); }
  },

  /* ===== 打卡接口 ===== */

  /**
   * checkins —— 打卡记录相关接口
   */
  checkins: {
    /**
     * list() —— 获取所有打卡记录
     * 【返回值】打卡记录数组
     */
    list: function () { return request('GET', '/checkins'); },

    /**
     * stats() —— 获取打卡统计数据
     * 【返回值】连续打卡天数、总打卡天数等
     */
    stats: function () { return request('GET', '/checkins/stats'); },

    /**
     * create(data) —— 创建一条打卡记录
     * 【参数】data —— 打卡数据，如 { date: '2024-01-15', status: 'done' }
     */
    create: function (data) { return request('POST', '/checkins', data); }
  },

  /* ===== 任务接口 ===== */

  /**
   * tasks —— 待办任务相关接口
   */
  tasks: {
    /**
     * list() —— 获取所有任务
     * 【返回值】任务数组
     */
    list: function () { return request('GET', '/tasks'); },

    /**
     * create(data) —— 创建一个新任务
     * 【参数】data —— 任务数据，如 { text: '完成作业', priority: 'high' }
     */
    create: function (data) { return request('POST', '/tasks', data); },

    /**
     * remove(id) —— 删除一个任务
     * 【参数】id —— 任务的唯一标识符
     */
    remove: function (id) { return request('DELETE', '/tasks/' + id); }
  },

  /* ===== 学习接口 ===== */

  /**
   * study —— 学习记录相关接口
   */
  study: {
    /**
     * list() —— 获取所有学习记录
     * 【返回值】学习记录数组（如英语单词、课程学习等）
     */
    list: function () { return request('GET', '/study'); },

    /**
     * stats() —— 获取学习统计数据
     * 【返回值】学习时长、完成课程数等
     */
    stats: function () { return request('GET', '/study/stats'); },

    /**
     * create(data) —— 创建一条学习记录
     * 【参数】data —— 学习数据
     */
    create: function (data) { return request('POST', '/study', data); }
  },

  /* ===== 排行榜接口 ===== */

  /**
   * leaderboard —— 排行榜相关接口
   */
  leaderboard: {
    /**
     * list(limit) —— 获取排行榜
     *
     * 【参数】limit —— 可选，返回的排名数量（如 10 表示前 10 名）
     * 【返回值】排行榜数组，按某种规则排序（如连续打卡天数）
     *
     * 【URL 构建】
     *   如果传了 limit，URL 变成 /leaderboard?limit=10
     *   没传则使用默认值（服务器端决定返回多少条）
     */
    list: function (limit) {
      var p = (limit && Number.isFinite(limit)) ? ('?limit=' + limit) : '';
      return request('GET', '/leaderboard' + p);
    }
  }
};

// 暴露到全局，方便不使用 ES Module 的代码访问
globalThis.CGAPI = CGAPI;

export default CGAPI;
export { CGAPI };
