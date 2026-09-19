# iOS WebKit 引擎走查报告

日期：2026-09-19
执行环境：Playwright WebKit 26.6（与 iOS Safari 同源引擎）· Windows 宿主
设备描述：iPhone 14 Pro（393x660 可用视口，DPR 3，touch）· iPhone SE 3rd gen（375x667，DPR 2，touch）
真实 UA：`Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ... Safari/604.1` 等

## 1. 诚实声明：这是引擎级模拟，不是真机走查

WebKit 引擎 + iPhone 设备描述能覆盖：渲染引擎行为、touch 事件链路、合成 click 规则、
viewport/visualViewport 语义、字号缩放判定逻辑。

**不能**覆盖：真实 safe-area 荷叶边、物理键盘弹起遮挡、PWA 添加主屏、推送、真机性能/发热、
iOS 系统级手势冲突。这些仍标记 UNVERIFIED，需要一台真实 iPhone 完成（见 §5 清单）。

## 2. 走查范围与方法

- 页面：workbench（4 视图）、today、goals、stats、ai、agent-home（已登录）+ index、login（未登录）
- 脚本：`scripts/iosWebkitAudit.mjs`（可重复执行：自动注册账号 → 全页扫描 → 交互探针）
- 检查项：
  1. 页面加载 + 未捕获 JS 异常（pageerror）
  2. console.error
  3. HTTP ≥ 400 请求
  4. 横向溢出（scrollWidth - clientWidth > 1）
  5. **Phase 15 契约**：全部可见表单控件（input/textarea/select）computed font-size ≥ 16px
  6. **Phase 16 契约**：mobile-tabbar 每项触控目标 ≥ 40x40px
  7. **Phase 15 契约**：ai 页 `--vvh` visualViewport 兜底存在
  8. touch 交互：today 添加计划 → 勾选完成 → 统计联动
  9. touch 全流程：未登录访问 today → 登录弹窗 → 登录 → 回跳

## 3. 发现与修复（本轮走查揪出 3 个真 bug）

### F-1 today 页勾选框在 iOS 上点不动（P1，交互失效）

- 现象：WebKit touch tap `.tp-task-check` 后任务状态不切换；mouse click 正常。
  桌面端验收（鼠标）从未暴露此问题。
- 根因：勾选框是空 `<div class="tp-task-check" data-toggle=...>`，依赖 document 级 click 委托。
  iOS Safari 对非交互元素（div）的 touch tap **不合成 click**，委托永远收不到事件；
  页内其它委托目标（编辑/删除/恢复等）均为原生 `<button>`，tap 正常。
- 修复：`pages/today.js` 将勾选框改为 `<button type="button" aria-pressed=...>`；
  `today.html` 补 button 样式重置（background:transparent; padding:0）。
  语义顺带修正（可交互元素用 button + aria-pressed）。
- 回归：touch tap 添加/勾选/统计联动在两台设备描述下全部通过。

### F-2 today 页输入框 14.4px < 16px（P2，iOS 聚焦强制放大页面）

- 根因：today.html 是 Phase 15「输入框 ≥16px 全站」修复之后新增的页面，`#newTaskText`/
  `#newTaskTime` 漏网（0.9rem）。
- 修复：两输入框 font-size: 16px。

### F-3 课程空间 select 13.76px < 16px（P2，同类）

- 根因：`js/courseSpaceUI.js` 动态注入的 `.course-space-select` 用 `font-size: .86rem`。
  iOS Safari 对 select 聚焦同样触发缩放。
- 修复：16px。全站其余 select（`.wb-select` 等）确认已是 16px。

### 触控目标修正（Phase 16 契约补齐）

- 现象：7 项 tabbar 在 375px 视口下每项仅 38px 宽（< 40px）。
- 修复：`css/shared.css` `.mobile-tabbar a` 改为 `flex: 1 1 0; min-width: 40px`
  （320px 窄屏 ÷ 7 ≈ 46px 仍达标），并移除 480px 断点的收窄 padding 规则。

## 4. 结果矩阵

| 检查项 | iPhone 14 Pro (393) | iPhone SE 3rd gen (375) |
|---|---|---|
| 9 页加载零异常/零 console 错误/零 4xx | PASS | PASS |
| 横向溢出 | 无 | 无 |
| 表单控件 ≥ 16px | PASS（修复后） | PASS（修复后） |
| tabbar 触控目标 ≥ 40px | PASS（修复后） | PASS（修复后） |
| ai 页 --vvh 兜底 | PASS | PASS |
| today touch 添加/勾选/统计联动 | PASS（修复后） | PASS（修复后） |
| auth 未登录 → 登录 → 回跳（touch） | PASS | PASS |
| index/login 未登录加载 | PASS | PASS |

## 5. 真机走查清单（需要真实 iPhone，仍为 UNVERIFIED）

- [ ] 刘海屏 safe-area：tabbar `env(safe-area-inset-bottom)` 实测（全面屏机型）
- [ ] 软键盘弹起：ai 页输入框可见性（visualViewport --vvh 实机行为）、today 添加栏不被遮挡
- [ ] 添加到主屏（PWA）：图标、启动画面、standalone 模式下 tabbar/滚动
- [ ] 离线：飞行模式下的 Service Worker 缓存回退与离线队列
- [ ] 系统手势边缘：左右边缘滑返回是否误触侧边栏
- [ ] 性体感：低端机型（SE）首帧与滚动掉帧

## 6. 结论

引擎级可验证的 iOS 兼容性问题已全部清零并加入回归契约；
剩余风险集中在真机物理特性（safe-area/键盘/PWA/性能），按 §5 清单执行真机走查后即可关闭 TECH_DEBT #3 的实机项。
