# Workbench Pro UI Implementation Plan

## 1. Current Contract

The rebuild keeps the existing native HTML/CSS/JS stack and all current data bindings.

### Preserved DOM contracts

| Area | Preserved IDs / classes |
|---|---|
| Navigation | `.sidebar`, `.nav-item`, `data-nav`, `.mobile-tabbar` |
| Topbar | `greetWord`, `welcomeName`, `welcomeDate`, `welcomeDay`, `welcomeStreak`, `focusChip`, `focusChipTime`, `bellBtn`, `bellCount`, `newBtn` |
| Today plan | `planStatus`, `planDone`, `planTotal`, `planEmpty`, `todayNext`, `todayNextText`, `taskPanel`, `taskList` |
| Course | `courseStatus`, `courseEmpty`, `courseBody`, `courseCount`, `courseAvg`, `coursePanel`, `courseList` |
| Reading | `readStatus`, `readBooks`, `readPages`, `bookPanel`, `bookList` |
| English | `englishStatus`, `englishCount`, `englishMinutes`, `englishPanel`, `englishList` |
| Focus | `focusStatus`, `focusCount`, `focusMinutes`, `focusPanel`, `focusList`, focus timer modal IDs |
| Exercise | `sportStatus`, `sportCount`, `sportCal`, `sportTip`, `sportPanel`, `sportList` |
| Growth data | `growthBooks`, `growthPages`, `growthRate`, `growthFocus`, `growthStudy`, `growthStreak` and matching progress bars |
| Local insight | `wbInsightList`, `wbInsightEmpty` |

No store schema, sync protocol, analytics API, route, authentication flow, or AI request flow is changed.

## 2. Layout Mapping

### Global shell

| Reference area | Implementation |
|---|---|
| Left navigation | Existing `.sidebar` becomes a 220px translucent warm-white rail with brand block, six navigation entries, user block, and motto. |
| Center work area | Existing `main.main` becomes the scrollable center column. |
| Right AI rail | New semantic `aside.ai-rail` is added only on desktop and collapses on tablet/mobile. |
| Page background | Light warm `#F8F6F1` base with original CSS-only sunrise and mountain gradient layers. |

### Center modules

| Reference module | Existing DOM mapping |
|---|---|
| Hero | `.topbar` is transformed into a sunrise banner; greeting/date actions remain live. |
| Today progress / task card | Existing `.hero-card` and `taskPanel` are styled as the first white glass card. |
| Course card | Existing course `.func-card` and `courseList` become the course module. |
| Reading card | Existing reading `.func-card` and `bookList` remain in the dashboard grid. |
| English card | Existing English `.func-card` and `englishList` remain in the dashboard grid. |
| Focus card | Existing focus `.func-card`, records, and timer modal remain in the dashboard grid. |
| Exercise card | Existing exercise `.func-card` and `sportList` remain in the dashboard grid. |
| Statistics | Existing `.data-section` is styled as the trend/personal-best card. |
| Insight card | Existing `.cg-insight` is styled as the local “today discovery” card. |

No module is deleted. The existing modals remain hidden until opened.

## 3. Visual Implementation

- Add `assets/workbench-pro.css` as an isolated visual override layer.
- Add `class="wb-pro"` to `workbench.html`’s `body`.
- Scope every override under `.wb-pro` so other pages are unaffected.
- Use existing variables where possible and define Pro-only tokens for warm surfaces, sunrise gradients, glass cards, and soft shadows.
- Use CSS-only sunrise/mountain art and iconography instead of the supplied bitmap illustration.
- Use cards with 24px radii, soft two-layer shadows, translucent white surfaces, restrained amber/teal/sky accents, and subtle hover elevation.
- Keep all real data values dynamic. Do not add fake tasks, courses, percentages, focus durations, or AI claims.

## 4. Interaction And Responsive Rules

- Desktop: 220px sidebar + fluid center + 320px AI rail.
- <=1280px: AI rail becomes a normal card after the dashboard content.
- <=860px: sidebar collapses into the existing mobile navigation; center and AI content remain single-column.
- Preserve focus visibility, modal stacking, expanded panels, and touch targets.

## 5. Validation

1. `npm test`
2. `npm run build`
3. Build artifact check for the Pro stylesheet, PWA files, and no localhost API leak.
4. Manual DOM smoke check that the existing dashboard IDs remain present.
