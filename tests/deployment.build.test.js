import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const buildOutput = join(tmpdir(), `chenguang-deployment-build-${process.pid}`);

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) files.push(...listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

describe('production deployment artifacts', () => {
  let files = [];

  beforeAll(async () => {
    rmSync(buildOutput, { recursive: true, force: true });
    mkdirSync(buildOutput, { recursive: true });
    await execFileAsync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js'),
        'build',
        '--outDir',
        buildOutput,
        '--emptyOutDir'
      ],
      { cwd: process.cwd() }
    );
    files = listFiles(buildOutput);
  }, 30000);

  afterAll(() => {
    rmSync(buildOutput, { recursive: true, force: true });
  });

  test('manifest and service worker are emitted', () => {
    expect(existsSync(join(buildOutput, 'manifest.json'))).toBe(true);
    expect(existsSync(join(buildOutput, 'service-worker.js'))).toBe(true);
  });

  test('service worker uses built assets instead of source paths', () => {
    const source = readFileSync(join(buildOutput, 'service-worker.js'), 'utf8');
    const match = source.match(/globalThis\.__CHENGUANG_PRECACHE_URLS__\s*=\s*(\[[\s\S]*?\]);/);
    expect(match).toBeTruthy();
    const urls = JSON.parse(match[1]);

    expect(urls).toContain('/');
    expect(urls).toContain('/manifest.json');
    expect(urls.some((url) => url.startsWith('/workbench.html'))).toBe(true);
    expect(urls.some((url) => /^\/assets\/(sync|serviceWorkerRegistration)-.+\.css$/.test(url))).toBe(true);
    expect(urls.some((url) => /^\/assets\/workbench-.+\.js$/.test(url))).toBe(true);
    expect(urls).not.toContain('/js/store.js');
    expect(urls).not.toContain('/pages/workbench.js');
  });

  test('production artifacts do not contain the local API URL', () => {
    const offenders = files.filter((file) => {
      if (!/\.(html|js|css|json|svg)$/.test(file)) return false;
      return readFileSync(file, 'utf8').includes('localhost');
    });
    expect(offenders).toEqual([]);
  });

  test('manifest is linked from application pages', () => {
    for (const page of ['index.html', 'login.html', 'workbench.html', 'stats.html', 'ai.html', 'goals.html']) {
      const html = readFileSync(join(buildOutput, page), 'utf8');
      expect(html).toContain('<link rel="manifest" href="/manifest.json">');
    }
  });
});
