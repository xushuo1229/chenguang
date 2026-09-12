# 晨光自律台 · TECH DEBT

> 只记录「现在不影响真实用户、暂不处理」的债务。影响用户的直接修（见 git log）。

1. **jsdom 测试环境 fetch/AbortSignal 不兼容**（undici 要求真实 AbortSignal 实例）
   影响：测试内 CGSync push/pull 打警告并降级本地，仅测试环境；真实浏览器无影响。
   方向：如需测试内联同步，可在测试 boot 时 stub globalThis.fetch。

2. **Windows 残留 node 进程占用 3000 端口**：TaskStop 不总杀干净，需 `taskkill //F //PID`。
   开发环境问题，不进产品。

3. **移动端仅静态 + jsdom 验证**：未做真机/远程调试走查（Phase 15 候选 C）。

4. **每日目标无「自定义结束日」入口**：习惯语义下 endDate 不参与过期（结束靠归档）。
   若未来用户需要「每日目标到某天结束」，给表单加可选结束日并在 deriveStatus 恢复 endDate 判定。

5. **buildInsights 每日目标完全跳过风险规则**：目前合理（无截止概念）；
   若加了结束日（见 4），需同步引入「当天晚了还没做」类规则。
