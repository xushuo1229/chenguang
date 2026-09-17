# Phase 22.2 习惯形成检测终审

## 1. 执行摘要

Phase 22.2 实现了一个数学正确、架构隔离、性能优良的 Habit Formation 纯函数模块。算法与报告声明一致，无 Memory/AI/Store 越界。

核心发现：
- **无 P0 问题。**
- **4 项 P1 风险**：缺少 `currentConsecutive`、3 天阈值语义过强、无领域差异、`false` 无法区分"不成立"与"证据不足"。
- 模块当前无消费者，P1 风险暂无实际影响。

判定：**READY WITH P1 FOLLOW-UP**

---

## 2. 实现验证

| 声称 | 代码验证 | 结果 |
|---|---|---|
| 新增 `js/habitFormation.js` | ✅ 文件存在 | PASS |
| Model B 公式 | ✅ 代码一致 | PASS |
| 阈值 `habitScore >= 0.5 && freq >= 0.3 && maxConsec >= 3` | ✅ 代码一致 | PASS |
| `minSamples = 3` | ✅ 代码一致（early return） | PASS |
| 纯函数，无副作用 | ✅ 零 import | PASS |
| 不修改已有模块 | ✅ git diff 仅新增文件 | PASS |

---

## 3. 算法验证

### 数学公式

代码实现与报告声称完全一致：

```javascript
// js/habitFormation.js (实际代码)
result.habitScore = clamp01(
  result.frequency * 0.35 +
  result.consistency * 0.30 +
  continuityScore * 0.35
);

result.isHabitForming =
  result.habitScore >= 0.5 &&
  result.frequency >= 0.3 &&
  maxConsecutive >= 3;
```

### 隐含条件

`activeDays >= 3` 通过 early return 实现（`if (activeDays < THRESHOLDS.minSamples) return`），而非在 `isHabitForming` 条件中显式检查。功能等价。

---

## 4. 频率审计

### windowDays 语义

`days = Math.max(1, num(windowDays) || series.length || 1)`

- 表示**用户请求的完整观察窗口**，不是实际数据天数
- 如果 caller 传入 `windowDays=30` 但只提供 7 天数据，frequency 仍按 30 计算
- **正确**：frequency 反映的是"在完整窗口中行为的比例"
- 不包含未来日期（caller 负责传入正确范围的日序列）

### activeDays

- 计算 `values.filter(v => v > 0).length`
- 输入是日序列（每天一条），一个自然日多条记录在 Analytics.getTrend() 层已聚合
- 空数据（value=0）正确计为 inactive
- NaN 通过 `num()` 转为 0，正确排除

### 分母不同窗口语义

| 窗口 | 3 active days 的 frequency | 合理性 |
|---|---|---|
| 3d | 1.0 | ✅ 全部活跃 |
| 7d | 0.43 | ✅ 频率中等 |
| 30d | 0.10 | ✅ 频率低 |

实现正确区分了不同窗口的 frequency 语义。

---

## 5. 一致性审计

### 6.1 CV 的输入

**输入是非零值（活跃日的行为值），不是 binary 序列。**

```javascript
var nonZero = values.filter(function (v) { return v > 0; });
var mean = nonZero.reduce(...) / nonZero.length;
var cv = mean ? Math.sqrt(variance) / mean : 1;
```

- 只计算活跃日的值（排除零值日）
- 例如 `[25, 25, 25, 0, 0, 0, 0]` 的 consistency = 1.0（3 个活跃日值全部相同）

### 6.2 CV 边界情况

| 场景 | 结果 | 是否安全 |
|---|---|---|
| mean = 0（不可能：nonZero 值 > 0） | N/A | ✅ |
| mean 极低（全 1） | cv = 0, consistency = 1.0 | ✅ 无 NaN/Inf |
| 极端值 (1, 1000) | cv = ~1.414, consistency = 0.0 | ✅ |
| 单个活跃日 | minSamples=3 阻止进入 | ✅ |
| NaN 输入 | num(NaN) = 0 → 被过滤 | ✅ 无 NaN 传播 |
| 负值 | filter(v >= 0) 排除 | ✅ |

### 6.3 CV 对不同 binary pattern 的解释

| Pattern | freq | consistency | maxConsec | score | forming | 语义评估 |
|---|---|---|---|---|---|---|
| 1111111 | 1.00 | 1.00 | 7 | 1.00 | true | ✅ 习惯 |
| 1010101 | 0.57 | 1.00 | 1 | 0.55 | false | ✅ 频率够但无连续性 |
| 1111000 | 0.57 | 1.00 | 4 | 0.70 | **true** | ⚠️ 4 天即判定 forming |
| 1000001 | early return | - | - | 0.00 | false | ✅ minSamples 保护 |
| 0011111 | 0.71 | 1.00 | 5 | 0.80 | **true** | ⚠️ 5 天判定 forming |

**关键发现：** consistency = 1.0 对所有"活跃日值相同"的 pattern 成立，无论活跃日是否连续。consistency 只衡量"活跃日的值稳定度"，不衡量"行为出现的规律性"。这是设计选择，但可能导致 consistency 因子在 binary 场景下失去区分度。

---

## 6. 连续性审计

### maxConsecutive 计算

```javascript
var maxConsecutive = 0, current = 0;
for (var i = 0; i < values.length; i++) {
  if (values[i] > 0) { current++; if (current > maxConsecutive) maxConsecutive = current; }
  else { current = 0; }
}
```

正确计算了整个序列中的最长连续活跃天数。

### 历史连续 vs 当前连续

| Pattern | maxConsec | score | forming |
|---|---|---|---|
| F: 111111000...（旧习惯，已停） | 6 | 0.440 | false |
| G: 000...111111（新习惯，刚开始） | 6 | 0.440 | false |
| 1111110（7d 窗口，旧 streak） | 6 | 0.900 | true |
| 0111111（7d 窗口，新 streak） | 6 | 0.900 | true |

**发现：F 和 G 得到完全相同的分数。`currentConsecutive` 不存在。模型无法区分"历史习惯但已停止"和"新习惯正在形成"。**

在 30d 窗口中，频率因子（0.2 < 0.3）部分缓解了这个问题。但在 7d 窗口中，两者都被判定为 forming。这是一个 **P1 风险**。

---

## 7. 冷启动审计

| 场景 | activeDays | 结果 | 评估 |
|---|---|---|---|
| 0 天 | 0 | false | ✅ |
| 1 天 | 1 | false | ✅ minSamples 阻止 |
| 2 天 | 2 | false | ✅ minSamples 阻止 |
| 3 天连续 (111) | 3 | **true**（score=1.0） | ⚠️ 过于激进 |
| 3 天分散 | 3 | false | ✅ maxConsec < 3 |

**`111` 在 3d 窗口中立即判定为 `isHabitForming = true`。**

产品语义：3 天的行为更准确的描述应该是"early forming signal"，而不是"habit forming"。3 天是最低门槛，容易误判短期尝试为习惯形成。

**P1 风险：建议将 `maxConsecutive` 门槛提升至 5 天，或将输出增加 `stage` 字段（early/forming/established）。**

---

## 8. 误报审计

| 场景 | Pattern | 结果 | 评估 |
|---|---|---|---|
| Single spike | 1 天 | false | ✅ |
| 2 天 | 2 天 | false | ✅ |
| 短期趋势（高波动值） | [10,30,50,0,0,0,0] | false | ✅ consistency 低 |
| 交替模式 | 1010101 | false | ✅ maxConsec=1 |
| 分散活跃 | 110110...（maxConsec=2） | false | ✅ |
| **4 天连续** | 1111000 | **true** | ⚠️ 偏激进 |
| **极端值** | [1,1000,1,1000,...] | **true** | ⚠️ consistency=0 但 freq=1.0, continuity=1.0 → score=0.70 |
| 长期中断后恢复 | 000...111111 (6d) | false | ✅ freq=0.2 < 0.3 |

**两个 false positive 风险：**
1. 4 天连续即触发 forming（P1，应提高门槛）
2. 极端值波动（1 vs 1000）时 consistency=0 但 score 仍 ≥ 0.5（P2，权重调整可缓解）

---

## 9. 漏报审计

| 场景 | Pattern | 结果 | 评估 |
|---|---|---|---|
| 稳定低频（每周 1 次） | 30d 内 5 active | false | ✅ 正确（freq=0.17 < 0.3） |
| 稳定低频（每周 2 次） | 30d 内 8 active | false | ⚠️ 可能漏判 |
| 隔天运动 | maxConsec=1 | false | ✅ 连续性不足 |
| 30d 22 天活跃 | i%4==0 休息 | **true** | ✅ |

**P1 风险：无领域差异。** 每周运动 2 次是合理习惯，但 frequency = 8/30 = 0.27 < 0.3 被拒。需要 domain factor。

---

## 10. 领域偏差审计

当前统一阈值（freq ≥ 0.3, maxConsec ≥ 3, score ≥ 0.5）对不同领域的影响：

| 领域 | 期望频率 | 当前结果 | 偏差 |
|---|---|---|---|
| checkin（每日） | 0.7-1.0 | ✅ 容易检测 | 无 |
| focus（工作日） | 0.5-0.7 | ✅ 容易检测 | 无 |
| reading（高频） | 0.4-0.6 | ✅ 可检测 | 轻微 |
| exercise（每周 2-3 次） | 0.1-0.15 | ❌ 频率不足 | **严重：会漏判** |
| english（学习） | 0.3-0.5 | ✅ 可检测 | 无 |

**P1：exercise 等低频习惯会被系统性漏判。**

---

## 11. Memory 边界

```
rg "import|setUser|localStorage|store|Store" js/habitFormation.js → 0 matches
```

- ✅ 零 import（无依赖任何模块）
- ✅ 零 Store 写入
- ✅ 零 localStorage 访问
- ✅ 零 Memory mutation
- ✅ 纯函数，无副作用

---

## 12. AI Context 边界

```
rg "habitFormation|isHabitForming|habitScore|CGHabitFormation" js/growthSignals.js js/aiContext.js js/aiCoach.js js/growthMemory.js pages/workbench.js pages/stats.js pages/ai.js → 0 matches
```

- ✅ 无任何消费者
- ✅ 不在 AI Context 中
- ✅ 不影响 AI Provider
- ✅ AI 权限保持只读

---

## 13. Growth Signal 集成

`growthSignals.js` **未导入** `habitFormation.js`。

`isSustained` 字段仍使用 Phase 22.1 的简单判断（`volatility < 50 && activeDays >= 5`），未升级为 habit formation 检测。

这是正确的 Additive First 行为：Phase 22.2 只新增模块，不修改已有模块。

---

## 14. 测试质量

### 覆盖评估

| 场景类型 | 测试数 | 覆盖 |
|---|---|---|
| Cold start (T1-T3, T17) | 4 | ✅ |
| Single spike (T4, T14) | 2 | ✅ |
| Short trend (T5) | 1 | ✅ |
| Consistency (T7, T8) | 2 | ✅ |
| Interruption (T9) | 1 | ✅ |
| Recovery (T10) | 1 | ✅ |
| Low frequency (T11) | 1 | ✅ |
| Weekend pattern (T12) | 1 | ✅ |
| Long-term stable (T13, T15) | 2 | ✅ |
| Multi-domain (T16) | 1 | ✅ |
| Boundary (habitScore, maxConsec) | 3 | ✅ |
| Security (T18) | 1 | ✅ |
| Evidence quality | 1 | ✅ |

**总计 22 条测试**，覆盖审计定义的 18 场景 + 4 条额外边界。

### 缺失的测试

- ⚠️ NaN 输入测试（代码有保护但未显式测试）
- ⚠️ 极端值测试（1 vs 1000）
- ⚠️ currentConsecutive 测试（字段不存在，无法测试）
- ⚠️ 不同 windowDays 下的 boundary 交叉测试

---

## 15. 回归状态

### workbenchDailyFeedback.test.js 失败

```
rg "habitFormation" tests/workbenchDailyFeedback.test.js pages/workbench.js js/dailyFeedback.js → 0 matches
```

- ✅ Phase 22.2 新增文件与该测试**零依赖**
- ✅ Phase 22.2 未修改 workbench.js / dailyFeedback.js
- ✅ 基线 commit `232ad82` 不含 Phase 21/22 变更
- **结论：确认预存在失败，非 Phase 22.2 引入**

### 其他回归

- ✅ Frontend 513/514（1 pre-existing）
- ✅ Backend 68/68
- ✅ Build PASS
- ✅ 无新 regression

---

## 16. 性能

| 窗口 | p50 | p95 | max | 目标 |
|---|---|---|---|---|
| 7d | 0.002ms | 0.010ms | 0.133ms | <10ms ✅ |
| 30d | 0.003ms | 0.005ms | 0.329ms | <10ms ✅ |
| 90d | 0.004ms | 0.017ms | 0.198ms | <10ms ✅ |
| 365d | 0.012ms | 0.023ms | 0.101ms | <10ms ✅ |

- ✅ O(windowDays) 线性复杂度确认
- ✅ 不调用 Analytics（模块零依赖）
- ✅ 无重复计算

---

## 17. 安全

- ✅ 无 Store 写入
- ✅ 无 localStorage
- ✅ 无 token / password / API key
- ✅ 无 Memory mutation
- ✅ 无 AI 自动写入
- ✅ 无 DOM XSS
- ✅ 纯函数

---

## 18. 风险

### P0

无。

### P1

| # | 风险 | 影响 | 建议修复时机 |
|---|---|---|---|
| P1-1 | **缺少 `currentConsecutive`** | 无法区分旧习惯（已停）和新习惯（正在形成）；F 和 G 得到相同分数 | Phase 22.3 |
| P1-2 | **3 天阈值语义过强** | `111` 立即触发 `isHabitForming=true`；应命名为 "early forming signal" 或提高至 5-7 天 | Phase 22.3 |
| P1-3 | **无领域差异** | exercise 等低频习惯被系统性漏判（freq 0.27 < 0.3） | Phase 22.3 |
| P1-4 | **`false` 无法区分原因** | 不区分"频率不足" "连续性不足" "数据不足" | Phase 22.3 |

### P2

| # | 风险 | 说明 |
|---|---|---|
| P2-1 | 无 baseline 对比 | 无法区分新行为和延续旧行为 |
| P2-2 | consistency 对 binary 模式退化 | 所有活跃日值相同时 consistency = 1.0 |
| P2-3 | 极端值波动仍可触发 forming | [1,1000] 交替 → consistency=0 但 score=0.70 |
| P2-4 | 缺少 NaN/极端值显式测试 | 代码有保护但测试未覆盖 |
| P2-5 | evidence 文案固定 | 不反映具体的不足因子 |

---

## 19. 最终结论

**READY WITH P1 FOLLOW-UP**

### 理由

1. **算法数学正确**：公式与代码完全一致，边界条件有保护。
2. **架构边界完全保持**：零依赖纯函数，无 Memory/AI/Store/UI 越界。
3. **性能远超目标**：365d p95 = 0.023ms（<10ms 目标的 0.23%）。
4. **无 P0 问题**：不会产生 NaN/Infinity，不会写入 Store/Memory，不会误判 single spike。
5. **当前无消费者**：P1 风险暂无实际影响，但必须在被消费前（Phase 22.3）修正。
6. **测试覆盖良好**：22 条测试覆盖核心风险场景。

### P1 必须在 Phase 22.3 Implement 前处理

模块即将被 AI Context / Memory candidate 消费时，以下 4 项 P1 必须解决：

1. 添加 `currentConsecutive` 区分新旧习惯
2. 将 `isHabitForming` 语义重新定义为 "early forming signal" 或提高连续性门槛
3. 引入 `domainFactor` 处理不同频率的习惯
4. 在输出中添加 `reason` 字段说明 false 的具体原因

---

## 修改文件列表

仅新增：`docs/PHASE_22_2_HABIT_FORMATION_FINAL_AUDIT.md`

## 代码修改

NO

## Commit

NOT COMMITTED
