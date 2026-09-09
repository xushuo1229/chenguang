/**
 * ============================================================
 * 晨光自律台 · 资源懒加载工具集
 * ------------------------------------------------------------
 * 1. lazyImages()  — 图片懒加载 (IntersectionObserver)
 * 2. lazyModule()  — ES 模块按需加载 (dynamic import)
 * 3. preloadImage() — 图片预加载 (hover/visible 时预取)
 *
 * 使用:
 *   <img data-src="avatar.jpg" class="lazy">
 *   lazyImages(); // 自动将 data-src → src
 * ============================================================ */

/**
 * 图片懒加载
 * 将所有 [data-src] 元素的 data-src 在进入视口时复制到 src
 * @param {string} [selector='img[data-src]']
 */
export function lazyImages(selector = 'img[data-src]') {
  const images = document.querySelectorAll(selector);
  if (images.length === 0) return;

  // 不支持 IntersectionObserver 时直接全部加载
  if (!('IntersectionObserver' in window)) {
    images.forEach((img) => {
      if (img.dataset.src) img.src = img.dataset.src;
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
        obs.unobserve(img);
      });
    },
    { rootMargin: '200px 0px', threshold: 0.01 }
  );

  images.forEach((img) => observer.observe(img));
}

/**
 * ES 模块按需加载
 * @param {Function} importFn - () => import('./module.js')
 * @returns {Promise<Module>}
 */
const _moduleCache = new Map();

export function lazyModule(importFn) {
  const key = importFn.toString();
  if (_moduleCache.has(key)) return _moduleCache.get(key);

  const promise = importFn().catch((err) => {
    _moduleCache.delete(key); // 失败后允许重试
    throw err;
  });

  _moduleCache.set(key, promise);
  return promise;
}

/**
 * 图片预加载 (hover 时预取头像等)
 * @param {string} url
 */
export function preloadImage(url) {
  if (!url) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * 初始化所有懒加载 (页面 DOMContentLoaded 后调用)
 */
export function initLazyLoading() {
  lazyImages();
}

export default { lazyImages, lazyModule, preloadImage, initLazyLoading };
