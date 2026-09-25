# test-web acceptance suite

Browser acceptance tests for the Zeno React workspace, following the
`test-web` skill workflow (confirmation-bound, evidence-producing).

## What it covers

`zeno-core-workflow.spec.mjs` verifies the core product flow:

- unauthenticated access redirects to `/login`;
- login renders the enterprise Dashboard (KPI cards, two Tremor charts, the
  task table) and keeps storage isolated — only `zeno_mock_session` is used,
  never `cg_token`, `cg_user` or `chenguangData`;
- Personal / General Agent conversations, evidence and modes;
- theme persistence across reload;
- the command palette (⌘K) can seed an Agent question;
- 390px mobile layout has no sidebar offset and the context rail collapses;
- mock scenarios: `empty` renders the task empty state, `loading` shows the
  skeleton first, `error` shows an alert with a working retry; all reversible.

## Run

The Playwright `webServer` builds the app and starts `vite preview` on port
5174 automatically:

```bash
npm run test:web
```

Skill runner (validates the confirmation record, hashes and evidence):

```bash
node ~/.codex/skills/test-web/scripts/run-case.mjs \
  --project "$(pwd)" --case zeno-core-workflow
```

Tests run against the system Edge browser (`channel: 'msedge'`), so no
Playwright browser download is needed locally. In CI (`CI` env set) the
channel switches to Playwright's pinned chromium — install it with
`npx playwright install --with-deps chromium` (the workflows do this).
Override with `TEST_WEB_CHANNEL`.

Two GitHub Actions workflows run the suite:

- `.github/workflows/react-workspace.yml`: every push/PR touching
  `frontend-react/` (fast feedback);
- `.github/workflows/deploy.yml`: the main-branch production quality gate.

Run artifacts (videos, traces, HTML reports, JSON results) are written under
`test-results/` and are gitignored.

## Notes

- The webServer command is `node scripts/test-web-server.mjs` on purpose.
  `npm run ... && ...` spawns nested cmd/npm trees on Windows whose inherited
  handles hang Playwright teardown; the launcher builds via `spawnSync` and
  runs preview in a shallow node tree.
- Scenarios are switched through `localStorage` key `zeno_mock_scenario`,
  see `src/mocks/scenario.ts`: `default` | `empty` | `loading` | `error`.
  They are test-only switches and are never read by the legacy MPA or
  CGStore.
