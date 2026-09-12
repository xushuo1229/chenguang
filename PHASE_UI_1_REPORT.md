# Phase UI-1 · 登录页 + 首页 Landing 重设计报告

> 执行时间：2026-09-12 · 设计方向：A+B+C 融合（冻结于 docs/UI_DESIGN_SYSTEM.md）

## 1. 设计理念

「静晨光 Calm Dawn」：晨光时分既有破晓的温度，也有黎明前的安静。整套界面围绕这个意象展开——

- **做减法**：删除营销模板式的痛点区、虚构数据墙、网格背景装饰与大面积光晕；留白本身成为层级工具。
- **数据即结构**：卡片系统承载真实功能（B），语义色只落在图标与徽章上，卡片不整卡染色。
- **AI 是教练不是玩具**：AI 专属沉静紫（iris），用「轨道与罗盘」意象表达指引，明确「理解数据，不替你完成」的产品立场，杜绝机器人头像与科技蓝。

## 2. A+B+C 融合实现

| 方向 | 要求 | 落地 |
|---|---|---|
| A · Apple 产品体验 | 克制/留白/强层级，无装饰与花哨动画 | 版块垂直节奏 112/80/64px；动效仅 fade+slide 24px 入场、hover 抬升 2px；删除 body 网格背景与 hero 光晕；无粒子/闪光/循环动画 |
| B · Notion/Linear 信息系统 | 卡片化/模块分区/Dashboard 式 | 核心能力六卡（图标块+指标徽章+数据行）；产品体验用图文交错行而非卡片堆叠；数字一律 mono 字体 |
| C · AI 成长陪伴 | AI 懂数据、不替你完成 | 独立「AI 教练」版块：读你的真实记录 / 给可执行的建议 / 决定权在你；iris 紫专属点缀；无头像无聊天气泡 |

## 3. 修改文件

| 文件 | 变更 |
|---|---|
| `index.html` | 全量重写 Landing：Hero（你的个人成长操作系统）→ 核心能力 → 产品体验（工作台/统计/目标）→ AI 教练 → 成长理念 → CTA；登录/注册弹窗保留并按设计系统重样式；删除痛点区/虚构数据墙/旧 testimonial |
| `css/variables.css` | 新增 `--r-btn: 14px`（按钮圆角冻结值，12–16px 区间取 14）；其余 token 零改动，全站向后兼容 |
| `vite.config.js` | MPA 入口新增 `login.html` |
| `pages/index.js` | **零修改**（DOM 契约完整保留，276 项测试原样通过） |

## 4. 新增资源

| 文件 | 说明 |
|---|---|
| `login.html` | 独立登录页：桌面左右分栏（左品牌：记录今天，成为更好的自己。+ 四项真实能力清单 + 主视觉插画；右登录/注册卡）；≤900px 上下堆叠，移动端品牌区折叠为一行标语 |
| `pages/login.js` | 登录页逻辑：与首页弹窗共用同一后端流程（CGAPI.auth.login/register + CGSync.afterLogin/afterRegister + workbench 跳转）；校验规则与后端一致；cg_token 自动进入工作台；`?mode=register` 直达注册 |
| `docs/UI_DESIGN_SYSTEM.md` | 冻结设计系统：色彩/字体/圆角/阴影/动效/组件/布局/诚实原则 |
| `assets/design/login-dawn.svg` | 登录页主视觉：地平线日出 + 三色涟漪 |
| `assets/design/illus-workbench.svg` | 产品体验 · 工作台 |
| `assets/design/illus-stats.svg` | 产品体验 · 统计 |
| `assets/design/illus-goals.svg` | 产品体验 · 目标 |
| `assets/design/illus-ai-coach.svg` | AI 教练：轨道与罗盘星（iris） |
| `assets/design/illus-growth.svg` | 成长理念：上行小路与里程碑 |

统一插画语言：2px 圆头线条、晨光四色（amber/teal/sky/iris）、抽象几何、深底透明背景，全部手写 SVG，无外部素材。

## 5. 页面变化

- **登录页**（新增）：桌面左右分栏；右侧登录/注册一页切换；移动端 375px 单列无横向滚动，输入框一律 16px（iOS 防缩放）。
- **首页**：
  - Hero 主标题改为「你的个人成长操作系统」；三组真实统计（6 大功能模块 / 1 份数据同步 / 0 门槛）保留 count-up。
  - 核心能力六卡保留 `[data-feature]` 真实数据绑定（登录后显示用户自己的真实数据，未登录诚实显示 0）。
  - 新增产品体验区（工作台/统计/目标，图文交错）、AI 教练区（三条产品原则）、成长理念区（长期主义：从小开始/看数据不看情绪/允许中断）。
  - CTA 与页脚文案全部为真实能力描述，无虚构用户数/成功案例/社区数据。

## 6. 测试结果

`npm test`：**276/276 通过**（13 文件，vitest + jsdom）。
关键契约验证：

- 硬化测试：落地页无虚构数据（FORBIDDEN 清单全过）、modalLogin/modalRegister 存在、≥3 个注册 CTA、密码提示与后端规则一致 ✓
- Phase 15：viewport 无 maximum-scale、375px 顶栏容纳、全站输入框 ≥16px ✓
- Phase 16：弹窗滚动锁/ESC/遮罩关闭（M1–M3）✓
- 登录流程与后端规则一致（后端不可达明确报错，无幽灵账号）✓

## 7. Build 结果

`npm run build`：**成功**（736ms）。`login.html`（13.61 kB / gzip 4.33 kB）与 `login-*.js` 正常产出，六页 MPA 完整。

## 8. Git Commit

- Commit：`feat: Phase UI-1 Login and Landing redesign`
- 内容：上述全部文件；不包含 `.env`、`node_modules`、调试产物
- 未 push（遵守约定）
