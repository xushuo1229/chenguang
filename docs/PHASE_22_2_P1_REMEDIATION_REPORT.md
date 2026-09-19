# 阶段 22.2 P1 修复报告

# 1. 范围

Cette session traite uniquement des problèmes Habit Formation P1 confirmés dans `docs/PHASE_22_2_HARDENING_FINAL_AUDIT.md` :

- P1-1：`windowDays` 窗口语义。
- P1-2：`early` 语义关系。
- P1-3：`reason` 错误归因。
- P1-4：`isHabitForming` 向后兼容。

Not entered Phase 22.3. CGStore, Sync, Backend, Memory, AI Context, Analytics, UI not modified. Not committed, not pushed.

# 2. 基线

Hardening 后代码为 v1.1，核心问题是：

- 输入序列长于 `windowDays` 时没有截断，`activeDays/frequency/maxConsecutive/currentConsecutive` 可能越过窗口。
- `early` may be accompanied by `isHabitForming=true`, or it may be accompanied by `isHabitForming=false`, but it is not clearly defined as an independent state.
- When `habitScore` is insufficient, it may be fallback to `low_frequency`.
- In v1.0, `isHabitForming` is tightened to additionally require `currentConsecutive >= 2` and `consistency >= 0.1`, constituting a behavioral breaking change.

Phase 22.2 原始实现报告记录的 v1.0 公式为：

```text
isHabitForming =
  activeDays >= 3
  AND habitScore >= 0.5
  AND frequency >= 0.3
  AND maxConsecutive >= 3
```

因此本轮恢复该对外布尔语义，同时保留 Hardening 新增的解释字段。

# 3. P1-1：windowDays 窗口语义

## Fix

`detectHabitFormation()` 现在先根据 `windowDays` 取最近 N 个输入观察项，再计算：

- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]

实现方式：

```js
var windowSeries = source.slice(Math.max(0, source.length - days));
```

`windowDays` 大于序列长度时保持既有语义：分母仍为调用方指定的 `windowDays`，实际只统计已有序列。空序列不误判。

## 验证

| 案例 | 结果 |
| --- | --- |
| 365 天全激活   `windowDays=7` | `activeDays=7`，`frequency=1`，`maxConsecutive=7`，`currentConsecutive=7` |
| 连续跨越窗口边界 | 窗口外连续不累计 |
| `windowDays=1` | Only observe the last 1 day; activated at `currentConsecutive=1`, but `activeDays<3` is still insufficient |
| `windowDays=length` | 与全序列等长窗口结果一致 |
| `windowDays > length` | 分母保持指定窗口，实际只统计已有观察项 |
| 空序列 | 不足，`currentConsecutive=0` |

性能：

| 窗口 | p50 | p95 | 最大 |
| --- | ---: | ---: | ---: |
| 7合7 | 0.0014毫秒 | 0.0046毫秒 | 0.3597毫秒 |
| 30合30 | 0.0022毫秒 | 0.0029毫秒 | 0.2790毫秒 |
| 90合90 | 0.0031毫秒 | 0.0035毫秒 | 0.1168毫秒 |
| 365合365 | 0.0108毫秒 | 0.0136毫秒 | 0.0913毫秒 |
| 7合365 | 0.0006毫秒 | 0.0007毫秒 | 0.0438毫秒 |

`7-in-365` 证明长序列不再被完整扫描。

- --

# 4. P1-2：early 语义

最终采用的关系：

- `early` 是当前观察阶段，不是 `isHabitForming` 的布尔等价物。
- `forming` / `stable` 必须满足恢复后的 `isHabitForming=true`。
- `early` 允许两种情况：
  - `isHabitForming=true` 且 `currentConsecutive < 7`。
  - `isHabitForming=false`，但当前已有足够趋势证据：`currentConsecutive >= 2`、`maxConsecutive >= 3`、`consistency >= 0.1`。
- `early` 不表示已确认稳定习惯，只表示早期趋势证据。

状态规则：

| 状态 | 条件 |
| --- | --- |
| [[代码0]] | [[代码1]] |
| `not_forming` | 当前无连续记录，或既不满足正式布尔条件也不满足早期趋势证据 |
|`early` |存在早期趋势证据;可与 `isHabitForming=true` 或 `false` 同时出现 |
|`forming` |`isHabitForming=true` 且 `7 <= currentConsecutive < 14` |
|`stable` |`isHabitForming=true`、`currentConsecutive >= 14`、`frequency >= 0.5`、`consistency >= 0.5` |

边界测试覆盖：

- `early + isHabitForming=true`
- `early + isHabitForming=false`
- 达到正式阈值后进入 `forming`
- 数据不足时进入 `insufficient`
- 边界 频率 下 早期证据 仍可被表达

# 5. P1-3：原因归因

没有新增 reason 枚举，继续使用现有 `unstable` 描述综合分不足，避免扩大 API。

当前确定性优先级：

1. `insufficient_data`：有效激活天数少于 3。
2. `habit_stopped`：`currentConsecutive=0` 且 `maxConsecutive >= 3`。
3. `low_frequency`：`frequency < minFrequency`。
4. `low_continuity`：`maxConsecutive < 3`。
5. `unstable`：`consistency < 0.1` 或 `habitScore < 0.5`。
6. `forming`：正式形成且一致性别名未触发质量警告。

修复验证：

- frequency 足够   `habitScore` 不足 → `unstable`，不再返回 `low_frequency`。
- frequency 不足 → `low_frequency`。
- 多条件失败按上述固定优先级。
- 正式形成且无质量警告 → `forming`。
- 极端波动但旧布尔语义通过时 → `unstable` 作为质量警告。

# 6. P1-4：isHabitForming 兼容性

## 旧 v1.0

```text
isHabitForming =
  activeDays >= 3
  AND habitScore >= 0.5
  AND frequency >= minFrequency
  AND maxConsecutive >= 3
```

## 损坏 v1.1

```text
... AND currentConsecutive >= 2
... AND consistency >= 0.1
```

## 修复 v1.1.1

恢复 OLD 公式。Hardening 需要的严格当前趋势判断改由 additive 字段表达：

- [[代码0]]
- [[代码0]]
- [[代码0]]

回归证据：

| 输入 | v1.0 | 破损 v1.1 | 修复 v1.1.1 |
| --- | --- | --- | --- |
| `1110000` | 真 | 假 | 真 |
| `1111101` | 真 | 假 | 真 |
| `[1,1,1,1,1,1,1000]` | 真 | 假 | 真 |

`1110000` 仍然返回 `isHabitForming=true`，但当前状态可读为：

- [[代码0]]
- [[代码0]]
- [[代码0]]

这样对外兼容旧布尔语义，同时通过新字段提供更精确的当前趋势解释。

- --

# 7. 测试

新增/更新测试覆盖：

- `windowDays` 截断最近 N 个观察项。
- 连续记录跨越窗口边界时不再越界。
- `windowDays=1`。
- `windowDays=length`。
- `windowDays > length`。
- 空序列。
- `currentConsecutive` 在 insufficient 场景仍显示在窗口尾部。
- `early + isHabitForming=true`。
- `early + isHabitForming=false`。
- `forming` / `stable` 正式阈值。
- `habitScore` 不足时返回 `unstable`。
- frequency 不足返回 `low_frequency`。
- 多条件失败优先级。
- v1.0 布尔行为回归：
  - 历史连续后中断。
  - 尾部只有 1 天激活。
  - 极端波动但仍满足旧公式。
- 365 天性能 p95 < 5ms。

目标测试结果：

```text
npx vitest run tests/habitFormation.test.js
PASS 36/36
```

# 8. 前端测试

```text
npm test
Test Files: 1 failed | 46 passed (47)
Tests:      1 failed | 527 passed (528)
```

唯一失败：

- 文件：`tests/workbenchDailyFeedback.test.js`
- 案例：`adding focus updates Daily Feedback without replacing the existing toast copy`
- 状态：已存在的失败，未修改，未删除，未弱化。

# 9. 后端测试

```text
cd backend
npm test
PASS 68/68
```

# 10. 构建

```text
npm run build
PASS
```

# 11. git diff --check 结果

```text
git diff --check
PASS
```

Only the warehouse has LF/CRLF warnings, no whitespace errors.

# 12. 回归分析

| 检查 | 结果 |
| --- | --- |
| `windowDays` 是否限制观察窗口 | 通过 |
| `currentConsecutive` 是否可能越界 | PASS，最大不超过最近 N 个观察项 |
| `early` 是否存在矛盾组合 | PASS，已定义为独立观察阶段 |
| `reason` 是否错误归因 | PASS，`habitScore` 失败返回 `unstable` |
| `isHabitForming` 是否恢复兼容 | PASS，恢复 v1.0 公式 |
| 是否产生新 breaking change | 未发现 |
| 是否修改冻结架构 | 未发现 |
| 是否影响此前 Phase 20/21/22 变更 | 未发现 |
|Preexisting failure 是否扩大 |未扩大，仍只有同一失败 |

本次修改集中在：

- [[代码0]]
- [[代码0]]
- [[代码0]]

Security static scan did not find Store / localStorage / sessionStorage / network requests / sensitive credentials / `innerHTML`.

- --

# 13. 剩余 P2

以下问题本轮未扩大处理：

1. `windowDays` 为负数或 NaN 时不抛错，但语义仍依赖 fallback 规则。
2. 非有限 value 仍按现有 `num()` 规则处理，后续可考虑显式拒绝。
3. `minFrequency` 的 `.24 / .25 / .26` 与 `.29 / .30 / .31` 三点边界测试尚未完整覆盖。
4. 模块仍不识别日历缺失日期，调用方必须保证传入连续观察日序列。
5. The document should still further distinguish between structural compatibility and behavioral compatibility.
6. 历史 `isHabitForming=true` 但 `currentConsecutive=0` 的组合属于兼容性行为，消费者必须理解布尔表示历史信号，`status/currentConsecutive` 表示当前趋势。

# 14. 最终建议

```text
READY_FOR_REAUDIT
```

理由：

- Final Audit 的 4 项 P1 均已处理。
- Habit Formation 目标测试 36/36 通过。
- Frontend 未出现新失败，仍只有已确认的 pre-existing failure。
- Backend 68/68 通过。
- Build PASS。
- `git diff --check` PASS。
- 架构冻结边界未被修改。
- 长序列窗口投影复杂度和结果语义已验证。

This report does not declare entry into Phase 22.3; whether it is READY FOR PHASE 22.3 must be confirmed by an independent review.
