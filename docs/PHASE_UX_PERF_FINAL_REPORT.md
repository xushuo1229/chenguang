# Phase UX-PERF-FINAL Complete

## Problem

`goals.html`、`stats.html`、`ai.html` 打开后有明显等待，页面内容先从偏移位置回到最终排版，形成类似 SPA `translateX(100%) → translateX(0)` 的错误路由动画，并伴随首帧空白、闪烁和布局跳动。

## Root Cause

项目没有 SPA、`startViewTransition` 或页面级 `translateX(100%)`。真实原因是三层页面壳/卡片入场动画叠加布局渲染：

- `assets/calm-dawn-pro.css` 的 `.main > *` 使用 `uiProRise 360ms`。
- `assets/workbench-pro.css` 的 `.main/.sidebar/.ai-rail` 使用 `wbProEnter 420ms`。
- `assets/calm-dawn-fusion.css` 的功能卡、统计卡和目标卡使用 `fd-rise 420ms`。

三个核心页面又在 Dashboard 可见前执行重计算：Goals 同步调用 GoalEngine；Stats 等待 Chart.js 后才显示 Dashboard；AI 同步构建 Context、Memory、Analytics 并渲染面板。生产环境中同源静态资源的 network-first 缓存策略进一步放大重复导航延迟。

## Files Changed

- `assets/calm-dawn-pro.css`
- `assets/workbench-pro.css`
- `assets/calm-dawn-fusion.css`
- `assets/calm-dawn-1to1.css`
- `assets/xingzhixing.css`
- `css/shared.css`
- `css/app.css`
- `workbench.html`
- `pages/goals.js`
- `pages/stats.js`
- `pages/ai.js`
- `service-worker.js`
- `tests/dashboardRenderStability.test.js`
- `docs/UX_NAVIGATION_AUDIT.md`
- `docs/PHASE_UX_PERF_FINAL_REPORT.md`

## Optimization

- 删除 `uiProRise`、`wbProEnter`、`fd-rise` 页面壳与卡片入场动画及其 keyframes。
- 保留按钮 hover、卡片 hover、阴影、颜色、AI 消息和必要反馈；非必要动画/过渡收敛到 180ms。
- Goals 先展示页面骨架，再在首帧后读取 Store 并计算目标进度。
- Stats 先渲染文本、概览、列表、热力图和 Dashboard 结构；Chart.js 加载完成后再绘制趋势图和课程图。
- AI 立即显示界面，Context、Memory、Analytics 与面板渲染延迟到首帧后。
- 快速连续触发刷新时使用 render token，避免旧渲染覆盖新状态。
- 同源带内容 hash 的 `/assets/*` 改为 cache-first；HTML 和 API 策略不变。
- 375px 下裁剪工作台内容横向溢出，底部导航自身滚动，Toast 不再超出视口。

## Performance

1440px、本地 Vite、Chrome CDP、5 轮中位数：

| Page | Before DCL | Before Load | Before FCP | After DCL | After Load | After FCP | After Shifts | After Animations |
| - | -: | -: | -: | -: | -: | -: | -: | -: |
| workbench.html | 55.3ms | 56.3ms | 80ms | 54.8ms | 55.7ms | 96ms | 1 / 0.0060 | 0 |
| goals.html | 33.7ms | 35.3ms | 52ms | 44.1ms | 45.6ms | 52ms | 0 / 0 | 0 |
| stats.html | 43.4ms | 57.5ms | 52ms | 42.4ms | 48.1ms | 52ms | 0 / 0 | 0 |
| ai.html | 52.7ms | 54.7ms | 56ms | 50.7ms | 52.1ms | 56ms | 0 / 0 | 0 |

Stats 的旧测量中约 1000ms 是脚本人为等待 Chart.js/采样，不是页面耗时。优化后四页基础 UI FCP 均低于 300ms；核心三页 layout shift 为 0。

## Tests

- Frontend: PASS — `npm test`，27 files / 334 tests。
- Build: PASS — `npm run build`。
- Backend: PASS — `cd backend; npm test`。
- Responsive: PASS — 1440px 与 375px 四页横向溢出为 0。
- Navigation: PASS — 140 次页面装载（工作台 → 目标 → 统计 → AI → 工作台 → 目标 → AI，连续 20 轮），0 次不可见或横向溢出，最大 FCP 164ms，最大 shift 0.0214。
- Workbench 有一次约 0.006 的字体渲染级微小位移；不影响跳转流畅度，也不出现在核心三页。

## Remaining Issues

无阻塞问题。后续可继续评估工作台字体级微小位移和移动端 7 项底部导航的信息密度，但这属于视觉优化，不属于当前导航动画缺陷。
