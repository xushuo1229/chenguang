# Phase 22.3 · Habit Formation Architecture Freeze

## 1. 阶段目标

Phase 22.3 只强化 Habit Formation 的契约确定性、输入边界、异常数据处理和结果可解释性。

本阶段不新增习惯形成能力，不新增第二套算法，不扩展 Memory，不新增持久化，不改变 AI 能力。

当前冻结版本：

```text
Habit Formation v1.2
```

## 2. 核心数据流

Habit Formation 保持纯派生模块：

```text
Raw Observations
  ↓
Observation Contract
  ↓
Window Projection
  ↓
Metrics
  ↓
State Derivation
  ↓
Evidence
```

模块输出仍然是派生结果，不写入用户数据。

## 3. Observation Contract

### 3.1 日期契约

- 严格支持 `YYYY-MM-DD` 字符串。
- 本地 `Date` 会转换为本地日期键。
- 非法日期、非字符串、非法 `Date` 均排除。
- 无效日期不计入指标。
- 当最终结果仍基于有效观察生成时，`evidence` 必须说明已排除无效记录。

### 3.2 数值契约

- `value` 通过 `Number()` 转换。
- `NaN`、`Infinity`、`-Infinity` 按不活跃观察处理。
- 只有 `value > 0` 计入活跃天数。
- 非有限值不得污染 `frequency`、`consistency`、`habitScore`、`status`、`reason` 或 `evidence`。

### 3.3 日期乱序

观察输入顺序不改变领域结果。实现必须先按日期键排序，再计算连续性和指标。

### 3.4 重复日期

重复日期按最后一条值合并。

重复观察不得增加：

- `activeDays`
- `frequency`
- `currentConsecutive`
- `maxConsecutive`

`evidence` 需要说明已合并重复记录。

### 3.5 缺失日期

连续性按真实日历日期判断。缺失日期会中断 streak，不得静默视为连续数据。

覆盖率使用真实日期跨度参与计算：

```text
coverageDays = max(windowDays, realDateSpan)
```

这是预期日历语义。

### 3.6 未来日期

只有传入有效 `opts.today` 时，才过滤晚于 `today` 的观察。

`opts.today` 无效时不启用未来日期过滤。该行为是 v1.2 的明确边界行为，不得假设系统当前日期。

如果未来记录被过滤，`evidence` 需要说明。

## 4. Window Projection

`windowDays` 定义观察窗口，所有习惯指标只从窗口内派生。

确定行为：

- `windowDays = 1`：只观察最后 1 条。
- `windowDays = N`：只观察最后 N 条。
- `windowDays > sequence.length`：窗口保持调用方指定值，实际只统计已有观察。
- empty sequence：窗口为 `1`。
- `windowDays < 1`：回退到 `source.length || 1`。
- `windowDays = NaN / Infinity / -Infinity`：回退到 `source.length || 1`。
- 非整数：向下取整，最小为 `1`。

禁止读取窗口外历史数据。

## 5. Metrics Contract

窗口内继续派生：

```text
frequency
consistency
maxConsecutive
currentConsecutive
habitScore
```

`frequency`：

```text
activeDays / coverageDays
```

`habitScore` 继续使用既有权重：

```text
frequency × 0.35
+ consistency × 0.30
+ continuity × 0.35
```

禁止新增第二套评分系统。

## 6. State Contract

状态字段：

```text
isHabitForming
early
status
reason
```

### 6.1 `isHabitForming`

保持 v1.0 backward-compatible 语义：

```text
habitScore >= 0.5
&& frequency >= minFrequency
&& maxConsecutive >= 3
```

以下字段不得成为新的 breaking boolean gate：

- `currentConsecutive`
- `consistency`

### 6.2 `early`

`early` 是独立 observation stage，不等价于 `!isHabitForming`。

允许：

```text
early + isHabitForming=true
early + isHabitForming=false
```

### 6.3 `forming` / `stable`

以下状态只能在 `isHabitForming === true` 时出现：

```text
forming
stable
```

## 7. Reason Precedence

`reason` 保持稳定优先级：

1. `habit_stopped`：当前连续为 0，且窗口内 `maxConsecutive >= 3`。
2. `low_frequency`：频率低于实际 `minFrequency`。
3. `low_continuity`：`maxConsecutive < 3`。
4. `unstable`：一致性或综合分不足。
5. `forming`：习惯形成中。

如果真正阻塞原因是 `habitScore` 不足，不得错误归因为 `low_frequency`。

## 8. Evidence Contract

`evidence` 是派生解释，不是持久化数据，也不是第二套评分系统。

它必须解释当前状态中实际发生的观察处理，包括：

- 有效记录数量；
- 当前连续记录；
- 早期趋势；
- 合并的重复记录；
- 排除的无效记录；
- 排除的未来记录。

禁止输出内部技术字段名或敏感信息。

## 9. `minFrequency` Contract

`minFrequency` 使用包含边界的比较：

```text
frequency >= minFrequency
```

传入值会被 clamp 到 `0-1`。

必须保持以下边界行为：

```text
0
低于默认阈值
等于阈值
高于阈值
1
大于 1
```

`minFrequency` 只影响频率门槛及依赖该门槛的判断，不得改变核心指标计算公式。

## 10. Frozen Boundaries

以下边界冻结：

- CGStore 语义、写入方法、revision 行为和 schema 禁止修改。
- Sync 协议、revision、冲突处理和同步 payload 禁止修改。
- Analytics canonical truth 禁止迁移或重写。
- Backend API、JWT、SQLite schema 和 payload contract 禁止修改。
- AI Context、AI Provider 和 AI Prompt 架构禁止重构。
- UI、页面结构、组件体系和交互流程禁止修改。
- 数据库、数据模型、localStorage schema 和 Sync schema 禁止修改。

禁止把 Habit Formation 结果写入：

- `user.memory`
- Store
- localStorage
- Backend
- AI Context

禁止自动写 Memory。AI 只读边界保持不变。

## 11. Performance Constraint

投影必须受 `windowDays` 约束：

```text
O(windowDays)
```

禁止扫描全部历史，禁止 `O(total-history)`，禁止为窗口投影建立全局历史索引或缓存层。

365 天数据规模下，目标测试保持 p95 < 5ms。

## 12. Phase Boundary

Phase 22.3 只做契约强化。

禁止提前实现 Phase 22.4 或后续能力，包括：

- 新习惯建议系统；
- 新 UI 展示；
- 新 Memory 类型；
- 新 AI Context 字段；
- 新画像系统；
- Embedding；
- 向量数据库；
- 通知系统；
- 新持久化事件表。

任何后续扩展必须先进入独立 Audit。
