# MPA First-Frame Flicker — Root Cause Audit & Permanent Fix

## 1. Symptoms

Course remained visually stable, while Today / Stats / Goals / Workbench / AI showed a first-frame transition before reaching the final shell. The visible problem was not limited to missing icons; navigation could paint a partial shell or a placeholder state before the page-specific content appeared.

## 2. Affected Pages And Build Matrix

| Page | Shell bootstrap | Main content paint | Initial page state |
| --- | --- | --- | --- |
| Today | Blocking script in `<head>`; synchronous render between sidebar and main | After `render()` | Static shell and task state |
| Stats | Same contract | After `render()` | Dashboard no longer starts hidden |
| Goals | Same contract | After `render()` | Static shell |
| Workbench | Same contract | After `render()` | Course is an in-page view selected by `?view=course` |
| AI | Same contract | After `render()` | Static shell |
| Course control | Same Workbench shell | In-page view toggle only | No whole-shell reveal |

## 3. Course Control Group

Course is `workbench.html?view=course`, not a separate MPA document. Its sidebar, topbar, and main frame are present in the initial HTML. Workbench JavaScript later switches `wb-view-*` visibility, but it does not hide and reveal the whole application shell. By contrast, Stats previously had `#statsDashboard hidden`, and the browser could paint the shell before JavaScript revealed the dashboard.

This is why Course felt stable while Stats and the newly added Today flow exposed unstable first paint contracts.

## 4. Root Causes

1. `shellBootstrap.js` was loaded between `<aside class="sidebar">` and `<main class="main">`. Loading it there blocked parsing after the sidebar and could allow a sidebar-only frame to become the first paint.
2. Stats used `#statsDashboard hidden`, then revealed it after JavaScript rendered. That created a second meaningful render even though `app-booting` had been removed.
3. `today.html` was missing from the Vite MPA input. In the production bundle, `/today.html` fell through to the SPA fallback and the landing page redirected to Workbench, so the Today page contract did not exist in production.
4. Vite emitted the HTML reference to `js/shellBootstrap.js` but did not emit the non-module script itself, so the production bundle depended on a missing asset.

## 5. Why Commit `8306a35` Was Insufficient

`8306a35` correctly removed the `app-booting` visibility gate and made the shell bootstrap synchronous. That removed one artificial reveal layer. However, it did not remove the source order problem: a blocking script after the sidebar could still make the sidebar the first painted region. It also did not address Stats' hidden dashboard, Today's missing production entry, or the missing production bootstrap asset.

## 6. Final Architecture

The shell now follows one parse and paint contract:

```text
head: load shellBootstrap.js synchronously
body: static sidebar markup
after sidebar: cgShellBootstrap.render()
body: static main content
page module: load business data and update state
```

`shellBootstrap.js` remains a synchronous IIFE. It reads only the account mirror in `localStorage`, updates shell text, exposes `cgShellBootstrap.render()`, does not read business data, does not touch the network, and does not wait for `DOMContentLoaded`.

Stats now starts with a visible dashboard and deterministic zero-value overview cards. `pages/stats.js` no longer waits for an extra paint before the initial render path. Page JS can still update values after analytics run, but the first paint has a complete, valid shell instead of a hidden or partial state.

## 7. Production Build Contract

`vite.config.js` now registers `today.html` in the MPA input and emits `js/shellBootstrap.js` as a build asset. The regression test reads the Vite config so all five dashboard pages and the synchronous bootstrap asset remain part of the production contract.

## 8. Browser Evidence

The production bundle was served with `vite preview` and checked in real Chromium-based browser sessions.

- Viewports: `1920x1080` and `375x812`.
- Pages: Today, Stats, Goals, Workbench Course view, AI.
- Cold-load checks: 10.
- Warm-navigation checks: 10.
- Shell/sidebar/main/user checks: 20 / 20 PASS.
- Console/page errors: 0.
- Horizontal overflow failures: 0.
- `app-booting`: absent in every check.

Cold-load capture names are under `tmp-mpa-dompaint/`, for example:

- `desktop-today-dompaint.png`
- `desktop-stats-dompaint.png`
- `mobile-today-dompaint.png`

The Stats DOM-paint screenshot already shows the final shell, active navigation, user name, week label, and zero-value overview cards. The Stats settled screenshot has the same visible frame. Today DOM paint likewise shows the complete Today shell instead of the landing-page fallback.

## 9. Warm Navigation Evidence

The production browser run covered:

- Stats → Today
- Today → Goals
- Goals → Workbench Course
- Workbench Course → Today
- Today → Stats

Both desktop and mobile completed the same five routes with the sidebar/main shell, correct navigation state, no overflow, and no console or page errors.

## 10. Tests And Regression

- Frontend: 54 files, 588 tests, all passing.
- Backend: 30 suites, 93 tests, all passing.
- Production build: PASS.
- `git diff --check`: PASS.

`tests/dashboardRenderStability.test.js` now enforces:

- `shellBootstrap.js` is loaded before the sidebar.
- `cgShellBootstrap.render()` runs after the sidebar and before main.
- Stats does not start hidden.
- Stats has a deterministic first-paint overview shell.
- Today, Stats, Goals, Workbench, and AI are registered in the production MPA build.
- `js/shellBootstrap.js` is emitted for production.

## 11. Remaining Risks

Slow 3G / Fast 3G were not re-measured. The architecture blocks HTML parsing on the tiny synchronous shell script, but the project still lacks a reliable automated network-throttling harness. Business data may still update after first paint when analytics complete; this is expected state hydration, not a whole-shell reveal.

## 12. Final Status

READY_FOR_INDEPENDENT_REAUDIT
