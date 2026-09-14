# XINGZHIXING UI Reconstruction Report

## Implementation strategy

The migration uses an additive design layer instead of a framework rewrite. Every application page keeps its existing DOM contracts, modules, identifiers, and behavior. `assets/xingzhixing.css` loads after the legacy theme files and uses `body[data-brand="xingzhixing"]` to establish the new product surface while retaining compatibility with existing component names.

This approach allows the whole product to move to one brand without changing:

- route behavior,
- form logic,
- local data ownership,
- sync revision semantics,
- chart rendering,
- AI context construction,
- authentication, or
- accessibility behavior.

## Page reconstruction

| Page | Reconstruction focus |
| --- | --- |
| `login.html` | Dark AI brand pane, new logo, “理解自己，持续成长,” and assistant illustration |
| `index.html` | New AI OS hero, updated module/Coach/growth-path illustrations, XINGZHIXING footer |
| `workbench.html` | New icon, dashboard tokens, neutral surfaces, blue primary actions, AI coach rail |
| `stats.html` | Data-first light system with growth/accent gradients and first-render stability |
| `goals.html` | Growth system framing with calm cards and action-oriented primary controls |
| `ai.html` | Context-first coach layout, AI purple/blue semantics, stable topbar and chat frame |

## Layout stability

The rebuild also resolves navigation and first-paint flicker:

1. Dashboard scrollbars reserve stable space.
2. The Stats dashboard is hidden until its first complete render.
3. AI Coach topbar height is fixed.
4. Entrance animation is disabled on dashboard shells.
5. Expensive backdrop filtering is removed on first paint.

These changes were checked with headless Chrome layout-shift observations across Goals, Stats, and AI Coach.
