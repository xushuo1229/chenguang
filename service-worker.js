/**
 * ============================================================
 * 知行 · Service Worker
 * ============================================================
 *
 * Service Worker 是什么？
 *   Service Worker 是浏览器在「后台」运行的一个 JavaScript 脚本
 *   它独立于网页运行，可以：
 *     1. 拦截网络请求 → 实现资源缓存（离线也能访问）
 *     2. 推送通知
 *     3. 后台同步数据
 *
 * 本文件实现了两种缓存策略：
 *   1. Network-First（网络优先）
 *      - 先尝试从网络获取最新资源
 *      - 网络失败时，回退到本地缓存
 *      - 适用：HTML 页面、核心 JS/CSS（确保用户看到最新内容）
 *
 *   2. Stale-While-Revalidate（先返回缓存，后台更新）
 *      - 立即返回缓存的旧版本（用户不用等）
 *      - 同时在后台请求新版本并更新缓存
 *      - 适用：CDN 上的第三方库（如 Chart.js），变化不频繁
 *
 * 缓存版本管理：
 *   - CACHE_VERSION 每次发版递增（如 cgl-v10 → cgl-v11）
 *   - 旧版本的缓存会在 Service Worker 激活时自动删除
 *
 * ============================================================
 */

// ==================== 构建注入的部署清单 ====================
// 生产构建会把 dist 内真实文件写入全局变量；开发环境保持空清单。
const BUILD_ID = globalThis.__CHENGUANG_BUILD_ID__ || 'dev';
const CACHE_VERSION = `cgl-${BUILD_ID}`;

// 两个缓存空间：
//   - CACHE_STATIC：存放预缓存的核心静态资源（构建时确定）
//   - CACHE_RUNTIME：存放运行时动态缓存的资源（如网络请求的响应）
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = globalThis.__CHENGUANG_PRECACHE_URLS__ || [];

// Vite 产物路径包含内容 hash，可作为不可变资源安全使用 cache-first。
const HASHED_ASSET_PATTERN = /^\/assets\/[^?]*-[a-zA-Z0-9_-]{8,}\.(?:js|css|png|jpe?g|svg|gif|webp|avif|woff2?|ttf|eot)$/;

// ==================== CDN 域名列表 ====================
// 来自这些域名的资源使用 Stale-While-Revalidate 策略
// CDN 资源变化不频繁，可以先返回旧缓存，后台静默更新
const CDN_HOSTS = [
  'cdn.jsdelivr.net',     // jsDelivr CDN
  'unpkg.com',            // unpkg CDN
  'cdnjs.cloudflare.com', // cdnjs CDN
  'esm.sh',               // ES Module CDN
];

// ============================================================
// 1. Install 事件 — 预缓存核心资源
// ============================================================
// 当 Service Worker 首次安装时触发（浏览器第一次加载页面时）
// 负责下载并缓存 PRECACHE_URLS 中列出的所有文件
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (PRECACHE_URLS.length) {
      const cache = await caches.open(CACHE_STATIC);
      await cache.addAll(PRECACHE_URLS);
    }
    await self.skipWaiting();
  })().catch((err) => console.warn('[SW] 预缓存失败:', err)));
});

// ============================================================
// 2. Activate 事件 — 清理旧版本缓存
// ============================================================
// Service Worker 激活时触发，负责删除上一个版本的缓存
// 比如从 cgl-v10 升级到 cgl-v11 时，删除所有 cgl-v10 的缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    // caches.keys() 获取所有缓存空间的名称
    caches.keys()
      .then((keys) => Promise.all(
        // 过滤出不是当前版本的缓存（如 cgl-v10-static）
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))  // 删除旧缓存
      ))
      .then(() => self.clients.claim())  // claim()：立即接管所有打开的页面，不用等刷新
  );
});

// ============================================================
// 3. Fetch 事件 — 请求拦截 + 缓存策略
// ============================================================
// 每次页面发起网络请求时，浏览器都会触发 fetch 事件
// Service Worker 可以拦截这个请求，决定从缓存还是网络获取资源
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只处理 GET 请求（POST/PUT/DELETE 等不拦截）
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 不缓存 API 请求（/api/ 开头的），因为 API 返回的是实时数据
  // 比如获取待办列表、打卡等操作，每次都应该是最新数据
  if (url.pathname.startsWith('/api/')) return;

  // 不缓存 WebSocket 连接（实时通信）
  if (request.url.startsWith('wss://') || request.url.startsWith('ws://')) return;

  // 根据请求类型，选择不同的缓存策略：

  // HTML 页面 → Network-First（网络优先）
  // 原因：页面内容经常更新，要确保用户看到最新版本
  // 离线时回退到缓存，至少能打开页面
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // CDN 第三方资源 → Stale-While-Revalidate（缓存优先，后台更新）
  // 原因：第三方库（如 Chart.js）版本稳定，变化不频繁
  // 先返回缓存让用户不等待，后台静默更新
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (
    url.origin === self.location.origin &&
    !request.headers.has('range') &&
    HASHED_ASSET_PATTERN.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 其他资源（JS/CSS/图片等） → Network-First
  // 确保用户获取最新版本的代码
  event.respondWith(networkFirst(request));
});

// ============================================================
// 缓存策略实现
// ============================================================

/**
 * Network-First（网络优先策略）
 * 工作流程：
 *   1. 先尝试从网络获取资源
 *   2. 如果网络成功，把响应存入缓存（下次可以用）
 *   3. 如果网络失败，从缓存中查找之前保存的版本
 *   4. 如果缓存也没有，返回离线提示页面
 *
 * cache: 'no-cache' 的作用：
 *   强制浏览器与服务器协商（发送 If-None-Match 等条件请求）
 *   如果服务器说「资源没变」，返回 304（很小），浏览器用本地缓存
 *   防止浏览器 HTTP 缓存中的旧资源被错误地当作「网络最新」缓存进 SW
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (response.ok) {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, response.clone());
    }
    if (response.ok || response.type === 'opaqueredirect') return response;
    const cached = await caches.match(request);
    return cached || response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // 离线 + 无缓存 → 返回离线占位
    return new Response('离线模式, 资源不可用', { status: 503 });
  }
}

/**
 * Cache-First（缓存优先策略）
 *
 * 仅用于同源带内容 hash 的静态产物。内容变化时 URL 必然变化，
 * 因此缓存命中可以跳过网络协商，同时不会让用户拿到旧版本。
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request, { cache: 'no-cache' });
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Stale-While-Revalidate（先返回缓存，后台更新策略）
 * 工作流程：
 *   1. 先从缓存中查找是否有之前保存的版本
 *   2. 立即返回缓存版本给用户（用户不用等待网络加载）
 *   3. 同时在后台发起网络请求获取最新版本
 *   4. 网络请求成功后，用新版本更新缓存（下次访问就是最新的了）
 *   5. 如果网络失败，就返回缓存版本（如果有的话）
 *
 * 适用场景：CDN 上的第三方库（如 Chart.js），版本稳定，偶尔更新
 * 优点：用户体验好（立即显示），同时保证缓存最终是最新的
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached); // 网络失败时返回缓存 (如有)

  return cached || fetchPromise;
}
