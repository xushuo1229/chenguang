# 知行 · UI 设计系统「静晨光 Calm Dawn」

> Phase UI-1 冻结版 · 2026-09-12
> 适用范围：登录页（login.html）、首页 Landing（index.html）。工作台/统计/目标/AI 页沿用同一 token 体系（css/variables.css），逐步对齐。

本设计系统是「A+B+C 融合方向」的落地规范：

- **A · Apple 产品体验**：克制、留白、强视觉层级。无装饰堆砌、无花哨动画、无营销模板感。
- **B · Notion/Linear 信息系统**：卡片化、模块分区、仪表板式组织，结构即信息。
- **C · AI 成长陪伴**：AI 是懂你数据的成长教练，不是聊天机器人。禁止机器人头像、科技蓝爆炸、赛博朋克。

- --

# 1. 色彩 Color

唯一 token 来源：`css/variables.css`（全站共享，禁止在页面内另起炉灶定义颜色）。

## 基础表面（暖石墨 · 实心，无玻璃无霓虹）

| Token | 值 | 用途 |
|---|---|---|
| `--bg-page` | `#0f1114` | 页面底 |
| `--bg-soft` | `#14161b` | 区块底 / 顶栏 |
| `--bg-card` | `#191c22` | 卡片底 |
| `--bg-elev` | `#21252d` | 弹窗 / 悬浮 |
| `--bg-input` | `#121419` | 输入框 |

## 文本（暖白四阶）

| Token | 值 | 用途 |
|---|---|---|
| `--text-hi` | `#f2efe8` | 标题 / 主文字 |
| `--text-mid` | `#b8b3a8` | 正文 / 次要 |
| `--text-muted` | `#8d887d` | 提示 / 说明 |
| `--text-on-accent` | `#211407` | 琥珀底上的深字 |

## 品牌色（晨光暖色 · 语义固定）

| Token | 值 | 语义 |
|---|---|---|
| `--brand-amber` `#e8a85c` | 主品牌 / 主 CTA / 品牌锚点 | 晨光 |
| `--brand-teal` `#4fc3b4` | 正反馈 / 完成 | 青瓷 |
| `--brand-sky` `#7ba7d9` | 信息 / 阅读学习 | 天青 |
| `--brand-rose` `#e8796f` | 警示 / 错误 | 珊瑚 |
| `--brand-iris` `#a78dc9` | **AI 专属点缀**（教练、智能建议） | 沉静紫 |

* *规则**
1. 主 CTA 全页只允许琥珀实底；一个视口内主按钮 ≤ 1 个。
2. AI 相关元素用 iris 紫点缀，**禁止**科技蓝渐变、荧光、发光。
3. Semantic colors must not be mixed: teal = completed, rose = error, sky = information, iris = AI.
4. 装饰性背景（网格线、光晕、粒子）一律取消。

- --

# 2. 字体 排版

Single character family (following system CJK stack): `--font` = HarmonyOS Sans SC / MiSans / PingFang SC / Microsoft YaHei UI / Segoe UI / system-ui.

| 层级 | 字号 / 行高 | 字重 | 用途 |
|---|---|---|---|
| Display | `clamp(2.6rem, 6vw, 4rem)` / 1.15 | 700, `letter-spacing: -0.03em` | Hero 主标题 |
| H2 | `clamp(1.6rem, 3vw, 2.1rem)` / 1.25 | 700, `-0.02em` | 版块标题 |
| H3 | `1.15–1.2rem` / 1.4 | 600 | 卡片标题 |
| Body | `1rem` / 1.75 | 400 | 正文（行宽 ≤ 42em） |
| Caption | `0.85–0.9rem` / 1.5 | 400 | 说明 / 数据标签 |
| 数据 | `--font-mono` | 600 | 数字（统计值） |

* *规则**
1. 每屏只有一个 Display/H2；层级靠字号与留白，不靠颜色强调。
2. 禁止全大写英文 eyebrow、字符间隔拉宽的装饰标签。
3. 正文颜色用 `--text-mid`，标题 `--text-hi`；不要用低对比灰写关键信息。
4. 输入框字号一律 `16px`（iOS 聚焦防缩放，全站硬性规定）。

- --

# 3. 圆角半径

| Token | 值 | 用途 |
|---|---|---|
| `--r-xl` | **24px** | 大卡片 / 弹窗 / 登录卡 |
| `--r-lg` | **20px** | 标准卡片 |
| `--r-btn` | **14px** | **按钮（新增冻结值）** |
| `--r-sm` | 10px | 输入框 / 小控件 |
| `--r-pill` | 999px | 仅限标签 / 徽章，**不再用于按钮** |

- --

# 4. 阴影 Shadow（轻阴影两层制）

| 场景 | 值 |
|---|---|
| 卡片静置 | `0 1px 2px rgba(0,0,0,.2)` |
| 卡片悬浮 | `0 2px 6px rgba(0,0,0,.16), 0 12px 28px rgba(0,0,0,.18)` |
| 弹窗 | `--shadow-lg`（variables.css） |

* *规则**：阴影只表达「高度层级」，不做发光。禁止 `box-shadow` 带品牌色光晕。

- --

# 5. 动效 Motion（只有微交互）

| 类型 | 规格 |
|---|---|
| 入场 reveal | 淡入 fade   translateY(24px)，320毫秒 `--ease`，仅一次，由 IntersectionObserver 触发 |
| 悬停 hover | translateY(‑2px)   阴影加深   边框提亮，≤200毫秒 |
| 弹窗 | 淡入 fade   缩放 scale(0.97→1)，200毫秒 |
| 数字 | 主要统计数字 hero count-up（1500毫秒，一次性） |

* *规则**
1. 仅允许 fade / slide / hover 微交互。**禁止**：粒子、闪光、霓虹脉冲、视差、循环动画、骨架屏闪烁。
2. 全局尊重 `prefers-reduced-motion`（variables.css 已实现）。
3. 页面加载不做编排式入场序列，各区块随滚动自然出现。

- --

# 6. 组件 Component

## 按钮
- 主按钮：琥珀实底 `--brand-amber` `--text-on-accent`，`--r-btn`，padding `13px 28px`，字重 600。
- 次按钮：透明底 1.5px `--border-strong` 边框 `--text-hi`；hover 边框/文字提亮。
- 文字链接：琥珀色，hover 下划线。
- 禁止：渐变按钮、发光按钮、胶囊大按钮（标签除外）。

## 卡片（B · 信息系统核心）
- 底 `--bg-card`，1px `--border-soft` 边框，`--r-lg`，内边距 24–28px。
- 结构固定：图标/指标区 → 标题 → 描述 → 数据行（`--font-mono` 数字）→ 动作。
- 悬浮：抬升 2px + 阴影 + 边框提亮；**禁止**背景变色闪烁。
- Functional semantic colors (amber/teal/sky/rose) only appear in icon backgrounds and data badges, not on the entire card.

## 表单（登录/注册）
- 输入框：`--bg-input` 底边，1px `--border-strong`、`--r-sm`，**16px 字号**，内边距 13px 14px。
- 聚焦：琥珀色 3px 柔和焦点环（`--brand-amber-weak`）；错误：玫瑰色边框 `hint.err` 文本。
- 标签在输入框上方（12.5px，`--text-muted`）；错误文案写「怎么改」，不写「哪里坏了」。

## 导航 / 顶栏
- 实底 `--bg-soft`   1px 底边框； 滚动后加 `--shadow-md`（`.topbar.scrolled`）。
- 移动端 ≤480px：缩排 + 按钮缩小，保证 375px 内 logo + 登录 + 注册一行放下。

## 插画（assets/design/）
- 统一语言：2px 圆头线条 晨光四色（amber/teal/sky/iris） 大面积留白的抽象几何（地平线、轨迹、轨道、层叠卡片）。
- AI 一律用「轨道/罗盘/星点」意象，**禁止机器人、人脸、聊天气泡头像**。
- 全部为手写 SVG（无外部素材、无随机 stock 图），深底透明背景。

- --

# 7. 布局 Layout

- Container 最大宽度 1080px（Landing 内容）/ 1200px（顶部栏），左右内边距 20–24px。
- 版块垂直节奏：桌面 112px、平板 80px、手机 64px；标题与内容间 32–48px。
- 版块标题左对齐 + 一句 `--text-mid` 副标题（B 结构感）；Hero 居中为例外。
- 断点：1440 / 768 / 390 / 375。375px 禁止横向滚动、文字溢出、按钮挤压。
- 登录页桌面左右分栏（左品牌 45% / 右表单 55%），≤900px 上下堆叠。

- --

# 8. 内容与诚实原则

1. 禁止虚构用户数、成功案例、社区数据、评价人名。
2. 空数据显示 `0` 或引导文案，不伪装。
3. 错误文案零运维语言（不出现 .env / API Key / 后端路径）。
4. CTA 说人话：「免费开始记录」「去工作台」，不喊口号。

- --

# 9. Internal Page Components (Phase UI-2 Extension)

> Scope of application: workbench / stats / goals / ai four internal pages. Shared components are uniformly placed in
> `css/components.css`（`cg-` 前缀），**禁止在各页重复复制组件 CSS**。

## 洞察卡 `cg-insight`
- 用途：工作台「今日发现」、统计页「趋势解读」——像教练的一句话发现，不是报表。
- 结构：iris 图标块（34px，`rgba(167,141,201,.12)`）  标题/副标题   可选右上链接（iris 色）；
条目为 `--bg-soft` 圆角行，行首 7px 语义圆点（amber=行动 / teal=正反馈 / sky=信息 / iris=AI）。
- 文案：一句话说清一个事实 + 一个方向；无数据时诚实显示空态文案（如「暂无趋势」），
  **不编造发现**。

## 目标阶段条 `cg-stage`
- 用途：目标卡进度条下方的「开始 → 坚持 → 完成」旅程提示（<34% 开始，34–99% 坚持，100% 完成）。
- 结构：三个 12px 标签（点 字），中间 4px 轨道带刻度线；当前阶段 `is-current`（amber 加粗），
已过阶段 `is-done`（青绿色）。纯装饰，`aria-hidden="true"`（数值语义由进度条表达）。

## 内部页卡片
- 卡片统一 `--bg-card`   `--border-soft`   `--r-lg`； 悬浮仅描边加深   `--shadow-hover`。
- **禁止**整卡染色、渐变底、顶部装饰条、交错入场动画（每次只有一次 viewIn 淡入）。
- 主卡（工作台今日计划）用 `--bg-elev` + `--border-neon` 提权重，不换底色系。
- 语义色仅应用于图标 chip（`.card-ico` 26px 圆角块）、徽章和进度条上。

## 头像与 AI 意象（全站执行）
- AI 头像/导航图标：`fa-compass` iris 浅底；**禁止 `fa-robot`、机器人脸、科技蓝**。
- 用户头像：`--bg-elev` 中性底；AI 消息气泡头像一律 iris。

## 按钮圆角（内部页补遗）
- All buttons (top bar link buttons, btn-wb, modal-foot, btn-new, btn-refresh) are unified `--r-btn: 14px`;
唯一例外是状态徽章 / 小芯片，继续用 `--r-pill`。
