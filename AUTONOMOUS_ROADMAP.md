# 晨光自律台 · AUTONOMOUS ROADMAP

> 自主开发路线图（Autonomous CTO 维护）。只记录「有用户价值」的阶段，不堆功能数量。
> 基线：`7fdd6c6` fix: harden product experience before Phase 14

---

## 当前产品状态（2026-09-12 扫描结论）

### 已完成并封版
- Phase 8 数据一致性（revision + 冲突合并 + 墓碑 + 离线队列）
- Phase 9 课程系统 2.0（含课表文本粘贴导入）
- Phase 10 统一分析引擎 CGAnalytics（唯一统计事实来源）
- Phase 11 统计中心（stats 页）
- Phase 12 目标系统（Goal Engine 纯派生，无写回）
- Phase 13 AI 2.0（Context Builder → Provider 抽象 → 只读教练）
- Product Hardening（虚构社交证明/幽灵账号/明文密码/AI 错误泄露/降级 UX/无障碍）

### Product Loop 健康度
目标 → 行动 → 数据 → 分析 → 反馈 → AI → 再行动：**闭环成立**，
但存在一个 P1 断点（见 V2 验收发现 #1）：每日目标第二天即「过期」，直接打击最常见的学生目标写法。

### V2 产品体验验收（PEV V2）遗留发现
| # | 级别 | 发现 | 去向 |
|---|------|------|------|
| 1 | P1 | 「每日」目标第二天显示「已过期」——goalRange('daily') 锚定 startDate 单日，而学生最常用「每天背 50 词」式目标 | **Phase 14 修复** |
| 2 | P1 | AI Provider 未配置真实 Key → AI 教练降级可用但核心卖点 UNVERIFIED | **外部依赖**：需要用户提供 AI_API_KEY（不伪造凭证），见「阻塞项」 |
| 3 | P2 | 目标表单无周期语义提示；选「每日」时日期默认仍是周一~周日，用户无感知目标何时结束 | **Phase 14 修复** |
| 4 | P3 | 次日回访动力主要靠打卡连续 + 目标进度；缺「昨日回顾」类轻量钩子 | 观察，暂不做 |

### 阻塞项（需用户决策/提供，不阻塞其他开发）
- **AI_API_KEY**：AI 真实质量无法验证。Adapter / 错误处理 / 降级 UI 已就绪，配置环境变量后即可用。

---

## Phase 14 —— 目标系统真实语义修复（当前进行中）

**目标**：让「每日目标」成为可持续的习惯目标，而不是一天就过期的陷阱。

**用户价值**：「每天背 50 个单词 / 每天专注 2 小时」是大学生最自然的目标写法；
当前实现会在第二天把它打成「已过期」，直接摧毁 Product Loop 的第一环。

**范围（最小实现）**：
1. `goalRange('daily')` → `[today, today]`：每天独立评估「今天」的数据（保留 §44 原意：不累计），
   修复锚点错误（原实现锚定创建日 startDate）。未到开始日则评估开始日当天。
2. 每日目标 = 习惯语义：`endDate` 不参与过期判定（习惯不「到期」，想结束就归档）。
   当天达标 → completed，次日自动回到 active 重算，符合「每日打卡」直觉。
3. AI 洞察防误报：每日目标 daysRemaining 恒为 0，排除出「剩余时间不足」规则（否则每天都被误判高风险）。
4. 表单引导：切换周期时 `#goalFormHint` 显示对应人话解释（每日 → 「每天重新计算，今天做了就算今天达标」），
   选「每日」时日期字段同步为今天（仅表单一致性，引擎不依赖）。
5. 测试：更新 daily 语义测试 + 三条 V2 回归（昨天创建今天仍 active；页面卡片「每日重算」；AI 洞察无误报）。

**完成标准**：全量前端/后端测试 PASS + Build PASS；新增回归测试覆盖上述 4 条语义；不改数据模型、不改同步协议。

---

## Phase 15 —— 移动端体验修复 + 工作台数据绑定 P0（✅ 已完成，commit f55cbcd）

**范围与结果**（三方会话协作：0b 移动端审计 → 本会话实施 → d2 后端线 + RC）：
1. P1 输入框字号 ≥16px 全站 8 处（iOS 聚焦强制放大）
2. P1 index 375px 顶栏 CTA 裁切 + viewport maximum-scale 移除
3. P1 AI 页 iOS 键盘遮挡（100dvh + visualViewport --vvh）
4. **P0 工作台数据绑定失效**：dom.js setText 只支持选择器而 workbench 36 处用裸 id →
   今日仪表盘/成长面板/我的页从未被 JS 更新。setText 兼容裸 id（先 getElementById 再 querySelector）。
5. P2 成长面板连续打卡复用 Analytics.getStreaks（旧 continuousDays 字段无写入口）

回归：前端 271/271 · 后端 51/51 · Build PASS。

---

## Phase 16 —— 候选（重新评估后取舍，不为数量堆功能）

- **A. AI Provider 真实验证**（依赖用户提供 AI_API_KEY，仍为唯一外部依赖 P1）
- **B. 触控目标 ≥40px + modal 滚动锁/热力图触屏兜底**（0b 审计 P2 项 4/5，纯 CSS/交互层）
- **C. 移动端真机走查**（静态审计已完成，真机仍 UNVERIFIED）

若上述全部收口且无新 P0/P1，进入 **Release Candidate 最终验收**，宣布 PRODUCTION READY 或按发现重开一轮。

---

## 遗留技术债（TECH_DEBT.md 同步维护）
- visualViewport 方案在 iOS <16.4 无 dvh 时已由 --vvh JS 兜底覆盖；极老浏览器回退 100vh（键盘仍可能遮挡，可接受）。
- 触控目标 <40px、modal 打开缺滚动锁、热力图 tooltip 仅 hover：Phase 16 候选 B。
- workbench 旧字段 totalDays/continuousDays 为 Phase 8 前遗留，后端保持兼容不写入，真实值一律走 Analytics。

---

## 技术债备忘（不影响当前用户，暂不动）
- jsdom 测试环境 fetch/AbortSignal 兼容限制（仅测试环境，真实浏览器无影响）。
- Windows 下残留后端进程占 3000 端口需 taskkill（开发环境问题）。
