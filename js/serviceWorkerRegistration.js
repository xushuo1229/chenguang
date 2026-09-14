'use strict';

const CACHE_PREFIX = 'cgl-';

function isSupported() {
  return 'serviceWorker' in navigator && location.protocol.startsWith('http');
}

async function removeDevelopmentServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) await registration.unregister();
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)));
    }
  } catch (error) {
    console.warn('[SW] 开发环境清理失败:', error);
  }
}

async function registerProductionServiceWorker() {
  try {
    await navigator.serviceWorker.register('/service-worker.js');
  } catch (error) {
    console.warn('[SW] 注册失败:', error);
  }
}

function bootstrap() {
  if (import.meta.env.DEV) {
    void removeDevelopmentServiceWorker();
    return;
  }
  void registerProductionServiceWorker();
}

export function setupServiceWorker() {
  if (!isSupported()) return;
  if (document.readyState === 'complete') {
    bootstrap();
    return;
  }
  window.addEventListener('load', bootstrap, { once: true });
}
