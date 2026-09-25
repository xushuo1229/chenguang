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
- the `empty` mock scenario renders the task empty state and is reversible.

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
Playwright browser download is needed. Run artifacts (videos, traces, HTML
reports, JSON results) are written under `test-results/` and are gitignored.

## Notes

- The webServer command is `node scripts/test-web-server.mjs` on purpose.
  `npm run ... && ...` spawns nested cmd/npm trees on Windows whose inherited
  handles hang Playwright teardown; the launcher builds via `spawnSync` and
  runs preview in a shallow node tree.
- The empty scenario is switched through `localStorage` key
  `zeno_mock_scenario` (`default` | `empty`), see `src/mocks/scenario.ts`.
  It is a test-only switch and is never read by the legacy MPA or CGStore.
