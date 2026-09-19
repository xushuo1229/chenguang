# 用户体验导航审计

# 当前问题

| 问题 | 文件 | 影响 | 优先级 |
| - | - | - | - |
| 页面壳整体使用入场动画 | `assets/calm-dawn-pro.css` | 工作台等内容在加载时透明并位移，制造页面滑动感 | P0 |
| 页面壳整体使用入场动画 | `assets/workbench-pro.css` | 主内容、侧边栏和 AI 栏同时位移，用户误判为 SPA 路由动画 | P0 |
| 卡片首次加载整体上浮 | `assets/calm-dawn-fusion.css` | 目标、统计和工作台卡片在打开后继续跳动 | P0 |
| 目标进度同步计算 | `pages/goals.js` | 打开页面先隐藏界面再计算全部目标，拖慢基础 UI 展示 | P1 |
| 统计等待 Chart.js 后才显示 Dashboard | `pages/stats.js` | 脚本加载与图表创建阻塞文本、列表和概览首屏 | P1 |
| AI 面板同步构建上下文并渲染 | `pages/ai.js` | Context、Memory 与 Analytics 计算发生在 AI 界面显示之前 | P1 |
| 同源静态资源使用 network-first | `service-worker.js` | 生产环境跳转可能等待已缓存资源重新协商 | P2 |

# 根因分析

项目没有 `startViewTransition`、SPA 路由系统或页面级 `translateX(100%)`。用户看到的“从右侧回到正常位置”是页面壳与卡片入场动画叠加布局渲染造成的感知：DOM 先进入透明或位移状态，随后在同一次页面装载中移动到最终位置。

Three core pages simultaneously execute Analytics, GoalEngine, AIContext, CoachMemory, or Chart.js before being visible on the Dashboard, which enlarges the blank first frame and the jump during subsequent re-rendering.

# 影响页面

`workbench.html`、`goals.html`、`stats.html`、`ai.html` 都受到页面壳动画的影响；`goals.html`、`stats.html`、`ai.html` 则受到各自首屏计算路径的影响。

# 修复方案

| 问题 | 修复方案 | 优先级 |
| - | - | - |
| 页面壳移动 | 删除 `uiProRise`、`wbProEnter`、`fd-rise` 页面壳与卡片入场动画，只保留 hover、颜色、阴影和 AI 消息等微交互 | P0 |
| 目标首屏 | 先展示页面骨架，再在延迟任务中读取 Store 并计算目标进度 | P1 |
| 统计首屏 | 先渲染概览、解读、列表、热力图与 Dashboard 结构，Chart.js 加载后再绘制趋势图和课程图 | P1 |
| AI 首屏 | 立即显示 AI 界面，Context、Memory、Analytics 和面板渲染放到下一帧 | P1 |
| 静态资源跳转 | 仅对同源带内容 hash 的 `/assets/*` 使用 cache-first，HTML 仍保持 network-first | P2 |
| 375px 横向溢出 | 工作台主内容裁剪横向溢出，底部导航自身滚动，Toast 限制在视口内 | P1 |

# 执行约束

不修改 Store 数据模型、同步协议、后端 API、数据库结构和 AI Coach 架构；不引入 React、Vue 或 SPA 化改造。
