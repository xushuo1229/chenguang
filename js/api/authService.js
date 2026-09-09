/**
 * ============================================================
 * 晨光自律台 · 认证服务 (authService)
 * ------------------------------------------------------------
 * 对接后端 /api/auth 接口:
 *   POST /auth/register  → { email, password, nickname }   → { token, user }
 *   POST /auth/login     → { email, password }              → { token, user }
 *   GET  /auth/me                                         → { user }
 *   PUT  /auth/me         → { nickname?, avatar_url? }      → { user }
 *
 * 说明:
 *   - register(username, email, password) 中的 username 会映射为后端的 nickname
 *   - 登录/注册成功后自动存储 token + user 到 localStorage
 *   - 401 时由 httpClient 自动清空认证信息
 * ============================================================
 */
import http, { ApiError } from './httpClient.js';

const authService = {
  /**
   * 用户注册
   * @param {string} username - 用户名 (映射为后端 nickname)
   * @param {string} email    - 邮箱
   * @param {string} password - 密码 (≥6 位)
   * @returns {Promise<Object>} user 对象 { id, email, nickname, avatar_url, created_at }
   */
  async register(username, email, password) {
    const res = await http.post('/auth/register', {
      email,
      password,
      nickname: username, // 后端字段为 nickname
    });

    // 注册即返回 token + user, 自动存储
    http.setToken(res.token);
    http.setUser(res.user);
    return res.user;
  },

  /**
   * 用户登录
   * @param {string} email    - 邮箱
   * @param {string} password - 密码
   * @returns {Promise<Object>} user 对象 { id, email, nickname, avatar_url, created_at }
   */
  async login(email, password) {
    const res = await http.post('/auth/login', {
      email,
      password,
    });

    http.setToken(res.token);
    http.setUser(res.user);
    return res.user;
  },

  /**
   * 退出登录 — 清空本地 token + user + 缓存
   */
  logout() {
    http.clearAuth();
    http.cache.clear();
  },

  /**
   * 获取当前用户信息 (从服务器刷新)
   * @returns {Promise<Object>} user 对象
   */
  async getCurrentUser() {
    const res = await http.get('/auth/me', {
      cacheKey: 'auth:me',
      cacheTTL: 30000, // 30s 缓存
    });
    // 同步更新本地存储
    http.setUser(res.user);
    return res.user;
  },

  /**
   * 更新当前用户资料
   * @param {Object} profile - { nickname?, avatar_url? }
   * @returns {Promise<Object>} 更新后的 user 对象
   */
  async updateProfile(profile) {
    const res = await http.put('/auth/me', profile);
    http.setUser(res.user);
    // 失效用户信息缓存
    http.cache.invalidate('auth:me');
    return res.user;
  },

  /**
   * 是否已登录 (仅检查本地 token 是否存在)
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!http.getToken();
  },

  /**
   * 获取本地缓存的用户信息 (不发请求)
   * @returns {Object|null}
   */
  getLocalUser() {
    return http.getUser();
  },

  /**
   * 获取本地 token
   * @returns {string|null}
   */
  getToken() {
    return http.getToken();
  },
};

export { authService };
export default authService;
