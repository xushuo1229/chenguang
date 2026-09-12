# 晨光自律台 · TECH DEBT

> 只记录「现在不影响真实用户、暂不处理」的债务。影响用户的直接修（见 git log）。

1. **jsdom 测试环境 fetch/AbortSignal 不兼容**（undici 要求真实 AbortSignal 实例）
   影响：测试内 CGSync push/pull 打警告并降级本地，仅测试环境；真实浏览器无影响。
   方向：如需测试内联同步，可在测试 boot 时 stub globalThis.fetch。

2. **Windows 残留 node 进程占用 3000 端口**：TaskStop 不总杀干净，需 `taskkill //F //PID`。
   开发环境问题，不进产品。

3. **移动端仅静态 + jsdom 验证**：未做真机/远程调试走查（Phase 15 候选 C）。
   2026-09-12 静态走查 + Phase 15（f55cbcd，已交叉验收 271/271）后状态：
   - ✅ 已修：3 个 P1（16px 输入字号全站、index 375px 顶栏溢出 + viewport maximum-scale、ai 页 100dvh + visualViewport --vvh）；
     走查 P2 之 growthStreak 恒 0（continuousDays 全库无写入口）改用 Analytics.getStreaks() 口径；顺带修 P0：setText 裸 id 静默失效致工作台仪表盘冻结（dom.js）。
   - ⏳ 未修（Phase 15 排序 4/5，仍是候选）：触控目标 ≥40px（modal-close 30px / onboard-close 26px / goals 操作按钮 ≈26px 且删除键间距 6px）；
     交互兜底（modal 打开锁 body 滚动 + 不自动聚焦弹键盘、stats 热力图 tooltip 仅 hover 触屏不可用、ai 抽屉无 backdrop 点外不关、底部 tabbar 各页条目不一致）。
   - 真机（iOS Safari 实机）走查仍未做。

4. **每日目标无「自定义结束日」入口**：习惯语义下 endDate 不参与过期（结束靠归档）。
   若未来用户需要「每日目标到某天结束」，给表单加可选结束日并在 deriveStatus 恢复 endDate 判定。

5. **buildInsights 每日目标完全跳过风险规则**：目前合理（无截止概念）；
   若加了结束日（见 4），需同步引入「当天晚了还没做」类规则。

6. **底部 tabbar 各页条目不一致**（2026-09-12 移动端走查）：workbench 7 项（多「我的」）、ai 无「管理」、stats/goals 各 6 项但组合不同。
   统一成哪组入口是产品决策，修复前各页维持现状；决策后抽成 shared 组件渲染。
