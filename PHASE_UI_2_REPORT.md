# Phase UI-2 · 内部四页统一体验重设计报告

> 执行时间：2026-09-12 · 基线：`cd2c682`（Phase UI-1）· 设计语言：Calm Dawn（A+B+C 融合，冻结于 docs/UI_DESIGN_SYSTEM.md）

## 1. 设计目标

把 workbench / stats / goals / ai 四个内部页从「功能页面」升级为统一的「个人成长空间」：

- **去掉后台感**：清除亮色卡片混搭、emoji 标题、交错入场动画、渐变装饰条等模板痕迹，全部回归暗色 Calm Dawn 表面体系。
- **信息有优先级**：工作台第一屏是「今日计划 + 今日发现」，统计页第一屏是「成长概览 + 趋势解读」，目标页突出「我的成长目标」与阶段旅程。
- **AI 是教练不是窗口**：AI 专属 iris 点缀贯穿（洞察卡、罗盘头像、消息头像），杜绝机器人意象；AI 页文案定位「理解你的成长数据，帮助你找到下一步」。

## 2. A+B+C 融合说明

| 方向 | 要求 | 落地 |
|---|---|---|
| A · Apple 体验 | 留白/安静/克制 | 删除 `cardReveal` 交错入场、`::before` 顶部装饰条、hero 渐变描边；hover 只剩描边加深 + `--shadow-hover`；所有过渡 ≤320ms token 化 |
| B · Notion/Linear 结构 | 清晰层级、减少堆积 | 工作台 hero-card 琥珀描边提权重；统计页新增「趋势解读」洞察区；目标卡新增阶段条（开始→坚持→完成）；硬编码「目标 12 本」等改为诚实的「本季参考」 |
| C · AI 成长陪伴 | 懂数据、不替你完成 | 工作台新增「今日发现」洞察卡（真实数据规则洞察 + 空态）；统计页「趋势解读」（本周 vs 上周真实对比，无趋势显示「暂无趋势」）；AI 头像/导航全面改为罗盘 + iris |

## 3. 修改文件

| 文件 | 变更 |
|---|---|
| `css/components.css` | **新增**：四页共享组件层（`cg-insight` 洞察卡 / `cg-stage` 阶段条 / 移动端适配），全部取值自设计 token |
| `docs/UI_DESIGN_SYSTEM.md` | 追加第 9 节「内部页面组件（Phase UI-2 扩展）」：洞察卡 / 阶段条 / 内部页卡片 / AI 意象 / 按钮圆角规范 |
| `workbench.html` | 暗色化 hero-card 与 profile-hero（删除亮奶油渐变与深棕文字覆盖）；顶栏问候重构（时间段问候 + 日期 + 连续记录）；emoji 卡头→语义色 FA 图标 chip；圆角/边框/按钮全 token 化；新增「今日发现」区；成长趋势区文案诚实化并链接统计页；fa-robot→fa-compass |
| `pages/workbench.js` | 新增 `greetWord()` / `welcomeStreak` / `renderWbInsights()`（只读展示层，无写入）；updateUI 尾部接入 |
| `stats.html` | 标题→「成长分析中心」；概览→「成长概览」；新增「趋势解读」洞察区；按钮圆角 token 化 |
| `pages/stats.js` | 新增 `renderInsight(snap)`：最近 7 天 vs 再往前 7 天的专注/活跃/完成率真实对比，无对比数据时显示「暂无趋势」空态 |
| `goals.html` | 标题→「我的成长目标」；按钮圆角 token 化；进度条填充去渐变改实色 |
| `pages/goals.js` | 新增 `stageHtml()`：目标卡阶段条（<34% 开始 / 34–99% 坚持 / 100% 完成），`aria-hidden` 纯装饰 |
| `ai.html` | 副标题→「理解你的成长数据，帮助你找到下一步」；AI 头像（顶栏 + 消息）改 iris 浅底罗盘；用户头像改中性底 |
| `TECH_DEBT.md` | 新增 #7（硬编码季度参考值）、#8（洞察为本地规则非 AI） |

**未触碰**：CGStore / CGAnalytics / Goal Engine / Sync / AI Context / 后端 API / 数据模型——零修改。

## 4. 组件变化

- **新增 `css/components.css`**（组件统一交付物）：`cg-insight`（iris 图标块 + 标题 + 语义圆点条目 + 诚实空态）、`cg-stage`（三段标签 + 带刻度轨道），已链接进四个内部页，取代跨页复制 CSS 的做法。
- **统一**：卡片 `--bg-card + --border-soft + --r-lg`；一切按钮 `--r-btn: 14px`（徽章/chip 保留 pill）；图标 chip 26px 圆角块（amber/teal/sky 语义色）。
- **移除**：交错入场动画、顶部装饰条、渐变卡片底、亮色混搭、40px pill 按钮、写死色值（#b0aeb0 / #4a3520 / #fff 等）。

## 5. 页面变化

- **工作台**：问候区「早上好，{昵称} · 日期 · 第 N 天 · 连续记录 N 天」（真实数据）；今日计划主卡暗色化保持第一视觉权重；六张功能卡统一图标语言；「今日发现」基于打卡/待办/专注/阅读真实记录给 1–3 条发现，无记录时显示诚实空态并引导去 AI 教练；「成长趋势 · 本季度」硬编码目标改「本季参考」并链接完整分析。
- **统计页（成长分析中心）**：成长概览（活跃/完成率/连续/专注/学习量，全部 Analytics 真实值）→ 趋势解读（与上周对比，措辞如「专注时长较上个 7 天增加 20%」）→ 趋势图 → 热力图（Phase 11 逻辑零改动）→ 明细区。
- **目标页（我的成长目标）**：四分区（进行中/已完成/已过期/已归档）保持；目标卡新增阶段条给「旅程感」；进度条实色 amber（完成 teal、过期 rose 语义保留）。
- **AI 教练**：定位文案对齐 C 方向；头像/消息全面去机器人化；今日状态/今日发现/目标风险/AI 建议 + 聊天区结构保持，Phase 13 安全模型（textContent、白名单 action）零改动。

## 6. 移动端验证（375 / 390 / 768 / 1440 静态走查）

- **375/390**：工作台单列卡片 + 洞察卡 16px 内边距（≤480 规则）；洞察卡链接文字收纳为图标（`.cg-insight-link span` 隐藏）；统计页热力图保持横向滚动容器（无页面级横向滚动）；目标页单列 + 表单单列；AI 页 100dvh + 16px 输入框维持。
- **768**：工作台双列网格、统计双栏 duo-grid 正常；侧边栏在 ≤860 由底部 tabbar 接管。
- **1440**：max-width 900/1080 容器居中，留白符合 112/80/64 节奏。
- `prefers-reduced-motion` 全局兜底（variables.css）继续覆盖新增组件。
- 真机走查仍属 TECH_DEBT #3（非本阶段范围）。

## 7. 测试结果

`npm test`：**276/276 通过**（13 文件，零跳过、零削弱）。
关键回归点：phase15（16px 输入 / growthStreak 口径 / P0 setText）、phase16（热力图 tooltip / AI 抽屉）、goals.page（10 项含 XSS 转义与 revision 语义）、ai.page（11 项含导航白名单）、stats（12 项含图表销毁与只读）、hardening（12 项）全部原样通过。

## 8. Build 结果

`npm run build`：**成功**（约 0.8–1.0s）。六页 MPA（含 login）完整产出，`css/components.css` 随共享 chunk 正常打包。

## 9. Git Commit

- Commit：`feat: Phase UI-2 unified product experience redesign`
- 含上述全部文件；`git status` 核对后未包含 `.env`、`node_modules`、调试产物（`tests/_dbg*`、`tests/_v2.acceptance.test.js` 保持未跟踪）。
- 未 push（遵守约定）。
