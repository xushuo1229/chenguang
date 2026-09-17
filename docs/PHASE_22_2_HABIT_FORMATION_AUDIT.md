# Phase 22.2 习惯形成检测审计

## 1. 摘要

Phase 22.1 的 `isSustained` 字段（`volatility < 50 && activeDays >= 5`）过于简单，无法可靠区分"短期波动"和"正在形成的习惯"。当前系统缺少：日序列数据传递、频率计算、连续性检测、观察窗口感知和领域差异处理。

本审计提出三个候选模型，推荐 **Model B: Frequency + Consistency + Continuity**，并定义 Phase 22.2 Implement 最小范围。

判定：**READY FOR IMPLEMENT**

---

## 2. 当前能力

| 能力 | 当前状态 | 模块 |
|---|---|---|
| 检测趋势方向（rising/falling/stable） | ✅ | `growthIntelligence.js buildTrend()` |
| 检测趋势强度（delta + volatility） | ✅ | `growthSignals.js trendStrength()` |
| 检测信号可信度（activeDays + volatility） | ✅ | `growthSignals.js trendConfidence()` |
| 基础持续判断（isSustained） | ⚠️ 过于简单 | `growthSignals.js isSustainedTrend()` |
| 区分一次提升 vs 短期趋势 vs 稳定习惯 | ❌ 不可区分 | 无 |
| 检测行为频率 | ❌ 不存在 | 无 |
| 检测行为连续性（consecutive days） | ❌ 不存在 | 无 |
| 领域差异处理（日常 vs 周频习惯） | ❌ 不存在 | 无 |
| 冷启动处理 | ⚠️ 仅通过 insufficientData | 无专门逻辑 |

---

## 3. 习惯形成定义

### 五个层级

| 层级 | 定义 | 最小证据 | 当前可检测 |
|---|---|---|---|
| A. Single Improvement | 一次明显提升 | 1 天 spike | ❌ 当前会误判为 habit |
| B. Short-term Trend | 3-5 次连续上升 | 3+ 天 trend | ⚠️ 部分（通过 trend.status） |
| C. Consistent Behavior | 一段时间内行为稳定 | volatility 低 + 频率可 | ⚠️ 部分（通过 isSustained） |
| D. Habit Formation | 趋势 + 持续性 + 频率 + 稳定性 | 复合条件 | ❌ 不存在 |
| E. Established Pattern | 长时间稳定重复 | Memory confirmed | ✅ 由 Memory 系统补充 |

### Habit Formation ≠ Confirmed Memory

| 维度 | Habit Formation | Confirmed Memory |
|---|---|---|
| 来源 | 系统从 Analytics 数据推断 | 用户主动确认 |
| 性质 | runtime projection | 持久化事实 |
| 权限 | 只读派生 | 用户控制 |
| 生命周期 | 每次计算重新生成 | 用户确认后保留 |
| 置信度 | 算法计算 | 用户确认提升 |

---

## 4. 当前 isSustained 审计

### 当前实现

```javascript
// js/growthSignals.js
function isSustainedTrend(trend) {
  var active = num(trend.evidence && trend.evidence.currentActiveDays);
  var volatility = num(trend.volatility);
  return volatility < 50 && active >= 5;
}
```

### 十项审计回答

| # | 审计项 | 回答 | 说明 |
|---|---|---|---|
| 1 | activeDays 是否足够？ | **不够** | activeDays 只表示"有记录的天数"，不表示"该指标有值的天数"。用户活跃但可能不是每天做同一件事 |
| 2 | volatility 是否足够？ | **不够** | volatility 只衡量值的波动程度，不衡量频率稳定性。低值但偶尔出现的指标可能 volatility 很低 |
| 3 | 是否考虑观察窗口？ | **否** | 7d 和 30d 窗口使用相同阈值（volatility < 50 && active >= 5），但 7 天内 5 天活跃比 30 天内 5 天活跃频率更高 |
| 4 | 是否考虑行为频率？ | **否** | 不知道该指标在活跃日中出现的百分比（如"7 天活跃 5 天，其中阅读出现在 3 天"） |
| 5 | 是否考虑连续性？ | **否** | 不知道是否连续（如连续 5 天 vs 7 天内分散 5 天），连续性是习惯的核心特征 |
| 6 | 是否考虑 baseline？ | **否** | 不知道这是新行为还是延续旧行为。一个刚开始的稳定行为和一个持续 3 个月的稳定行为置信度应该不同 |
| 7 | 是否考虑样本量？ | **否** | 2-3 条记录如果恰好稳定，会被误判为 sustained。需要最低样本量门槛 |
| 8 | 能否区分稳定低频和稳定高频？ | **否** | 每周运动 1 次（稳定但低频）和每天阅读（稳定且高频）当前无法区分 |
| 9 | 能否处理只有 2-3 条记录？ | **否** | 当前 `active >= 5` 是唯一门槛，2-3 条记录会返回 false（好），但没有更精细的分级 |
| 10 | 能否处理长期中断后重新开始？ | **否** | 中断后重新开始的新窗口内如果恰好 5 天稳定，会被误判为 sustained，忽略了长期中断 |

### 结论

当前 `isSustained` 只是一个**布尔阈值**，不是习惯形成检测。它最多能回答"这个趋势是否不是明显波动"，无法回答"是否正在形成习惯"。

---

## 5. 候选检测模型

### Model A: Frequency + Consistency（最简）

```javascript
// 输入：已有 trend + growthState
function detectHabitA(trend, windowDays) {
  var activeDays = num(trend.evidence && trend.evidence.currentActiveDays);
  var frequency = activeDays / windowDays;               // 0-1
  var consistency = 1 - Math.min(1, num(trend.volatility) / 100); // 0-1
  var habitScore = frequency * 0.5 + consistency * 0.5;  // 0-1
  return {
    isHabitForming: habitScore >= 0.5 && frequency >= 0.3,
    habitScore: clamp01(habitScore),
    frequency: frequency,
    consistency: consistency
  };
}
```

| 维度 | 评估 |
|---|---|
| 准确性 | 中等：无法区分分散 vs 连续 |
| 可解释性 | ✅ 高：两个因子清晰 |
| 数据需求 | 低：只依赖已有 trend.evidence |
| 计算成本 | 极低：<0.01ms |
| 误判风险 | 中：分散 5 天可能被误判 |
| 冷启动 | 中：数据不足时 frequency 自然低，安全 |

### Model B: Frequency + Consistency + Continuity（推荐）

```javascript
// 需要传入日序列数据（来自 Analytics.getTrend）
function detectHabitB(dailySeries, windowDays) {
  var nonZero = dailySeries.filter(function (d) { return num(d.value) > 0; });
  var activeDays = nonZero.length;
  var frequency = activeDays / windowDays;

  // 一致性：值的变异系数
  var values = nonZero.map(function (d) { return num(d.value); });
  var mean = values.reduce(function (s, v) { return s + v; }, 0) / Math.max(1, values.length);
  var variance = mean ? values.reduce(function (s, v) { return s + Math.pow(v - mean, 2); }, 0) / values.length : 0;
  var cv = mean ? Math.sqrt(variance) / mean : 1;
  var consistency = clamp01(1 - cv);

  // 连续性：最长连续天数
  var maxConsecutive = 0, current = 0;
  for (var i = 0; i < dailySeries.length; i++) {
    if (num(dailySeries[i].value) > 0) {
      current++;
      if (current > maxConsecutive) maxConsecutive = current;
    } else {
      current = 0;
    }
  }
  var continuityScore = clamp01(maxConsecutive / windowDays);

  // 样本量门槛
  if (activeDays < 3) return { isHabitForming: false, reason: 'insufficient_samples' };

  var habitScore = frequency * 0.35 + consistency * 0.30 + continuityScore * 0.35;
  return {
    isHabitForming: habitScore >= 0.5 && frequency >= 0.3 && maxConsecutive >= 3,
    habitScore: clamp01(habitScore),
    frequency: frequency,
    consistency: consistency,
    maxConsecutive: maxConsecutive,
    continuityScore: continuityScore
  };
}
```

| 维度 | 评估 |
|---|---|
| 准确性 | ✅ 高：可区分分散 vs 连续 |
| 可解释性 | ✅ 高：三个因子各有明确含义 |
| 数据需求 | 中：需要日序列数据（`Analytics.getTrend()` 输出） |
| 计算成本 | 低：O(windowDays) 遍历，7-30 天 <0.1ms |
| 误判风险 | 低：最低样本量 + 连续性要求 |
| 冷启动 | ✅ 好：`activeDays < 3` 明确拒绝 |

### Model C: Frequency + Consistency + Continuity + Observation Window

在 Model B 基础上增加：

```javascript
// 窗口感知阈值
var WINDOW_THRESHOLDS = {
  '7d':  { minFrequency: 0.4, minConsecutive: 3, minSamples: 3 },
  '30d': { minFrequency: 0.2, minConsecutive: 5, minSamples: 6 },
  '90d': { minFrequency: 0.1, minConsecutive: 7, minSamples: 10 }
};

// 领域差异
var DOMAIN_FACTORS = {
  checkin:    { expectedFrequency: 0.8, label: '日常记录' },
  focus:      { expectedFrequency: 0.5, label: '工作日习惯' },
  reading:    { expectedFrequency: 0.4, label: '高频阅读' },
  exercise:   { expectedFrequency: 0.2, label: '每周运动' },
  english:    { expectedFrequency: 0.3, label: '学习习惯' }
};
```

| 维度 | 评估 |
|---|---|
| 准确性 | 最高 |
| 可解释性 | 中：因子多但可通过 evidence 解释 |
| 数据需求 | 高：需要日序列 + 领域配置 |
| 计算成本 | 低-中：O(windowDays)，但需配置 |
| 误判风险 | 最低 |
| 冷启动 | ✅ 好：窗口阈值保护 |

---

## 6. 推荐最小模型

**推荐 Model B** 作为 Phase 22.2 Implement 范围。

理由：
1. **准确性足够**：三个因子（频率、一致性、连续性）能覆盖 Phase 22.0 审计中 10 个不足项的 7 个
2. **数据可达**：`Analytics.getTrend()` 已返回日序列，只需在 `buildGrowthSignals()` 或新的 `habitFormation.js` 中传入
3. **计算简单**：单次遍历 O(windowDays)，365 天数据 <1ms
4. **不追求过度复杂**：不做机器学习，不做用户画像，纯规则引擎
5. **剩余 3 个不足**（baseline、领域差异、长期中断恢复）留给 Phase 22.3

---

## 7. 领域差异

| 领域 | 期望频率 | 最短习惯周期 | 说明 |
|---|---|---|---|
| checkin | 每日 | 7 天 | 日常打卡是最容易形成习惯的 |
| focus | 工作日 | 14 天 | 需要工作日频率但可接受周末中断 |
| reading | ≥ 3 天/周 | 14 天 | 高频阅读习惯 |
| exercise | ≥ 2 天/周 | 14 天 | 低频但稳定即可 |
| english | ≥ 3 天/周 | 14 天 | 语言学习需要频率 |
| todo | ≥ 3 天/周 | 7 天 | 任务管理是基本习惯 |
| course | 持续进行 | N/A | 课程是长期项目，非日常习惯 |

Phase 22.2 Implement 中**不实现领域差异**（留给 Phase 22.3），但设计时应预留 `domainFactor` 接口。

---

## 8. 冷启动分析

| 场景 | 天数 | Model B 行为 | 风险 |
|---|---|---|---|
| 首日使用 | 1 天 | `activeDays < 3` → false | ✅ 安全 |
| 第 2-3 天 | 2-3 天 | `activeDays < 3` → false | ✅ 安全 |
| 第 4-6 天 | 4-6 天 | 可能进入检测范围但 frequency 低 | ✅ 安全 |
| 第 7 天 | 7 天 | 首次可能判定为 habit forming（如果连续 7 天） | ✅ 合理 |
| 中断后恢复 | 重新计数 | 日序列有 gap，maxConsecutive 重置 | ⚠️ 中断 2 天后连续性分数下降 |

**结论：** Model B 的 `minSamples: 3` 门槛天然解决冷启动问题。

---

## 9. 误报 / 漏报风险

### False Positive（误判为习惯）

| 场景 | 当前 isSustained | Model B | 缓解 |
|---|---|---|---|
| 连续 5 天单次 spike（如每天考试前学习一次） | ✅ 误判 | ⚠️ 可能 | maxConsecutive >= 3 但 frequency 可低 |
| 假期集中记录 | ✅ 误判 | ✅ 正确拒绝 | 假期后 frequency 下降 |
| 稳定但极低值（如每天专注 1 分钟） | ✅ 误判 | ⚠️ 可能 | Phase 22.3 引入最小值门槛 |

### False Negative（漏判习惯）

| 场景 | 当前 isSustained | Model B | 缓解 |
|---|---|---|---|
| 每周运动 2-3 次（稳定但低频） | ❌ 可能漏判 | ⚠️ 可能 | frequency 阈值不应过高 |
| 30 天内 15 天活跃但不连续 | ❌ 漏判 | ✅ 可检测 | frequency 30% + continuity 35% |
| 隔天运动（一休息一运动） | ❌ 漏判 | ✅ 可检测 | maxConsecutive 至少 2-3 |

---

## 10. Memory 边界

```
┌───────────────────────────────────────────────────────────────────┐
│                      Memory vs Habit Formation                    │
├────────────────────────────┬──────────────────────────────────────┤
│    Habit Formation          │    Confirmed Memory                  │
│    (Phase 22.2 新增)         │    (Phase 20 已有)                    │
├────────────────────────────┼──────────────────────────────────────┤
│ 来源：系统算法推断            │ 来源：用户主动确认                     │
│ 性质：runtime projection     │ 性质：持久化到 user.memory             │
│ 生命周期：每次计算重新生成      │ 生命周期：用户确认后长期保留             │
│ 置信度：算法计算 0-1          │ 置信度：用户确认 = 权威                │
│ 用途：AI 参考 / UI 提示       │ 用途：AI 长期规律引用                  │
│ 写入：❌ 禁止                 │ 写入：✅ 用户操作触发                   │
└────────────────────────────┴──────────────────────────────────────┘
```

**Phase 22.2 Implement 禁止：**
- 写入 `user.memory`
- 生成 Memory candidate（`generateCandidates` 可在未来消费 Habit Formation 结果，但不在本阶段实施）
- 修改 Memory schema

---

## 11. AI Context 边界

### 当前决策

**不新增 `ctx.habits` / `ctx.habitFormation` / `ctx.growthSignals`。**

### 未来路径

如果 Phase 22.3+ 需要 AI 感知习惯形成：

| 方案 | 收益 | Token 成本 | 建议 |
|---|---|---|---|
| `ctx.growth.signals[]` 中添加 `isHabitForming` 字段 | AI 可区分短期 vs 长期 | +20 tokens/信号 | ✅ 最小变更 |
| `ctx.growth.patterns[]` 独立数组 | AI 获得专门的"习惯"列表 | +100-200 tokens | P2 未来考虑 |
| `ctx.growth.habits` 对象 | 最结构化 | +150-300 tokens | P2 过度设计 |

**推荐未来路径：** 在 Phase 22.1 的 `signals[]` 中为 `type: 'improvement'` 的信号添加 `isHabitForming: boolean`，不新增独立字段。但这不在本阶段实施。

---

## 12. UI 边界

本阶段不修改 Workbench / Stats / AI。

未来 UI 感知路径：

| 页面 | 可展示 | 触发条件 |
|---|---|---|
| Workbench | "你最近在专注方面形成了稳定节奏" | `isHabitForming === true` 的 signal |
| Stats | "正在形成的习惯" 区域 | habitScore >= 0.5 |
| AI | AI 可以说"根据你的记录，专注正在变得更稳定" | AI Provider prompt 增强 |

以上均属于 Phase 22.3+ 范围。

---

## 13. 性能

365 天模拟数据基准测试结果：

| 模块 | p50 (ms) | p95 (ms) | max (ms) | 目标 |
|---|---|---|---|---|
| GrowthIntelligence.buildDailyInsight | 34.84 | 36.98 | 39.86 | <200ms ✅ |
| GrowthSignals.buildGrowthSignals | 0.019 | 0.047 | 0.284 | <10ms ✅ |

### Model B 预估性能

`detectHabitB(dailySeries, windowDays)` 对每个 metric 执行一次 O(windowDays) 遍历：

| 场景 | 预估耗时 |
|---|---|
| 7 个指标 × 7d 窗口 | <0.1ms |
| 7 个指标 × 30d 窗口 | <0.3ms |
| 总计（7d + 30d） | <0.5ms |

**结论：** 远低于 10ms 目标。

### 关键前提

Model B 需要日序列数据。当前 `growthIntelligence.js` `buildTrend()` 只返回聚合统计（current/previous/delta/volatility），**不保留原始日序列**。

**解决方案（按侵入性排序）：**
1. **推荐**：在 `habitFormation.js` 中直接调用 `Analytics.getTrend()` 获取日序列（不修改 growthIntelligence）
2. 在 `growthIntelligence.js buildTrend()` 中添加 `dailySeries` 到 evidence（修改已有模块）
3. 在 `growthSignals.js` 中接收 snapshot 并自行调用 Analytics（修改已有模块）

---

## 14. 安全

| 检查项 | 当前状态 | Phase 22.2 Implement 要求 |
|---|---|---|
| Store 写入 | ❌ 无 | ❌ 禁止 |
| localStorage | ❌ 无 | ❌ 禁止 |
| Backend schema | ❌ 未修改 | ❌ 禁止 |
| Sync | ❌ 未修改 | ❌ 禁止 |
| API key / token / password | ❌ 无 | ❌ 禁止 |
| AI 自动写入 | ❌ 无 | ❌ 禁止 |
| Memory 自动写入 | ❌ 无 | ❌ 禁止 |

### 文案语义

| 允许 | 禁止 |
|---|---|
| "你的记录显示，这个行为正在变得更稳定。" | "你已经养成了这个习惯。" |
| "近期记录呈现出较稳定的重复模式。" | "AI 完全了解你的习惯。" |
| "数据显示这个行为持续出现在你的日常中。" | "你的习惯已经永久形成。" |

---

## 15. 测试矩阵

Phase 22.2 Implement 必须覆盖的测试场景：

| # | 场景 | 输入条件 | 预期结果 |
|---|---|---|---|
| T1 | Cold start（首日） | 1 条记录 | `isHabitForming = false` |
| T2 | Cold start（2 天） | 2 条记录 | `isHabitForming = false` |
| T3 | 最低样本量 | 3 条连续记录 | 可进入检测范围 |
| T4 | Single spike | 1 天 100 分钟 + 0 天其他 | `isHabitForming = false` |
| T5 | Short trend | 3-5 天连续上升 | `isHabitForming = false`（除非频率/一致性也够） |
| T6 | Consistency | 10 天分散但稳定值 | `isHabitForming = false`（无连续性） |
| T7 | Sustained behavior | 连续 7 天稳定 + 频率 ≥ 50% | `isHabitForming = true` |
| T8 | 30 天 sustained | 30 天内 15 天连续活跃 | `isHabitForming = true` |
| T9 | Interruption | 连续 5 天 → gap 2 天 → 连续 3 天 | `maxConsecutive = 5`，`isHabitForming` 取决于总分 |
| T10 | Recovery | 中断 30 天后重新连续 7 天 | `isHabitForming = true`（新窗口内） |
| T11 | Low frequency | 30 天内 6 天活跃（每周 1-2 次）| `isHabitForming = false`（频率不足）或 true（如果 weekly threshold） |
| T12 | Weekend pattern | 周末连续活跃，工作日无 | `maxConsecutive = 2`，`isHabitForming = false` |
| T13 | Domain: focus（工作日习惯） | 工作日连续 5 天 | 应检测为 habit（未来 domain factor） |
| T14 | Domain: exercise（低频） | 每周 2 次连续 4 周 | 应检测为 habit（未来 domain factor） |
| T15 | 空数据 | 无记录 | 返回 false，不报错 |
| T16 | 指标切换 | focus 从 0 → 25 → 50 → 75（递增） | `isHabitForming = false`（值在变化，不稳定） |
| T17 | 稳定值 | focus 恒定 25 分钟 × 14 天 | `isHabitForming = true` |
| T18 | 安全 | 无 Store 写入 | 通过 |

---

## 16. 推荐实施范围

### Phase 22.2 Implement 最小范围

**新增文件：**
- `js/habitFormation.js` — 纯函数模块
- `tests/habitFormation.test.js` — 上述 T1-T18 测试

**新增函数：**

```javascript
// js/habitFormation.js
export function detectHabitFormation(dailySeries, windowDays, opts) {
  // Model B: Frequency + Consistency + Continuity
  // 返回 { isHabitForming, habitScore, frequency, consistency, maxConsecutive, evidence }
}
```

**修改文件（最小）：**
- `js/growthSignals.js` — 可选：在 signal 中添加 `isHabitForming` 字段（从 habitFormation 导入）
- `js/growthIntelligence.js` — 可选：在 `buildTrend()` evidence 中添加 `dailySeries`（如选择方案 2）

**不修改：**
- `js/store.js`
- `js/sync.js`
- `backend/`
- `js/growthMemory.js`
- `js/aiContext.js`
- `pages/`（Workbench / Stats / AI）
- `workbench.html` / `stats.html` / `ai.html`

**数据流：**

```
Analytics.getTrend() → dailySeries[]
↓
habitFormation.detectHabitFormation(dailySeries, windowDays)
↓
{ isHabitForming, habitScore, frequency, consistency, maxConsecutive }
↓
growthSignals.js signal.isHabitForming（可选）
↓
Future: AI Context / Memory candidate / UI
```

---

## 17. 最终结论

**READY FOR IMPLEMENT**

Phase 22.2 Implement 应只实现 Model B（Frequency + Consistency + Continuity）的核心检测函数，不引入领域差异、不修改 Memory、不修改 AI Context、不修改 UI。

---

## 修改文件列表

本阶段为纯审计，无代码修改。

仅新增：`docs/PHASE_22_2_HABIT_FORMATION_AUDIT.md`

## 测试结果

- **Frontend:** PASS 492/492（46 files）
- **Backend:** PASS 68/68（20 suites）
- **Build:** PASS（1.07s）
- **git diff --check:** PASS

## 性能结果

- GrowthIntelligence: p95 = 37ms（<200ms ✅）
- GrowthSignals: p95 = 0.05ms（<10ms ✅）
- Model B 预估: <0.5ms（<10ms ✅）

## 风险列表

| 风险 | 级别 | 缓解 |
|---|---|---|
| 日序列数据当前未传递到 signal 层 | P0 | Phase 22.2 Implement 必须解决 |
| Model B 可能误判"连续但极低值" | P1 | Phase 22.3 引入最小值门槛 |
| 无领域差异 | P1 | Phase 22.3 引入 domainFactor |
| 无 baseline 对比 | P2 | 需要更长观察窗口 |
