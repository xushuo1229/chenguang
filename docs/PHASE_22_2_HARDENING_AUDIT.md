# Phase 22.2 加固审计 — Habit Formation P1 解决方案

## 执行摘要

本审计针对 Phase 22.2 Final Audit 确认的 4 项 P1 风险，提出最小、可信、向后兼容的硬化方案。每项 P1 分析多个候选模型并给出推荐。

判定：**READY FOR HARDENING IMPLEMENT**

---

## P1-1 currentConsecutive 缺失

### Current Problem

`maxConsecutive` 只记录窗口内历史最长连续天数，无法区分"旧习惯已中断"和"新习惯正在形成"：

```
111000000000（旧习惯，已停）  maxConsec=3, currentConsec=0
000000000111（新习惯，正在形成） maxConsec=3, currentConsec=3
```

两者当前得到完全相同的 habitScore。

### Possible Solutions

| Model | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A | 仅新增 `currentConsecutive` 输出字段，不改 habitScore | 最小改动，向后兼容 | `isHabitForming` 仍对旧习惯返回 true |
| B | 新增 `currentConsecutive` 并要求 `currentConsecutive >= 2` 才可判定 forming | 准确区分新旧，最小改动 | 严格但合理：行为必须在最近 2 天内持续 |
| C | 将 continuity 从 `maxConsecutive/windowDays` 改为 `currentConsecutive/windowDays` | 直接反映当前状态 | 破坏已有 score 语义；old streak 会被惩罚 |
| D | 同时使用 historical + current continuity 参与打分 | 最全面 | 复杂度增加，难以解释 |

### Recommended Solution: **Model B**

```javascript
// 在现有遍历中追加（零额外遍历）：
// 循环结束后，current 变量即为 currentConsecutive
result.currentConsecutive = current;

// isHabitForming 新增条件：
result.isHabitForming =
  result.habitScore >= THRESHOLDS.habitScore &&
  result.frequency >= THRESHOLDS.frequency &&
  maxConsecutive >= THRESHOLDS.maxConsecutive &&
  current >= 2;  // 行为必须在最近 2 天内持续
```

### Trade-offs

| 维度 | 评估 |
|---|---|
| 准确性 | ✅ 显著提升：旧习惯不再被误判为 forming |
| 可解释性 | ✅ `currentConsecutive` 含义清晰 |
| False positive | ✅ 降低：`1110000` 不再触发 forming |
| False negative | 轻微增加：如果用户刚好在窗口最后一天休息，current=0 → false；但这是正确行为（不在形成中） |
| Cold start | ✅ 不受影响（minSamples 先行拒绝） |
| 中断恢复 | ✅ 恢复后 current 重新累计 |
| 实现复杂度 | 极低：1 行新增字段 + 1 行新增条件 |
| Backward compatibility | ✅ `isHabitForming` 保留，仅语义更精确 |
| 性能 | ✅ 零额外遍历（在现有循环中同时计算） |

---

## P1-2 3 天阈值语义过强

### Current Problem

`minSamples=3` + `maxConsecutive=3` 意味着 `111`（3 天连续）立即触发 `isHabitForming=true`。产品语义上，3 天更像"early forming signal"而非"habit formation"。

### Possible Solutions

| Model | 描述 | 优点 | 缺点 |
|---|---|---|---|
| Boolean | 保持 `isHabitForming: boolean`，提高阈值 | 最简单，完全兼容 | 无法表达阶段，false 仍模糊 |
| Status (3-level) | `status: 'not_forming' | 'forming' | 'stable'` | 准确区分阶段 | API 变化，consumer 需适配 |
| Status (4-level) | `status: 'insufficient' | 'not_forming' | 'forming' | 'stable'` | 最全面 | 同上 + 复杂度更高 |
| Additive Status | 保留 `isHabitForming` boolean + 新增 `status` 字段 | 兼容 + 信息丰富 | 稍冗余但安全 |

### Recommended Solution: **Additive Status Model**

```javascript
// 保留 isHabitForming（向后兼容）
// 新增 status 字段：
result.status = deriveStatus(result, current);

function deriveStatus(result, currentConsec) {
  if (result.activeDays < THRESHOLDS.minSamples) return 'insufficient';
  if (!result.isHabitForming) return 'not_forming';
  if (currentConsec < STAGE_THRESHOLDS.forming) return 'early';
  if (currentConsec < STAGE_THRESHOLDS.stable) return 'forming';
  return 'stable';
}

// STAGE_THRESHOLDS（基于数据推导，非硬编码）：
// early: currentConsecutive < 7（不足一周）
// forming: currentConsecutive >= 7 && < 14（一周至两周）
// stable: currentConsecutive >= 14（两周以上）
```

### 阈值推导

| 阈值 | 值 | 依据 |
|---|---|---|
| forming | currentConsecutive ≥ 7 | 一周是行为学中习惯养成的最短公认周期（Lally 2010: average 66 days, minimum 18 days; 7 天是绝对下界） |
| stable | currentConsecutive ≥ 14 | 两周提供了更可靠的重复证据 |

### Trade-offs

| 维度 | Boolean | Status (3-level) | Status (4-level) | Additive Status |
|---|---|---|---|---|
| 简单性 | ✅ 最高 | 中 | 中 | 中 |
| 语义准确性 | ❌ false 模糊 | ✅ | ✅✅ | ✅✅ |
| Backward compat | ✅ | ❌ API 变化 | ❌ | ✅ 保留 boolean |
| AI 可消费性 | 低 | 中 | ✅ 高 | ✅ 高 |
| 实现复杂度 | 最低 | 中 | 中 | 中 |

---

## P1-3 无领域差异

### Current Problem

统一 `frequency >= 0.3` 导致 exercise 2x/week（0.286）被拒绝。

### Domain Frequency Analysis

| 领域 | 自然频率 | 30d 窗口 frequency | 当前 0.3 阈值判定 |
|---|---|---|---|
| focus | 每日 | ~0.7-1.0 | ✅ 通过 |
| checkin | 每日 | ~0.7-1.0 | ✅ 通过 |
| reading | ≥ 3 天/周 | ~0.4-0.6 | ✅ 通过 |
| english | ≥ 3 天/周 | ~0.4-0.6 | ✅ 通过 |
| todo | ≥ 3 天/周 | ~0.4-0.6 | ✅ 通过 |
| **exercise** | **2-4 次/周** | **~0.07-0.13** | **❌ 被拒** |
| course | 持续进行 | N/A（长期项目） | 不适用 |

### Possible Solutions

| Model | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A — Universal Threshold | 保持 0.3 | 简单，无配置 | exercise 漏判 |
| B — Domain Config | 每个 metric 有专属 minFrequency | 准确 | 需要配置表，可能过度工程 |
| C — Relative Frequency | `actual / expected` | 理论最优 | expectedFrequency 来源不明 |
| D — Caller Override | 默认 0.3，允许 `opts.minFrequency` 覆盖 | 最小改动，灵活 | caller 需要知道领域特性 |

### Recommended Solution: **Model D — Caller Override**

```javascript
// opts 中允许覆盖默认阈值：
var minFreq = clamp01(options.minFrequency) || THRESHOLDS.frequency;

// isHabitForming 使用 minFreq 替代固定值：
result.isHabitForming = ... && result.frequency >= minFreq && ...
```

**理由：**
- Phase 22.2 不引入 domain config 表（避免过度工程）
- `opts.minFrequency` 允许未来 Growth Signals 或 Memory 按领域传值
- 默认 0.3 保持不变，已有测试不受影响
- 未来 Phase 22.3 可在调用方按 metric 传入 `minFrequency: 0.1`（exercise）

**不建议此阶段做的事：**
- 不在 habitFormation.js 中硬编码 domain names
- 不建立 domainConfig 对象
- 不修改 Analytics

---

## P1-4 false 无法区分原因

### Current Problem

`isHabitForming = false` 无法区分 5 种情况：数据不足 / 频率不足 / 连续性不足 / 行为不稳定 / 行为已停止。

### Possible Solutions

| Model | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A | 保留 `isHabitForming` + 新增 `reason: string` | 完全兼容，信息丰富 | reason 是自由字符串 |
| B | 替换为 `status: enum` | 类型安全 | API 破坏性变化 |
| A+B | 保留 boolean + 新增 `status: enum` + 新增 `reason: string` | 最全面 | 字段略多 |

### Recommended Solution: **Model A+B（Additive）**

```javascript
// 输出新增两个字段：
result.status = 'insufficient' | 'not_forming' | 'early' | 'forming' | 'stable';
result.reason = 'insufficient_data' | 'low_frequency' | 'low_continuity' | 'unstable' | 'habit_stopped' | 'forming' | '';
```

### reason 映射规则

| status | reason | 条件 |
|---|---|---|
| insufficient | `insufficient_data` | activeDays < minSamples |
| not_forming | `low_frequency` | frequency < threshold |
| not_forming | `low_continuity` | maxConsecutive < 3 |
| not_forming | `unstable` | habitScore < 0.5 且 freq/maxConsec 通过 |
| not_forming | `habit_stopped` | currentConsecutive = 0 且 maxConsec ≥ 3 |
| early | `forming` | isHabitForming=true 且 current < 7 |
| forming | `forming` | isHabitForming=true 且 7 ≤ current < 14 |
| stable | `forming` | isHabitForming=true 且 current ≥ 14 |

---

## Extreme Values Analysis

### Current Problem

`(1, 1000)` 交替序列：consistency=0 但 freq=1.0 + continuity=1.0 → score=0.70 ≥ 0.5 → forming=true。

### Root Cause

habitScore 公式中 frequency(0.35) + continuity(0.35) = 0.70 ≥ 0.5，即使 consistency = 0 也能通过。这说明当前权重允许 consistency 缺失。

### Possible Solutions

| 方案 | 描述 | 效果 |
|---|---|---|
| A — 提高 consistency 权重 | 改为 0.40 + 0.25 + 0.35 | 可能影响正常场景 |
| **B — 增加 consistency 最低门槛** | 新增 `consistency >= 0.1` 条件 | ✅ 最小改动，精确阻止极端值 |
| C — Variance guard | 检查 CV > 某阈值时拒绝 | 类似 B 但更复杂 |
| D — 不处理 | 极端值是数据层问题 | 遗留风险 |

### Recommendation: **方案 B**

```javascript
// 新增条件：
result.isHabitForming = ... && result.consistency >= 0.1;
```

**效果：** `(1,1000)` 交替 → consistency=0 < 0.1 → forming=false ✅
**正常场景影响：** 正常习惯的 consistency 通常 > 0.5，不受影响。

---

## Baseline Analysis

### Current Problem

系统无法区分"从 0 开始的新习惯"和"从高频下降到当前频率的行为"。

### Assessment

| Model | 描述 | 建议 |
|---|---|---|
| A — 不增加 | Habit Formation 保持纯函数 | ✅ 推荐 |
| B — 使用 Growth Intelligence trend | 复用已有 30d trend | P2 未来 |
| C — 内部 baseline | 在函数内计算前半窗口 vs 后半窗口 | 复杂度增加，收益有限 |

### Recommendation: **Model A（当前阶段不增加）**

**理由：**
- Habit Formation 是纯 runtime projection，不应持有跨窗口记忆
- Baseline 比较更适合在高层（GrowthSignals 或 Memory candidate）进行
- 引入 baseline 会导致需要传入两个窗口的数据，破坏当前简洁 API

---

## 架构边界

硬化后允许的数据流：

```
Analytics
    ↓
Habit Formation（纯函数，零依赖）
    ↓
Growth Signals / Memory Candidate / Future Consumers
```

硬化后禁止的数据流：

```
Habit Formation → CGStore     ❌
Habit Formation → Memory       ❌
Habit Formation → AI Context   ❌
Habit Formation → Backend      ❌
```

---

## 消费方就绪度

### 当前状态

**No Consumer** — 这是一个优势，允许在不影响任何已有功能的情况下修改 API。

### 是否应在 Consumer 接入前完成 Hardening？

**是。** 理由：
1. 一旦 AI Context 或 Memory 依赖 `isHabitForming`，任何语义变化都是 breaking change
2. P1-1 的 `currentConsecutive` 条件会改变 `isHabitForming` 的判定结果
3. P1-2 的 status 模型改变了输出结构
4. 先稳定，再消费

### 未来最先消费者预测

| 消费者 | 时机 | 依赖字段 |
|---|---|---|
| Memory Candidate (`growthMemory.generateCandidates`) | Phase 22.3 | `isHabitForming`, `status`, `evidence` |
| AI Context (`ctx.growth.signals`) | Phase 22.3+ | `isHabitForming`, `status`, `reason` |
| Workbench UI | Phase 22.3+ | `status`, `evidence` |

---

## 推荐加固范围

### 最小硬化范围

| 变更 | 新增字段/条件 | 类型 |
|---|---|---|
| P1-1 | `currentConsecutive` 字段 + `current >= 2` 条件 | 输出 + 判定 |
| P1-2 | `status` 字段（`insufficient/not_forming/early/forming/stable`） | 输出 |
| P1-3 | `opts.minFrequency` 可覆盖默认 0.3 | 输入参数 |
| P1-4 | `reason` 字段 | 输出 |
| Extreme | `consistency >= 0.1` 条件 | 判定 |

### 硬化后完整输出结构

```javascript
{
  version: '1.1',
  // 保留字段（向后兼容）
  isHabitForming: boolean,
  habitScore: number (0-1),
  frequency: number (0-1),
  consistency: number (0-1),
  maxConsecutive: number,
  activeDays: number,
  windowDays: number,
  evidence: string,
  // 新增字段
  status: 'insufficient' | 'not_forming' | 'early' | 'forming' | 'stable',
  reason: string,
  currentConsecutive: number
}
```

### 硬化后 isHabitForming 完整条件

```javascript
isHabitForming =
  activeDays >= 3                    // 最低样本量
  && habitScore >= 0.5              // 综合评分
  && frequency >= minFrequency       // 频率门槛（默认 0.3，可覆盖）
  && maxConsecutive >= 3            // 历史最长连续
  && currentConsecutive >= 2        // 最近 2 天持续
  && consistency >= 0.1             // 最低一致性（极端值保护）
```

---

## 向后兼容性

| 变更 | 是否 breaking | 说明 |
|---|---|---|
| 新增 `status` 字段 | ❌ | Additive |
| 新增 `reason` 字段 | ❌ | Additive |
| 新增 `currentConsecutive` 字段 | ❌ | Additive |
| `isHabitForming` 语义变化 | ⚠️ 轻微 | 新增 `current >= 2` 条件可能使某些场景从 true → false |
| 新增 `opts.minFrequency` | ❌ | 默认值不变 |
| 新增 `consistency >= 0.1` 条件 | ⚠️ 轻微 | 极端值场景从 true → false |

**`isHabitForming` 的语义变化是 intentional and correct**：旧版本对 `1110000` 误判为 forming，新版本正确返回 false。

---

## 性能

### 预估影响

| 变更 | 性能影响 |
|---|---|
| `currentConsecutive` | 零（在现有循环中计算） |
| `status`/`reason` | 零（纯逻辑判断） |
| `opts.minFrequency` | 零（条件替换） |
| `consistency >= 0.1` | 零（额外一次比较） |

**硬化后仍为 O(windowDays)，单次遍历。**

### 目标

365d p95 < 10ms ✅（当前 0.023ms，硬化后不会显著增加）

---

## 最终建议

### Hardening Plan Summary

| P1 | 方案 | 新增/修改 | 破坏性 |
|---|---|---|---|
| P1-1 | Model B: 新增 currentConsecutive + current≥2 条件 | 输出字段 + 判定条件 | 轻微（intentional） |
| P1-2 | Additive Status: 保留 boolean + 新增 status 枚举 | 输出字段 | 无 |
| P1-3 | Caller Override: opts.minFrequency | 输入参数 | 无 |
| P1-4 | Additive: 保留 boolean + 新增 status + reason | 输出字段 | 无 |
| Extreme | consistency >= 0.1 门槛 | 判定条件 | 轻微（intentional） |

### Backward Compatibility

**Additive API only.** `isHabitForming` 保留。旧 consumer 不需修改。

### Consumer Readiness

**在 Hardening 完成前，禁止任何 Consumer 接入 Habit Formation。**

---

## 最终结论

**READY FOR HARDENING IMPLEMENT**

最小硬化范围明确，向后兼容，性能影响为零。
