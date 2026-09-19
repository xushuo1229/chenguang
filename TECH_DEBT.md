# 知行 · TECH DEBT

> 只记录「现在不影响真实用户、暂不处理」的债务。影响用户的直接修（见 git log）。

1. **jsdom 测试环境 fetch/AbortSignal 不兼容**（undici 要求真实 AbortSignal 实例）
   影响：测试内 CGSync push/pull 打警告并降级本地，仅测试环境；真实浏览器无影响。
   方向：如需测试内联同步，可在测试 boot 时 stub globalThis.fetch。

2. **Windows 残留 node 进程占用 3000 端口**：TaskStop 不总杀干净，需 `taskkill //F //PID`。
   开发环境问题，不进产品。

3. **移动端仅静态 + jsdom 验证**（Phase 15 候选 C）—— 2026-09-19 更新：iOS WebKit 引擎级走查已完成（见 docs/IOS_WEBKIT_WALKTHROUGH_REPORT.md）：
   - ✅ 新修 3 个引擎级真 bug：today 勾选框 div→button（iOS 对 div tap 不合成 click，手指点勾选静默失效）、
     today 输入框 14.4px、课程空间 select 13.76px（均 <16px 触发 iOS 聚焦缩放）；tabbar 触控目标 flex 等分保 ≥40px。
   - ✅ 走查全绿项：9 页零异常/零 4xx/零溢出、表单控件 ≥16px、tabbar ≥40px、ai --vvh 兜底、touch 全流程交互与 auth 回跳。
   - ⏳ 仍未修（历史遗留，非本轮范围）：modal-close/onboard-close/goals 操作按钮 <40px；stats 热力图 tooltip 仅 hover。
   - ⏳ **真机（iOS Safari 实机）项仍 UNVERIFIED**：safe-area、软键盘遮挡实测、PWA 添加主屏、离线、真机性能
     （真机清单见报告 §5，需真实 iPhone）。
   2026-09-12 静态走查 + Phase 15（f55cbcd）已完成：3 个 P1（16px 输入字号全站、index 375px 顶栏溢出、ai 页 100dvh+--vvh）、
   growthStreak 改用 Analytics 口径、setText 裸 id P0。

4. **每日目标无「自定义结束日」入口**：习惯语义下 endDate 不参与过期（结束靠归档）。
   若未来用户需要「每日目标到某天结束」，给表单加可选结束日并在 deriveStatus 恢复 endDate 判定。

5. **buildInsights 每日目标完全跳过风险规则**：目前合理（无截止概念）；
   若加了结束日（见 4），需同步引入「当天晚了还没做」类规则。

6. ~~**底部 tabbar 各页条目不一致**~~（✅ 已解决，2026-09-19）：
   **产品决策**：全部页面统一为同一组 7 项 tabbar：首页 / 目标 / 数据 / AI / 课程 / 管理 / 我的（顺序固定）；
   「今日计划」与「Agent Home」为侧边栏专属入口，不进 tabbar（避免 8 项拥挤，且两者均有侧边栏对应项）。
   workbench 页内切换项（home）保留 `#` 自引用 + JS preventDefault 秒切；其余项全部使用规范深链（`workbench.html?view=...`），
   中键/新标签可直达对应视图。原 ai 页缺「管理」、goals 页缺「我的」已补齐。
   契约由 `tests/navigation.test.js`「unified 7-item mobile tabbar」用例锁定（条目、顺序、href、active 状态逐页断言）。

7. **工作台「成长趋势」季度参考值为硬编码**（UI-2 走查发现）：barSpecs 的 12 本 / 3,000 页 / 1,500 分钟 / 60 次等是写死的「本季参考」刻度，非用户可配置目标。UI-2 已把文案从「目标」改为「本季参考」以诚实化；正确解法是接入 Goal Engine 的目标体系或用户设置，属业务改动，未顺手做。

8. **「今日发现」（工作台）与「趋势解读」（统计页）为本地规则洞察，非 AI 产出**：只读真实数据、无模型参与；若未来希望接 AI Context 生成，需走只读 AI 链路并保留诚实空态，不得伪造。
