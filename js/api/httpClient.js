/**
 * ============================================================
 * 晨光自律台 · HTTP 核心客户端
 * ------------------------------------------------------------
 * 基于 fetch 封装, 提供:
 *   - 自动携带 JWT (请求拦截)
 *   - 统一 JSON 解析 + 响应拦截
 *   - 统一错误处理 (401 自动登出)
 *   - 加载状态管理 (pending 计数 + 自定义事件)
 *   - 本地缓存优化 (GET 请求, TTL + 变更失效)
 *
 * 响应格式约定 (后端):
 *   成功 (业务接口): { data, meta? }
 *   成功 (认证接口): { token, user } 或 { user }
 *   失败:            { error: { code, message } }
 * ============================================================
 */
import { API_BASE_URL } from '../config.js';

/* ---------- 本地存储 Key ---------- */
const STORAGE_KEYS = {
  TOKEN: 'cg_token',
  USER: 'cg_user',
};

/* ---------- 配置 ---------- */
const DEFAULT_BASE_URL = API_BASE_URL;
const DEFAULT_TIMEOUT = 15000; // 15s

/* ---------- 工具函数 ---------- */

/** 构造查询字符串, 自动跳过 null/undefined/空串 */
function buildQueryString(params = {}) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (!entries.length) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of entries) usp.append(k, String(v));
  return '?' + usp.toString();
}

/** 简单深拷贝 (仅用于缓存存取, 避免引用污染) */
function deepCopy(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

/* ============================================================
   轻量本地缓存 — 用于 GET 请求优化
   - 内存 Map: 同一页面会话内快速命中
   - localStorage 持久层: 跨页面复用 (带 TTL)
   - 变更操作 (POST/PUT/DELETE) 自动失效
   ============================================================ */
class RequestCache {
  constructor() {
    this._mem = new Map(); // key → { data, ts }
  }

  _storageKey(key) {
    return 'cg_cache_' + key;
  }

  /** 读取缓存 (内存优先, 其次 localStorage), 未命中或过期返回 null */
  get(key, ttl = 60000) {
    // 1. 内存层
    const mem = this._mem.get(key);
    if (mem && Date.now() - mem.ts < ttl) {
      return deepCopy(mem.data);
    }
    // 2. localStorage 层
    try {
      const raw = localStorage.getItem(this._storageKey(key));
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry && Date.now() - entry.ts < ttl) {
          // 回填内存层
          this._mem.set(key, entry);
          return deepCopy(entry.data);
        }
        localStorage.removeItem(this._storageKey(key));
      }
    } catch (_) { /* localStorage 不可用时静默降级 */ }
    return null;
  }

  /** 写入缓存 (内存 + localStorage 双写) */
  set(key, data) {
    const entry = { data: deepCopy(data), ts: Date.now() };
    this._mem.set(key, entry);
    try {
      localStorage.setItem(this._storageKey(key), JSON.stringify(entry));
    } catch (_) { /* quota 满时静默忽略 */ }
  }

  /** 按前缀批量失效 (用于变更后刷新数据) */
  invalidate(prefix) {
    // 内存层
    for (const key of this._mem.keys()) {
      if (prefix === '*' || key.startsWith(prefix)) {
        this._mem.delete(key);
      }
    }
    // localStorage 层
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cg_cache_')) {
          const cacheKey = k.slice('cg_cache_'.length);
          if (prefix === '*' || cacheKey.startsWith(prefix)) {
            toRemove.push(k);
          }
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* 静默 */ }
  }

  /** 清空全部缓存 */
  clear() {
    this._mem.clear();
    this.invalidate('*');
  }
}

/* ============================================================
   加载状态管理 — 通过自定义事件通知 UI 层
   - loading:start  → { count }
   - loading:end    → { count }
   ============================================================ */
class LoadingTracker {
  constructor() {
    this._count = 0;
  }

  _emit(eventName) {
    window.dispatchEvent(new CustomEvent(eventName, { detail: { count: this._count } }));
  }

  start() {
    this._count++;
    if (this._count === 1) this._emit('loading:start');
  }

  end() {
    if (this._count > 0) this._count--;
    if (this._count === 0) this._emit('loading:end');
  }

  get isLoading() {
    return this._count > 0;
  }
}

/* ============================================================
   API 错误类 — 统一携带 code + message + statusCode
   ============================================================ */
class ApiError extends Error {
  constructor(message, { code, statusCode, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN';
    this.statusCode = statusCode || 0;
    this.data = data;
  }

  /** 是否为网络错误 (请求未到达服务器) */
  get isNetworkError() {
    return this.statusCode === 0;
  }

  /** 是否为认证失效 (401) */
  get isAuthError() {
    return this.statusCode === 401;
  }

  /** 是否为权限不足 (403) */
  get isForbidden() {
    return this.statusCode === 403;
  }
}

/* ============================================================
   HTTP 客户端主体
   ============================================================ */
class HttpClient {
  constructor({ baseURL = DEFAULT_BASE_URL, timeout = DEFAULT_TIMEOUT } = {}) {
    this.baseURL = baseURL.replace(/\/$/, ''); // 去掉尾部斜杠
    this.timeout = timeout;
    this.cache = new RequestCache();
    this.loading = new LoadingTracker();

    // 全局 401 回调 (可被 authService 覆盖)
    this.onUnauthorized = () => {
      this.clearAuth();
      this.cache.clear();
    };
  }

  /* ---------- JWT 管理 ---------- */

  getToken() {
    try {
      return localStorage.getItem(STORAGE_KEYS.TOKEN);
    } catch (_) {
      return null;
    }
  }

  setToken(token) {
    try {
      if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      else localStorage.removeItem(STORAGE_KEYS.TOKEN);
    } catch (_) { /* 静默 */ }
  }

  getUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  setUser(user) {
    try {
      if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      else localStorage.removeItem(STORAGE_KEYS.USER);
    } catch (_) { /* 静默 */ }
  }

  clearAuth() {
    this.setToken(null);
    this.setUser(null);
  }

  /* ---------- 请求拦截器: 组装 headers ---------- */
  _buildHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // CSRF 防护: 跨域表单无法伪造此头
      ...customHeaders,
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /* ---------- 响应拦截器: 统一解析 ---------- */
  async _handleResponse(response) {
    // 204 No Content → 直接返回 null
    if (response.status === 204) return null;

    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_) {
      // 非 JSON 响应
      if (!response.ok) {
        throw new ApiError(`服务器返回非 JSON 数据 (HTTP ${response.status})`, {
          code: 'PARSE_ERROR',
          statusCode: response.status,
        });
      }
      return text;
    }

    // 错误响应: { error: { code, message } }
    if (!response.ok) {
      const errInfo = body?.error || {};
      const apiErr = new ApiError(errInfo.message || `请求失败 (HTTP ${response.status})`, {
        code: errInfo.code || 'HTTP_ERROR',
        statusCode: response.status,
        data: body,
      });

      // 401 认证失效 → 触发全局登出
      if (response.status === 401) {
        this.onUnauthorized();
      }

      throw apiErr;
    }

    // 成功响应: 原样返回 (可能是 { data, meta } 或 { token, user } 或 { user })
    return body;
  }

  /* ---------- 带超时的 fetch ---------- */
  async _fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- 核心请求方法 ---------- */
  async _request(method, path, { body, params, headers, cacheKey, cacheTTL, skipLoading } = {}) {
    // 组装完整 URL
    let url = this.baseURL + path + buildQueryString(params);

    // GET 缓存命中检查
    if (method === 'GET' && cacheKey) {
      const cached = this.cache.get(cacheKey, cacheTTL);
      if (cached !== null) return cached;
    }

    const options = {
      method,
      headers: this._buildHeaders(headers),
    };
    if (body !== undefined && body !== null) {
      options.body = JSON.stringify(body);
    }

    if (!skipLoading) this.loading.start();
    try {
      const response = await this._fetchWithTimeout(url, options);
      const result = await this._handleResponse(response);

      // GET 成功 → 写入缓存
      if (method === 'GET' && cacheKey && result !== null) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (err) {
      // AbortError (超时)
      if (err.name === 'AbortError') {
        throw new ApiError('请求超时，请检查网络后重试', {
          code: 'TIMEOUT',
          statusCode: 0,
        });
      }
      // 网络错误 (fetch 直接 reject, 无 response)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new ApiError('网络连接失败，请检查网络或服务是否可用', {
          code: 'NETWORK_ERROR',
          statusCode: 0,
        });
      }
      // 已是 ApiError 直接抛出
      if (err instanceof ApiError) throw err;
      // 其他未知错误
      throw new ApiError(err.message || '未知错误', {
        code: 'UNKNOWN',
        statusCode: 0,
      });
    } finally {
      if (!skipLoading) this.loading.end();
    }
  }

  /* ---------- 便捷方法 ---------- */

  get(path, opts = {}) {
    return this._request('GET', path, opts);
  }

  post(path, body, opts = {}) {
    return this._request('POST', path, { ...opts, body });
  }

  put(path, body, opts = {}) {
    return this._request('PUT', path, { ...opts, body });
  }

  patch(path, body, opts = {}) {
    return this._request('PATCH', path, { ...opts, body });
  }

  delete(path, opts = {}) {
    return this._request('DELETE', path, opts);
  }
}

/* ---------- 单例导出 ---------- */
const http = new HttpClient();

export { http, ApiError, STORAGE_KEYS };
export default http;
