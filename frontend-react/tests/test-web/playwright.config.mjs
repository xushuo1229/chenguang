import { defineConfig } from '@playwright/test'

const runDir = process.env.TEST_WEB_RUN_DIR

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
    channel: 'msedge',
    headless: true,
    trace: 'on-failure',
    video: 'on',
    screenshot: 'on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { channel: 'msedge' },
    },
  ],
})
