# 阶段 UX-PERF-FINAL 完成

# 问题

`goals.html`、`stats.html`、`ai.html` 打开后有明显等待，页面内容先从偏移位置回到最终排版，形成类似 SPA `translateX(100%) → translateX(0)` 的错误路由动画，并伴随首帧空白、闪烁和布局跳动。

# 根本原因

项目没有 SPA、`startViewTransition` 或页面级 `translateX(100%)`。真实原因是三层页面壳/卡片入场动画叠加布局渲染：

- `assets/calm-dawn-pro.css` 的 `.main > *` 使用 `uiProRise 360ms`。
- `assets/workbench-pro.css` 的 `.main/.sidebar/.ai-rail` 使用 `wbProEnter 420ms`。
- `assets/calm-dawn-fusion.css` 的功能卡、统计卡和目标卡使用 `fd-rise 420ms`。

三个核心页面又在 Dashboard 可见前执行重计算：Goals 同步调用 GoalEngine； Stats 等待 Chart.js 后才显示 Dashboard； AI 同步构建 Context、Memory、Analytics 并渲染面板。 生产环境中同源静态资源的 network-first 缓存策略进一步放大重复导航延迟。

# 文件更改

- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]

# 优化

- 删除 `uiProRise`、`wbProEnter`、`fd-rise` 页面壳与卡片入场动画及其关键帧。
- 保留按钮 hover、卡片 hover、阴影、颜色、AI 消息和必要反馈；非必要动画/过渡收敛到 180ms。
- Goals 先展示页面骨架，再在首帧后读取 Store 并计算目标进度。
- Stats first renders text, overview, list, heatmap, and Dashboard structure; after Chart.js loads, it draws trend charts and course charts.
- AI immediately displays the interface, while Context, Memory, Analytics, and panel rendering are delayed until after the first frame.
- 快速连续触发刷新时使用 render token，避免旧渲染覆盖新状态。
- 同源带内容 hash 的 `/assets/*` 改为 cache-first；HTML 和 API 策略不变。
- 375px 下裁剪工作台内容横向溢出，底部导航自身滚动，Toast 不再超出视口。

# 性能

1440px、本地 Vite、Chrome CDP、5 轮中位数：

| 页面 | DCL 前 | 加载 前 | FCP 前 | DCL 后 | 加载 后 | FCP 后 | 阶段调整 后 | 动画 后 |
| - | -: | -: | -: | -: | -: | -: | -: | -: |
| workbench.html | 55.3毫秒 | 56.3毫秒 | 80毫秒 | 54.8毫秒 | 55.7毫秒 | 96毫秒 | 1 / 0.0060 | 0 |
| goals.html | 33.7毫秒 | 35.3毫秒 | 52毫秒 | 44.1毫秒 | 45.6毫秒 | 52毫秒 | 0 / 0 | 0 |
| stats.html | 43.4毫秒 | 57.5毫秒 | 52毫秒 | 42.4毫秒 | 48.1毫秒 | 52毫秒 | 0 / 0 | 0 |
| ai.html | 52.7毫秒 | 54.7毫秒 | 56毫秒 | 50.7毫秒 | 52.1毫秒 | 56毫秒 | 0 / 0 | 0 |

Stats 的旧测量中约 1000ms 是脚本人为等待 Chart.js/采样，不是页面耗时。优化后四页基础 UI FCP 均低于 300ms；核心三页 layout shift 为 0。

# 测试

- 前端：通过 — `npm test`，27 个文件 / 334 个测试。
- 构建：通过 — `npm run build`。
- 后端：通过 — `cd backend; npm test`。
- 响应式：通过 — 1440px 与 375px 四页横向溢出为 0。
- 导航：通过 — 140 次页面加载（工作台 → 目标 → 统计 → AI → 工作台 → 目标 → AI，连续 20 轮），0 次不可见或横向溢出，最大 FCP 164ms，最大位移 0.0214。
- Workbench 有一次约 0.006 的字体渲染级微小位移；不影响跳转流畅度，也不出现在核心三页。

# 未解决的问题

无阻塞问题。后续可继续评估工作台字体级微小位移和移动端 7 项底部导航的信息密度，但这属于视觉优化，不属于当前导航动画缺陷。
