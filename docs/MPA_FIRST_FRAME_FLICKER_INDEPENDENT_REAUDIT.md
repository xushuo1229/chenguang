# MPA First-Frame Flicker Independent Re-Audit

## 1. Audit Scope

This is a read-only independent re-audit of commit `22dbe17` (`fix: eliminate MPA first-frame flicker`). The reviewer verified the commit from source, tests, production build output, and real Chromium-based browser evidence. No production code, test code, configuration, or existing documentation was changed. The only file created by this audit is this report.

Audit questions:

- Are the four previously identified risks actually closed?
- Does the production MPA contract work for Today?
- Are the shell and Chart.js assets emitted and loaded?
- Does Stats avoid a hidden dashboard reveal?
- Do cold load, hard refresh, warm navigation, desktop, and mobile behave without regressions?

## 2. Baseline

- Audited commit: `22dbe17 fix: eliminate MPA first-frame flicker`.
- Previous relevant fix: `8306a35`.
- Commit parent: `4f21acc feat: add knowledge extraction pipeline`.
- Commit diff scope:
  - `ai.html`, `goals.html`, `today.html`, `workbench.html`, `stats.html`
  - `pages/stats.js`
  - `vite.config.js`
  - `tests/dashboardRenderStability.test.js`
  - `tests/deployment.build.test.js`
  - `docs/MPA_FIRST_FRAME_FLICKER_ROOT_CAUSE.md`
  - Commit stat: 10 files changed, 177 insertions, 27 deletions.

## 3. Workspace Boundary

At audit start, the working tree already contained many unrelated documentation modifications and temporary browser/profile directories from other tasks. During the same period, another active task added further modifications in backend/course extraction files and additional documentation. These workspace changes are external to commit `22dbe17` and were not reviewed as part of the first-frame fix.

The auditor did not reset, clean, checkout, format, or delete any workspace content. New audit evidence is retained in the untracked directory:

```text
tmp-mpa-independent-reaudit/
```

This directory contains 36-case JSON results, cold-load screenshots, hard-refresh screenshots, warm-navigation screenshots, and an additional Stats empty-data boundary test.

## 4. Root Cause Verification

### 4.1 Shell bootstrap order — PASS

Source inspection confirms the required contract:

```text
head
  ↓
<script src="js/shellBootstrap.js"></script>
  ↓
<aside class="sidebar">
  ↓
<script>cgShellBootstrap.render();</script>
  ↓
<main class="main">
  ↓
page module
```

Evidence:

- `ai.html`: head script at line 508; render call at line 540; main follows.
- `goals.html`: head script at line 171; render call at line 203; main follows.
- `stats.html`: head script at line 227; render call at line 259; main follows.
- `today.html`: head script at line 222; render call at line 254; main follows.
- `workbench.html`: head script at line 1135; render call at line 1167; main follows.
- `js/shellBootstrap.js` remains a synchronous IIFE; it reads only the account mirror, exposes `cgShellBootstrap.render()`, and does not wait for `DOMContentLoaded`.
- The commit removed the old blocking `<script src="js/shellBootstrap.js"></script>` between sidebar and main in all five pages.
- Real browser checks returned `bootstrapLoaded: true`, sidebar present, main present, correct user, and no horizontal overflow in all 36 cases.

### 4.2 Previous `app-booting` mechanism — PASS

All source HTML pages and all 36 browser cases report `app-booting: false`. No new shell-wide visibility gate was introduced.

## 5. MPA Entry Verification

### Today MPA entry — PASS

Source evidence:

- `vite.config.js:148` contains `today: resolve(__dirname, 'today.html')`.
- `vite.config.js:183` registers `chenguangShellBootstrapAsset()`.
- `tests/dashboardRenderStability.test.js:67` protects Today and the bootstrap asset contract.

Production evidence:

- `npm run build` PASS.
- `dist/today.html` exists.
- `dist/today.html` contains the shell script and inline render call.
- Direct production URL `http://127.0.0.1:4175/today.html` rendered the Today page.
- Network audit recorded no document redirect.
- Desktop and mobile cold load, hard refresh, direct URL, and warm navigation all completed on Today.

## 6. Production Asset Verification

### Shell bootstrap asset — PASS

- `dist/js/shellBootstrap.js` exists.
- All five production dashboard HTML files contain exactly one reference to `/js/shellBootstrap.js`.
- All five production HTML files contain exactly one `cgShellBootstrap.render();` call after the sidebar.
- `dist/service-worker.js` contains `/js/shellBootstrap.js` in its real build asset list.
- Browser network audit recorded zero failed requests and zero document redirects.
- Every browser case had `cgShellBootstrap` loaded.

### Chart.js asset — PASS

Source and built asset evidence:

- Commit changed `pages/stats.js:58` from `assets/vendor/chart.umd.min.js` to `/vendor/chart.umd.min.js`.
- `dist/vendor/chart.umd.min.js` exists.
- `dist/service-worker.js` contains `/vendor/chart.umd.min.js`.
- The Stats browser result reported `chartScript: true`.
- Stats loaded one chart canvas after page JS hydration.
- Network audit recorded no Chart.js 404 and no console/page errors.

## 7. Stats Verification

### Stats normal data case — PASS

Production cold load at `1920x1080`:

- DOM-paint screenshot: `tmp-mpa-independent-reaudit/desktop-cold-stats-dompaint.png`.
- At DOM paint, the complete sidebar, user name `复审用户`, week label, active Stats navigation, and deterministic zero-value overview cards were visible.
- `#statsDashboard` was visible.
- First Paint / First Contentful Paint: 64 ms.
- Hard refresh result matched the cold-load visible state.
- Settled result retained the same shell and generated the chart.

The corresponding mobile DOM-paint screenshot also shows the complete Stats shell and overview cards without a hidden-to-visible dashboard transition.

### Stats empty-data boundary case — PASS

An additional cold load used an empty `chenguangData` object:

- DOM-paint screenshot: `tmp-mpa-independent-reaudit/desktop-cold-stats-empty-dompaint.png`.
- At DOM paint, Stats already showed the final empty state.
- `#statsDashboard` was hidden and `#statsEmpty` was visible.
- Settled state matched DOM paint.
- No console or page errors.

This confirms that the empty state does not produce an additional visible dashboard reveal.

## 8. Today Verification

Today production behavior — PASS:

- Direct production URL rendered `today.html`, not the landing-page SPA fallback.
- Desktop DOM paint shows complete sidebar, active Today navigation, Today header, four summary cards, input, and empty-task state.
- Mobile DOM paint shows the same stable Today shell.
- Hard refresh preserved the same state.
- Warm Course → Today also loaded Today directly.
- No redirect was observed in network events.

Evidence:

- `tmp-mpa-independent-reaudit/desktop-cold-today-dompaint.png`
- `tmp-mpa-independent-reaudit/mobile-cold-today-dompaint.png`
- `tmp-mpa-independent-reaudit/desktop-warm-course-to-today-dompaint.png`

## 9. Page Matrix

| Page / route | Direct load | Hard refresh | First-frame shell | Navigation | Result |
| --- | --- | --- | --- | --- | --- |
| Today | PASS | PASS | PASS | Course → Today PASS | PASS |
| Stats | PASS | PASS | PASS | Today → Stats PASS; Stats → Goals PASS; Stats → AI PASS | PASS |
| Goals | PASS | PASS | PASS | Stats → Goals PASS; Goals → Workbench PASS | PASS |
| Workbench | PASS | PASS | PASS | Goals → Workbench PASS | PASS |
| Course (`workbench.html?view=course`) | PASS | PASS | PASS | Workbench → Course PASS; Course → Today PASS | PASS |
| AI | PASS | PASS | PASS | Stats → AI PASS | PASS |

Course was correctly treated as an in-page Workbench view. Warm Workbench → Course changed `wb-view-course` to visible while preserving the surrounding shell. No separate Course MPA entry is required.

## 10. Cold Load

The real browser audit executed 12 cold-load cases: six targets at `1920x1080` and six targets at `375x812`.

All cases had:

- sidebar present
- main present
- correct shell user
- correct active navigation
- no `app-booting`
- no horizontal overflow
- `cgShellBootstrap` loaded
- no console/page errors
- no failed network request

Paint timing remained low in the measured production localhost environment: first paint commonly ranged from 48–176 ms. These values are evidence for this environment, not a universal performance claim.

Representative screenshots:

- `desktop-cold-today-dompaint.png`
- `desktop-cold-stats-dompaint.png`
- `desktop-cold-goals-dompaint.png`
- `desktop-cold-workbench-view=course-dompaint.png`
- `desktop-cold-ai-dompaint.png`
- `mobile-cold-today-dompaint.png`
- `mobile-cold-stats-dompaint.png`

## 11. Warm Navigation

The real browser audit executed 12 warm-navigation cases: the six required routes at each viewport.

| Route | Desktop DOM paint | Mobile DOM paint |
| --- | --- | --- |
| Stats → Goals | PASS | PASS |
| Goals → Workbench | PASS | PASS |
| Workbench → Course | PASS | PASS |
| Course → Today | PASS | PASS |
| Today → Stats | PASS | PASS |
| Stats → AI | PASS | PASS |

All warm cases had sidebar/main present, correct active navigation, no overflow, no console/page errors, and no failed network requests. The captured DOM-paint screenshots do not show an old page, blank page, sidebar-only page, or hidden main intermediate state.

## 12. Desktop / Mobile

Desktop `1920x1080` — PASS:

- 18 cases passed: 6 cold loads, 6 hard refreshes, 6 warm navigations.
- Shell, navigation, overflow, and console checks all passed.

Mobile `375x812` — PASS:

- 18 cases passed: 6 cold loads, 6 hard refreshes, 6 warm navigations.
- Shell, navigation, overflow, and console checks all passed.

## 13. Console / Network

The audit intentionally blocked service workers in the browser context to avoid stale PWA cache influencing the production build audit. It also fulfilled `/api/**` responses locally so frontend rendering did not depend on a live backend.

Results:

- Console errors: 0
- Page errors: 0
- HTTP 4xx/5xx responses: 0
- Failed JS/CSS/vendor requests: 0
- Unexpected document redirects: 0
- Shell bootstrap MIME/load failure: none

Warnings were not treated as errors. The audit did not observe a warning that affected shell rendering or asset loading.

## 14. Regression Tests

Executed on the audited workspace:

```text
npm test
npm run build
cd backend && npm test
```

Results:

- Frontend: PASS, 54 files / 588 tests.
- Production build: PASS.
- Backend: PASS, 30 suites / 93 tests.

The frontend audit also confirmed `dashboardRenderStability.test.js` has 9 tests passing and `deployment.build.test.js` has 4 tests passing.

## 15. Production Build

`npm run build` PASS.

Verified build artifacts:

| Artifact | Present | Referenced by production HTML | In service-worker asset list |
| --- | --- | --- | --- |
| `dist/today.html` | YES | YES | YES |
| `dist/stats.html` | YES | YES | YES |
| `dist/goals.html` | YES | YES | YES |
| `dist/workbench.html` | YES | YES | YES |
| `dist/ai.html` | YES | YES | YES |
| `dist/js/shellBootstrap.js` | YES | YES | YES |
| `dist/vendor/chart.umd.min.js` | YES | Loaded by Stats | YES |

## 16. Findings

No P0, P1, or P2 finding was found.

| Severity | Finding | Evidence | Status |
| --- | --- | --- | --- |
| P0 | None found | No failed page load, no data-loss path, no production blocker | Closed |
| P1 | None found | All four first-frame root causes closed | Closed |
| P2 | None found | 36 browser cases passed without repeatable regression | Closed |
| P3 | None found | No visual/layout or edge-case defect observed | Closed |
| P4 | Local API responses were mocked for frontend browser audit | `tmp-mpa-independent-reaudit/results.json`; backend integration covered separately by backend tests | Informational |

## 17. Risk Assessment

Low risk. The commit follows the existing MPA architecture, does not introduce a router, and keeps shell initialization synchronous and independent of business data. The automated tests now protect the HTML source order, Stats initial shell, Today MPA registration, and bootstrap production asset.

Remaining risks:

- Real-device network conditions were not measured; this audit used localhost production preview.
- Future removal of `today.html` or the Vite asset plugin would regress production; both are protected by tests but require CI to enforce them.

## 18. Final Verdict

All required root-cause checks, production asset checks, MPA entry checks, browser cold-load checks, warm-navigation checks, desktop/mobile checks, console/network checks, frontend/backend tests, and production build checks passed.

FINAL VERDICT: READY
