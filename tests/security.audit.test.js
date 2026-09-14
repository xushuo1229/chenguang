import { expect, test } from 'vitest';
import aiPageSrc from '../pages/ai.js?raw';
import routesIndexSrc from '../backend/src/routes/index.js?raw';
import serviceWorkerSrc from '../service-worker.js?raw';
import serviceWorkerRegistrationSrc from '../js/serviceWorkerRegistration.js?raw';

test('前端禁用动态执行与 document.write', () => {
  expect(aiPageSrc).not.toMatch(/\beval\s*\(/);
  expect(aiPageSrc).not.toMatch(/new\s+Function\s*\(/);
  expect(aiPageSrc).not.toMatch(/document\s*\.\s*write\s*\(/);
});

test('AI 页面不把不可信内容写入非空 innerHTML', () => {
  const assignments = aiPageSrc.match(/\.innerHTML\s*=\s*(?!=)[^;]+/g) || [];
  expect(assignments.length).toBeGreaterThan(0);
  for (const assignment of assignments) {
    expect(assignment.trim()).toMatch(/\.innerHTML\s*=\s*''/);
  }
});

test('同步、AI、课表导入路由都必须先通过 JWT 鉴权', () => {
  expect(routesIndexSrc).toMatch(/router\.get\('\/data',\s*authRequired,\s*syncCtrl\.getData\)/);
  expect(routesIndexSrc).toMatch(/router\.put\('\/data',\s*authRequired,\s*writeLimiter,\s*syncCtrl\.saveData\)/);
  expect(routesIndexSrc).toMatch(/router\.use\('\/ai',\s*ai\)/);
  expect(routesIndexSrc).toMatch(/router\.use\('\/course',\s*require\('\.\/scheduleImport'\)\)/);
});

test('Service Worker 不缓存 API，生产注册走 service-worker.js', () => {
  expect(serviceWorkerSrc).toMatch(/url\.pathname\.startsWith\('\/api\/'\)\)\s*return;/);
  expect(serviceWorkerRegistrationSrc).toMatch(/navigator\.serviceWorker\.register\('\/service-worker\.js'\)/);
});
