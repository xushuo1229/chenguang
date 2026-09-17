# Phase 22.2 习惯形成检测实施报告

## 1. 实施摘要

新增 `js/habitFormation.js` 纯函数模块，实现 Model B（Frequency + Consistency + Continuity）习惯形成检测。输入为 `Analytics.getTrend()` 返回的日序列 `[{date, value}]`，输出 `isHabitForming`、`habitScore`、`frequency`、`consistency`、`maxConsecutive` 和用户可理解的 `evidence`。

不修改 CGStore / Sync / Backend / Memory / AI Context / UI。

## 2. 算法

```
habitScore = frequency × 0.35 + consistency × 0.30 + continuity × 0.35

isHabitForming = habitScore ≥ 0.5
              && frequency ≥ 0.3
              && maxConsecutive ≥ 3
              && activeDays ≥ 3
```

| 因子 | 公式 | 范围 |
|---|---|---|
| frequency | activeDays / windowDays | 0-1 |
| consistency | 1 - CV（变异系数） | 0-1 |
| continuity | maxConsecutive / windowDays | 0-1 |

## 3. 冷启动

| 天数 | isHabitForming | 原因 |
|---|---|---|
| 0 | false | activeDays < 3 |
| 1 | false | activeDays < 3 |
| 2 | false | activeDays < 3 |
| 3 | 可能为 true | 3 天连续 + 稳定 + frequency ≥ 0.3 |
| 7 | 合理判定 | 正常检测范围 |
| 14+ | 稳定检测 | 长窗口提供更多证据 |

## 4. 误报防护

| 场景 | 保护机制 |
|---|---|
| Single spike | activeDays < 3 → false |
| Short trend（高波动值） | consistency 低 → habitScore < 0.5 → false |
| Huge delta + insufficient data | activeDays < 3 → false |
| Interruption | maxConsecutive 不跨越 gap |
| Scattered days（无连续性） | maxConsecutive < 3 → false |

## 5. 领域处理

本阶段不实现领域差异（预留 Phase 22.3）。当前使用统一阈值：
- minSamples = 3
- minFrequency = 0.3
- minConsecutive = 3
- minHabitScore = 0.5

## 6. Memory 边界

- HabitFormation 是 **runtime projection**（系统推断）
- **禁止**写入 `user.memory`
- **禁止**生成 Memory candidate
- **禁止**修改 Memory schema

## 7. AI Context

**UNCHANGED** — 不新增 `ctx.habits` / `ctx.habitFormation` / `ctx.growthSignals`。

## 8. 测试

| 项目 | 结果 |
|---|---|
| Frontend | **513/514 PASS**（1 个预存在失败见下方说明） |
| Backend | PASS 68/68 |
| Build | PASS（3.44s） |
| git diff --check | PASS |

### 预存在失败说明

`tests/workbenchDailyFeedback.test.js > adding focus updates Daily Feedback without replacing the existing toast copy` 失败。

**原因：** 此前 Phase 21.x 累积修改 workbench.js 引入的预存在问题，与 Phase 22.2 新增文件无关。`js/habitFormation.js` 是零依赖纯函数，不影响任何已有模块。

## 9. 性能

365 天模拟数据（200 iterations）：

| 指标 | 值 | 目标 |
|---|---|---|
| p50 | 0.015ms | <10ms ✅ |
| p95 | 0.071ms | <10ms ✅ |
| max | 2.794ms | <10ms ✅ |

## 10. 安全

- ✅ 无 Store 写入
- ✅ 无 localStorage
- ✅ 无 token / password / API key
- ✅ 无 Memory mutation
- ✅ 无 AI 自动写入
- ✅ 无 DOM XSS

## 11. 修改文件

| 文件 | 操作 |
|---|---|
| `js/habitFormation.js` | 新增 |
| `tests/habitFormation.test.js` | 新增（22 条测试） |
| `docs/PHASE_22_2_HABIT_FORMATION_IMPLEMENT_REPORT.md` | 新增 |

## 12. 剩余风险

| 风险 | 级别 | 说明 |
|---|---|---|
| workbenchDailyFeedback 预存在失败 | P1 | Phase 21.x 遗留，需后续修复 |
| 无领域差异 | P1 | 统一阈值可能对低频习惯（如每周运动）误判 |
| 无 baseline 对比 | P2 | 无法区分新习惯 vs 延续旧习惯 |
| consistency 公式对小样本偏乐观 | P2 | 3 条记录如果值相近，consistency 趋近 1 |
| 尚无消费方 | P1 | 模块已就绪但 AI Context / UI / Memory 未接入 |
