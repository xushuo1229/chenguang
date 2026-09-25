import { defineConfig } from '@playwright/test'
import { fileURLToPath, URL } from 'node:url'

const runDir = process.env.TEST_WEB_RUN_DIR
const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
// CI installs Playwright's pinned chromium (`npx playwright install
// chromium`); local runs reuse the system Edge so no browser download is
// needed. Override with TEST_WEB_CHANNEL when needed.
const browserChannel =
  process.env.TEST_WEB_CHANNEL ?? (process.env.CI ? '' : 'msedge')
const browserUse = browserChannel ? { channel: browserChannel } : {}

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 30000,
  reporter: runDir
    ? [
        ['json', { outputFile: `${runDir}/playwright-results.json` }],
        ['html', { outputFolder: `${runDir}/html`, open: 'never' }],
      ]
    : [['list']],
  output: runDir ? `${runDir}/artifacts` : '../../test-results/artifacts',
  use: {
    baseURL: 'http://localhost:5174/',
    ...browserUse,
    headless: true,
    trace: 'on-failure',
    video: 'on',
    screenshot: 'on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...browserUse },
    },
  ],
  webServer: {
    // Shallow node launcher (build then preview). Do NOT replace with
    // `npm run ... && ...`: nested cmd/npm trees hang Playwright on Windows.
    command: 'node scripts/test-web-server.mjs',
    cwd: projectRoot,
    url: 'http://localhost:5174/',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
})
