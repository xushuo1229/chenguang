// Playwright webServer entry point for test-web acceptance runs.
// Builds the app, then serves the production preview as a direct child.
// We deliberately avoid `npm run ... && ...`: under Windows that spawns a
// nested cmd/npm tree whose inherited handles prevent Playwright from tearing
// the web server down (the test process then hangs). A two-process node tree
// is killed cleanly by Playwright's process-group termination.
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')

// Acceptance runs exercise the UI through MSW; embed the flag into the
// production build started below.
process.env.VITE_MOCK_ENABLED = 'true'

function run(args) {
  return spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
}

const build = run([join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'])
if (build.status !== 0) process.exit(build.status ?? 1)

const buildVite = run([vite, 'build'])
if (buildVite.status !== 0) process.exit(buildVite.status ?? 1)

const preview = run([vite, 'preview', '--port', '5174', '--strictPort'])
process.exit(preview.status ?? 0)
