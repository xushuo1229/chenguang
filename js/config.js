/**
 * ============================================================
 * 晨光自律台 · 前端配置
 * ------------------------------------------------------------
 * 根据当前域名自动切换 API 地址:
 *   - localhost / 127.0.0.1 → 本地开发服务器
 *   - 其他域名 (GitHub Pages) → Vercel 生产 API
 *
 * 也可通过页面 <meta name="api-base" content="https://xxx/api"> 覆盖
 * ============================================================
 *
 * ========== 文件在架构中的角色 ==========
 *  本文件是「环境配置中心」，负责根据当前运行环境（开发/生产）
 *  自动选择正确的服务器地址和 Supabase 配置。
 *
 *  依赖关系：
 *    - 本文件不依赖其他 JS 模块
 *    - 被 apiClient.js、sync.js 等文件导入使用
 *    - 页面通过 meta 标签可以覆盖配置
 *
 * ========== 核心概念解释 ==========
 *  - 环境检测：判断当前是在本地开发还是在生产环境
 *  - API Base URL：后端服务器的基础地址，所有请求都从这里发出
 *  - Supabase：一个提供数据库和实时订阅服务的云平台
 * ============================================================
 */

/**
 * getApiBaseUrl() —— 获取 API 服务器的基础地址
 *
 * 【作用】根据当前运行环境，返回正确的后端服务器地址。
 *
 * 【优先级（从高到低）】
 *   1. 页面 meta 标签：如果 HTML 中有
 *      <meta name="api-base" content="...">
 *      则使用 meta 标签中指定的地址（用于自定义部署）
 *   2. 全局变量 window.__CGL_API_BASE__：如果定义了这个变量，使用它的值
 *      （用于临时修改端口等场景）
 *   3. 自动判断：根据域名自动选择开发/生产地址
 *
 * 【环境检测逻辑】
 *   - hostname 是 'localhost' 或 '127.0.0.1' → 本地开发环境
 *     → 使用 http://localhost:3000/api
 *   - 其他域名（如 GitHub Pages）→ 生产环境
 *     → 使用 https://chenguang-api.vercel.app/api
 *
 * 【为什么需要自动切换？】
 *   开发时后端跑在本地（localhost:3000），
 *   部署到 GitHub Pages 后需要连接真正的后端（Vercel）。
 *   如果每次切换环境都要手动改代码，容易出错且不方便。
 *
 * 【HTTP vs HTTPS】
 *   - 本地开发用 http://（因为本地没有 SSL 证书）
 *   - 生产环境用 https://（浏览器要求的安全协议）
 *
 * 【返回值】API 基础地址字符串
 */
function getApiBaseUrl() {
  // 1. 优先读取页面 meta 标签 (用于自定义部署地址)
  const meta = document.querySelector('meta[name="api-base"]');
  if (meta && meta.content) return meta.content;

  // 2. 自动判断: 本地 vs 生产
  const host = window.location.hostname;

  // 本地开发
  if (host === 'localhost' || host === '127.0.0.1') {
    // 可通过 window.__CGL_API_BASE__ 覆盖 (如端口不是 3000)
    return window.__CGL_API_BASE__ || 'http://localhost:3000/api';
  }

  // 生产环境 - Vercel 后端 API
  return 'https://chenguang-api.vercel.app/api';
}

/**
 * API_BASE_URL - 导出的 API 基础地址
 *
 * 【作用】其他文件 import 这个变量就可以获得正确的 API 地址。
 * 【示例】import { API_BASE_URL } from './config.js';
 */
export const API_BASE_URL = getApiBaseUrl();

/**
 * ============================================================
 * Supabase Realtime 配置
 * ============================================================
 *
 * 【什么是 Supabase？】
 *   Supabase 是一个开源的 Firebase 替代品，提供：
 *   - PostgreSQL 数据库（存储数据）
 *   - Realtime 订阅（数据变化时实时推送通知）
 *   - 身份认证（用户登录注册）
 *   - 存储（文件上传下载）
 *
 * 【什么是 Realtime？】
 *   普通的 HTTP 请求是「请求-响应」模式：前端问一次，服务器答一次。
 *   Realtime 是「推送」模式：服务器数据变化时主动通知前端。
 *   比如：其他用户打卡了，你的排行榜页面能立即看到变化。
 *
 * 【什么是 anon key？】
 *   Supabase 的前端访问密钥，可以安全暴露给前端代码。
 *   它受 Row Level Security（行级安全）保护，
 *   用户只能访问自己有权限的数据。
 *   类似于「只能进自己房间的门禁卡」。
 *
 * 【如何获取？】
 *   Supabase Dashboard → Settings → API:
 *   - Project URL → SUPABASE_URL
 *   - anon public key → SUPABASE_ANON_KEY
 * ============================================================
 */
const SUPABASE_CONFIG = {
  // 本地开发: 替换为你的 Supabase 项目地址
  dev: {
    url: 'https://your-project-ref.supabase.co',
    anonKey: 'your-supabase-anon-key',
  },
  // 生产环境: 同一个 Supabase 项目 (anon key 安全)
  prod: {
    url: 'https://your-project-ref.supabase.co',
    anonKey: 'your-supabase-anon-key',
  },
};

/**
 * isDev() - 检查当前是否为本地开发环境
 *
 * 【原理】检查浏览器地址栏的域名是否为 localhost 或 127.0.0.1
 * 【返回值】true 表示本地开发环境
 */
function isDev() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * SUPABASE_URL - Supabase 项目地址
 *
 * 【作用】根据环境自动选择开发或生产的 Supabase 地址。
 * 【用途】初始化 Supabase 客户端时使用。
 */
export const SUPABASE_URL = isDev() ? SUPABASE_CONFIG.dev.url : SUPABASE_CONFIG.prod.url;

/**
 * SUPABASE_ANON_KEY - Supabase 前端访问密钥
 *
 * 【作用】根据环境自动选择开发或生产的密钥。
 * 【安全说明】这个 key 可以暴露给前端，受行级安全（RLS）保护。
 */
export const SUPABASE_ANON_KEY = isDev() ? SUPABASE_CONFIG.dev.anonKey : SUPABASE_CONFIG.prod.anonKey;

/**
 * Realtime 频道名（与后端 realtimeService 保持一致）
 *
 * 【什么是频道（Channel）？】
 *   Supabase Realtime 使用「频道」来区分不同的数据流。
 *   前端订阅某个频道，当这个频道有数据变化时就会收到通知。
 *   类似于收音机的频道：调到 FM 98.7 就只收到这个频率的广播。
 */
export const FEED_CHANNEL = 'chenguang-feed';
export const LEADERBOARD_CHANNEL = 'chenguang-leaderboard';

/**
 * 默认导出所有配置项
 *
 * 【使用方式】
 *   import config from './config.js';
 *   console.log(config.API_BASE_URL);
 */
export default { API_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY };
