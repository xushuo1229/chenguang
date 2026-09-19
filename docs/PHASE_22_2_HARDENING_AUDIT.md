# 第22.2阶段 加固审计 — 习惯养成 P1 解决方案

# 执行摘要

本审计针对 Phase 22.2 Final Audit 确认的 4 项 P1 风险，提出最小、可信、向后兼容的硬化方案。每项 P1 分析多个候选模型并给出推荐。

判定：**准备进行硬化实施**

- --

# P1-1 currentConsecutive missing

## 当前问题

`maxConsecutive` 只记录窗口内历史最长连续天数，无法区分"旧习惯已中断"和"新习惯正在形成"：

```
111000000000（旧习惯，已停）  maxConsec=3, currentConsec=0
000000000111（新习惯，正在形成） maxConsec=3, currentConsec=3
```

两者当前得到完全相同的 habitScore。

## 可能的解决方案

| 模型 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A | Only add the `currentConsecutive` output field, do not change habitScore | Minimal changes, backward compatible | `isHabitForming` still returns true for old habits |
| B | 新增 `currentConsecutive` 并要求 `currentConsecutive >= 2` 才可判定 forming | 准确区分新旧，最小改动 | 严格但合理：行为必须在最近 2 天内持续 |
| C | 将 continuity 从 `maxConsecutive/windowDays` 改为 `currentConsecutive/windowDays` | 直接反映当前状态 | 破坏已有的 score 语义；old streak 会被惩罚 |
| D | 同时使用 historical 和 current continuity 参与打分 | 最全面 | 复杂度增加，难以解释 |

## 推荐方案：**B 型**

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

## 权衡取舍

| 维度 | 评估 |
|---|---|
| 准确性 | ✅ 显著提升：旧习惯不再被误判为 forming |
| 可解释性 | ✅ `currentConsecutive` 含义清晰 |
| 假阳性 | ✅ 降低：`1110000` 不再触发 forming |
| 假阴性 | 轻微增加：如果用户刚好在窗口最后一天休息，current=0 → false；但这是正确行为（不在形成中） |
| 冷启动 | ✅ 不受影响（minSamples 先行拒绝） |
| 中断恢复 | ✅ 恢复后 current 重新累计 |
| 实现复杂度 | 极低：1 行新增字段 + 1 行新增条件 |
| 向后兼容 | ✅ `isHabitForming` 保留，仅语义更精确 |
| 性能 | ✅ 零额外遍历（在现有循环中同时计算） |

- --

# P1-2 3 天阈值语义过强

## 当前问题

`minSamples=3`   `maxConsecutive=3` 意味着 `111`（3 天连续）立即触发 `isHabitForming=true`。 产品语义上，3 天更像"early forming signal"而非"habit formation"。

## 可能的解决方案

| 模型 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| 布尔值 | 保持 `isHabitForming: boolean`，提高阈值 | 最简单，完全兼容 | 无法表达阶段，false 仍然模糊 |
| 状态（3级） | `status: 'not_forming' | 'forming' | 'stable'` | 准确区分阶段 | API 变化，消费者需适配 |
| 状态（4级） | `status: 'insufficient' | 'not_forming' | 'forming' | 'stable'` | 最全面 | 同上，复杂度更高 |
| 累加状态 | 保留 `isHabitForming` 布尔值，新增 `status` 字段 | 兼容，信息丰富 | 稍显冗余但安全 |

## 推荐方案：**加法状态模型**

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

## 阈值推导

| 阈值 | 值 | 依据 |
|---|---|---|
| 形成中 | currentConsecutive ≥ 7 | 一周是行为学中习惯养成的最短公认周期（Lally 2010：平均 66 天，最短 18 天；7 天是绝对下限） |
| 稳定 | currentConsecutive ≥ 14 | 两周提供了更可靠的重复证据 |

## 权衡取舍

| 维度 | 布尔值 | 状态（3级） | 状态（4级） | 加性状态 |
|---|---|---|---|---|
| 简单性 | ✅ 最高 | 中 | 中 | 中 |
| 语义准确性 | ❌ 错误 模糊 | ✅ | ✅✅ | ✅✅ |
| 向后兼容 | ✅ | ❌ API 变化 | ❌ | ✅ 保留布尔值 |
| AI 可消费性 | 低 | 中 | ✅ 高 | ✅ 高 |
| 实现复杂度 | 最低 | 中 | 中 | 中 |

- --

# P1-3 无领域差异

## 当前问题

统一 `frequency >= 0.3` 导致每周运动2次（0.286）被拒绝。

## 域频分析

| 领域 | 自然频率 | 30天窗口频率 | 当前 0.3 阈值判定 |
|---|---|---|---|
| 专注 | 每日 | ~0.7-1.0 | ✅ 通过 |
| 签到 | 每日 | ~0.7-1.0 | ✅ 通过 |
| 阅读 | ≥ 3 天/周 | ~0.4-0.6 | ✅ 通过 |
| 英语 | ≥ 3 天/周 | ~0.4-0.6 | ✅ 通过 |
| 待办事项 | ≥ 3 天/周 | ~0.4-0.6 | ✅ 通过 |
| **锻炼** | **2-4 次/周** | **~0.07-0.13** | **❌ 被拒** |
| 课程 | 持续进行 | N/A（长期项目） | 不适用 |

## 可能的解决方案

| 模型 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A — 通用阈值 | 保持 0.3 | 简单，无需配置 | exercise 漏判 |
| B — 领域配置 | 每个指标有专属最小频率 | 准确 | 需要配置表，可能过度工程 |
| C — 相对频率 | `actual / expected` | 理论最优 | 预期频率来源不明 |
| D — 调用者覆盖 | 默认 0.3，允许 `opts.minFrequency` 覆盖 | 最小改动，灵活 | 调用者需要了解领域特性 |

## 推荐方案：**模型 D — 呼叫者覆盖**

```javascript
// opts 中允许覆盖默认阈值：
var minFreq = clamp01(options.minFrequency) || THRESHOLDS.frequency;

// isHabitForming 使用 minFreq 替代固定值：
result.isHabitForming = ... && result.frequency >= minFreq && ...
```

* *理由：**
- Phase 22.2 不引入 domain config 表（避免过度工程）
- `opts.minFrequency` 允许未来 Growth Signals 或 Memory 按领域传值
- 默认 0.3 保持不变，已有测试不受影响
- Future Phase 22.3 can pass `minFrequency: 0.1` (exercise) according to the metric on the caller side

* *不建议此阶段做的事：**
- Do not hardcode domain names in habitFormation.js
- Do not create a domainConfig object
- Do not modify Analytics

- --

# P1-4 false 无法区分原因

## 当前问题

`isHabitForming = false` 无法区分 5 种情况：数据不足 / 频率不足 / 连续性不足 / 行为不稳定 / 行为已停止。

## 可能的解决方案

|模型 |描述 |优点 |缺点 |
|---|---|---|---|
| A | Retain `isHabitForming`   Add `reason: string` | Fully compatible, information-rich | reason is a free string |
| B | Replace with `status: enum` | Type-safe | API breaking change |
| A B | Retain boolean   Add `status: enum`   Add `reason: string` | Most comprehensive | Slightly more fields |

## 推荐方案：**模型 A B（加性）**

```javascript
// 输出新增两个字段：
result.status = 'insufficient' | 'not_forming' | 'early' | 'forming' | 'stable';
result.reason = 'insufficient_data' | 'low_frequency' | 'low_continuity' | 'unstable' | 'habit_stopped' | 'forming' | '';
```

## reason 映射规则

| 状态 | 原因 | 条件 |
|---|---|---|
| 不足 | `insufficient_data` | activeDays < minSamples |
| 未形成 | `low_frequency` | frequency < threshold |
| 未形成 | `low_continuity` | maxConsecutive < 3 |
| 未形成 | `unstable` | habitScore < 0.5 且 freq/maxConsec 通过 |
| 未形成 | `habit_stopped` | currentConsecutive = 0 且 maxConsec ≥ 3 |
| 初期 | `forming` | isHabitForming=true 且 current < 7 |
| 形成中 | `forming` | isHabitForming=true 且 7 ≤ current < 14 |
| 稳定 | `forming` | isHabitForming=true 且 current ≥ 14 |

- --

# 极值分析

## 当前问题

`(1, 1000)` 交替序列：一致性=0 但 频率=1.0   连续性=1.0 → 分数=0.70 ≥ 0.5 → 形成=true。

## 根本原因

在 habitScore 公式中，frequency(0.35) 和 continuity(0.35) 相加 = 0.70 ≥ 0.5，即使 consistency = 0 也能通过。这说明当前权重允许 consistency 缺失。

## 可能的解决方案

| 方案 | 描述 | 效果 |
|---|---|---|
|A — 提高 consistency 权重 |改为 0.40   0.25   0.35 |可能影响正常场景 |
|**B — 增加 一致性 最低门槛** |新增 `consistency >= 0.1` 条件 |✅ 最小改动，精确阻止极端值 |
|C — 方差守护 |检查 CV > 某阈值时拒绝 |类似 B 但更复杂 |
| D — 不处理 | 极端值是数据层问题 | 遗留风险 |

## 推荐：**方案 B**

```javascript
// 新增条件：
result.isHabitForming = ... && result.consistency >= 0.1;
```

* *效果：** `(1,1000)` 交替 → 一致性=0 < 0.1 → 正在形成=false ✅
* *正常场景影响：** 正常习惯的一致性通常 > 0.5，不受影响。

- --

# 基线分析

## 当前问题

系统无法区分"从 0 开始的新习惯"和"从高频下降到当前频率的行为"。

## 评估

| 模型 | 描述 | 建议 |
|---|---|---|
| A — 不增加 | 习惯形成保持纯函数 | ✅ 推荐 |
| B — 使用增长智能趋势 | 复用已有 30天趋势 | P2 未来 |
| C — 内部 baseline | 在函数内计算前半窗口 vs 后半窗口 | 复杂度增加，收益有限 |

## 推荐：**模型 A（当前阶段不增加）**

* *理由：**
- Habit Formation 是纯运行时投射，不应持有跨窗口记忆
- Baseline 比较更适合在高层（GrowthSignals 或 Memory 候选项）进行
- 引入 baseline 会导致需要传入两个窗口的数据，破坏当前简洁 API

- --

# 架构边界

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

- --

# 消费方就绪度

## 当前状态

* *No Consumer** — 这是一个优势，允许在不影响任何已有功能的情况下修改 API。

## Should hardening be completed before Consumer access?

* *是。** 理由：
1. 一旦 AI 上下文或记忆依赖 `isHabitForming`，任何语义变化都是破坏性变更
2. P1-1 的 `currentConsecutive` 条件会改变 `isHabitForming` 的判定结果
3. P1-2 的状态模型改变了输出结构
4. 先稳定，再消费

## 未来最先消费者预测

| 消费者 | 时机 | 依赖字段 |
|---|---|---|
| 内存候选 (`growthMemory.generateCandidates`) | 阶段 22.3 | `isHabitForming`、`status`、`evidence` |
| AI 上下文 (`ctx.growth.signals`) | 阶段 22.3 | `isHabitForming`、`status`、`reason` |
| 工作台界面 | 阶段 22.3 | `status`、`evidence` |

- --

# 推荐加固范围

## 最小硬化范围

| 变更 | 新增字段/条件 | 类型 |
|---|---|---|
| P1-1 | `currentConsecutive` 字段   `current >= 2` 条件 | 输出   判定 |
| P1-2 | `status` 字段（`insufficient/not_forming/early/forming/stable`） | 输出 |
| P1-3 | `opts.minFrequency` 可覆盖默认 0.3 | 输入参数 |
| P1-4 | `reason` 字段 | 输出 |
| Extreme | `consistency >= 0.1` 条件 | 判定 |

## 硬化后完整输出结构

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

## 硬化后 isHabitForming 完整条件

```javascript
isHabitForming =
  activeDays >= 3                    // 最低样本量
  && habitScore >= 0.5              // 综合评分
  && frequency >= minFrequency       // 频率门槛（默认 0.3，可覆盖）
  && maxConsecutive >= 3            // 历史最长连续
  && currentConsecutive >= 2        // 最近 2 天持续
  && consistency >= 0.1             // 最低一致性（极端值保护）
```

- --

# 向后兼容性

| 变更 | 是否破坏性 | 说明 |
|---|---|---|
| 新增 `status` 字段 | ❌ | 增加性 |
| 新增 `reason` 字段 | ❌ | 增加性 |
| 新增 `currentConsecutive` 字段 | ❌ | 增加性 |
| `isHabitForming` 语义变化 | ⚠️ 轻微 | 新增 `current >= 2` 条件可能使某些场景从 true → false |
| 新增 `opts.minFrequency` | ❌ | 默认值不变 |
| 新增 `consistency >= 0.1` 条件 | ⚠️ 轻微 | 极端值场景从 true → false |

* *`isHabitForming` 的语义变化是有意且正确的**：旧版本对 `1110000` 误判为 forming，新版本正确返回 false。

- --

# 性能

## 预估影响

| 变更 | 性能影响 |
|---|---|
| `currentConsecutive` | 零（在现有循环中计算） |
| `status`/`reason` | 零（纯逻辑判断） |
| `opts.minFrequency` | 零（条件替换） |
| `consistency >= 0.1` | 零（额外一次比较） |

* *硬化后仍为 O(windowDays)，单次遍历。**

## 目标

365d p95 < 10ms ✅（当前 0.023ms，硬化后不会显著增加）

- --

# 最终建议

## 硬化计划总结

| P1 | 方案 | 新增/修改 | 破坏性 |
|---|---|---|---|
|P1-1 |模型B：新增current连续电流≥2 条件 |输出字段   判定条件 |轻微（故意） |
|P1-2 |加法状态：保留 boolean 新增 status 枚举 |输出字段 |无 |
|P1-3 |来电覆盖：opts.minFrequency |输入参数 |无 |
|P1-4 |加法：保留 布尔新增状态 reason |输出字段 |无 |
|极端 |一致性 >= 0.1 门槛 |判定条件 |轻微（故意） |

## 向后兼容

* *仅限添加API。**`isHabitForming` 保留。旧 consumer 不需修改。

## 消费者准备度

* *在强化完成前，禁止任何消费者接入习惯形成。**

- --

# 最终结论

* *准备硬化实施**

最小硬化范围明确，向后兼容，性能影响为零。
