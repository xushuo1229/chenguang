# XINGZHIXING Design System

## Brand

知行 XINGZHIXING is an AI Personal Growth OS. The product language moves from “tracking self-discipline” to “understand yourself, act continuously, and evolve with feedback.”

The canonical expression is:

- Chinese: 知行
- English: XINGZHIXING
- Positioning: AI Personal Growth OS
- Core line: 理解自己，持续成长
- Philosophy: 知而后行，行而致远

## Visual principles

1. **Premium minimal** — generous whitespace, one clear primary action per region, and restrained shadows.
2. **Intelligent structure** — Linear-style grids make status, trends, risks, and next actions scannable.
3. **Companionable AI** — purple and blue signal analysis and coaching without pretending the AI can act for the user.
4. **Long-term growth** — green marks progress; charts emphasize trajectory and consistency instead of vanity totals.
5. **Calm performance** — pages paint in their final layout and avoid entrance animations that cause flicker.

## Color

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Ink | `--xz-ink` | `#0B1220` | Brand anchors and dark brand surfaces |
| Text | `--xz-slate` | `#0F172A` | Primary text |
| Accent | `--xz-accent` | `#38BDF8` | Primary actions, active navigation, key data |
| Accent deep | `--xz-accent-strong` | `#0284C7` | Hover, links, selected states |
| Growth | `--xz-growth` | `#34D399` | Completion, positive trends, growth paths |
| AI | `--xz-ai` | `#8B5CF6` | AI coach, insights, model-related surfaces |
| Background | `--xz-bg` | `#F8FAFC` | Application background |
| Surface | `--xz-surface` | `#FFFFFF` | Cards and navigation |
| Line | `--xz-line` | `#E2E8F0` | Hairline dividers and card edges |
| Muted text | `--xz-muted` | `#64748B` | Secondary copy |

Legacy amber tokens are remapped by `assets/xingzhixing.css`; hardcoded legacy amber surfaces are neutralized in the final migration layer so all six pages share one brand without renaming historical class names.

## Logo system

- `/brand/logo.svg` — primary lockup for light surfaces.
- `/brand/logo-dark.svg` — dark-surface lockup.
- `/brand/logo-icon.svg` — app, dashboard, and avatar mark.
- `/brand/favicon.svg` — browser and PWA icon.

The icon combines an intelligent node with two mirrored action trajectories. It avoids sunrise, campus, checklist, and generic productivity imagery.

## Layout system

- **Login:** dark brand narrative on the left; focused authentication card on the right.
- **Landing:** hero, product value, data system, modules, AI coach, growth path, and CTA.
- **Workbench:** navigation, growth center, and persistent AI rail.
- **Stats:** overview, consistency, trends, habit evolution, and personal records.
- **Goals:** direction, active execution, review, and long-term archive.
- **AI Coach:** context/persona, conversation, and data insights in a stable three-part layout.

## Motion and stability

- Hover motion is limited to subtle lift, border, and shadow changes.
- Dashboard pages do not use first-paint entrance animation.
- Scrollbar space is reserved so data loading cannot shift the composition.
- Charts and dashboards are revealed only after their first complete render.
- `prefers-reduced-motion` suppresses nonessential motion.

## Technical boundary

The design system is a presentation layer. It preserves:

- HTML/CSS/ES Module/Vite/Vitest architecture.
- `chenguangData`, `CGStore`, `CGAnalytics`, `CGAPI`, and `CGSync`.
- `/api/data`, `/api/auth`, and `/api/ai/chat` contracts.
- Database fields and sync protocol.
- User data ownership and AI read-only safety boundaries.
