'use strict';

const AUTH_PAGES = new Set([
  'workbench.html',
  'today.html',
  'goals.html',
  'stats.html',
  'ai.html',
]);

export function safeRelativeTarget(target) {
  if (typeof target !== 'string' || !target.trim()) return '';
  try {
    const url = new URL(target, window.location.href);
    if (url.origin !== window.location.origin) return '';
    const page = url.pathname.split('/').pop();
    if (!AUTH_PAGES.has(page)) return '';
    const query = url.searchParams.toString();
    return query ? `${page}?${query}` : page;
  } catch (_) {
    return '';
  }
}

export function homeAuthHref(target) {
  const currentTarget = target || `${window.location.pathname.split('/').pop()}${window.location.search}`;
  const safeTarget = safeRelativeTarget(currentTarget);
  const params = new URLSearchParams({ auth: 'login' });
  if (safeTarget) params.set('next', safeTarget);
  return `index.html?${params.toString()}`;
}
