# Phase 22.2 P1 修复报告

## 1. 范围

本轮只处理 `docs/PHASE_22_2_HARDENING_FINAL_AUDIT.md` 中确认的 Habit Formation P1 问题：

- P1-1：`windowDays` 窗口语义。
- P1-2：`early` 语义关系。
- P1-3：`reason` 错误归因。
- P1-4：`isHabitForming` backward compatibility。

未进入 Phase 22.3。未修改 CGStore、Sync、Backend、Memory、AI Context、Analytics、UI。未 commit，未 push。

## 2. 基线

Hardening 后代码为 v1.1，核心问题是：

- 输入序列长于 `windowDays` 时没有截断，`activeDays/frequency/maxConsecutive/currentConsecutive` 可能越过窗口。
- `early` 可能伴随 `isHabitForming=true`，也可能伴随 `isHabitForming=false`，但没有明确定义为独立状态。
- `habitScore` 不足时可能被 fallback 成 `low_frequency`。
- v1.0 的 `isHabitForming` 被收紧为额外要求 `currentConsecutive >= 2` 和 `consistency >= 0.1`，构成行为 breaking change。

Phase 22.2 原始实现报告记录的 v1.0 公式为：

```text
isHabitForming =
  activeDays >= 3
  AND habitScore >= 0.5
  AND frequency >= 0.3
  AND maxConsecutive >= 3
```

因此本轮恢复该对外布尔语义，同时保留 Hardening 新增的解释字段。

## 3. P1-1：windowDays 窗口语义

### Fix

`detectHabitFormation()` 现在先根据 `windowDays` 取最近 N 个输入观察项，再计算：

- `activeDays`
- `frequency`
- `consistency`
- `maxConsecutive`
- `currentConsecutive`
- `habitScore`
- `status`
- `reason`
- `evidence`

实现方式：

```js
var windowSeries = source.slice(Math.max(0, source.length - days));
```

`windowDays` 大于序列长度时保持既有语义：分母仍为调用方指定的 `windowDays`，实际只统计已有序列。空序列不误判。

### Verification

| Case | Result |
| --- | --- |
| 365 天全激活 + `windowDays=7` | `activeDays=7`, `frequency=1`, `maxConsecutive=7`, `currentConsecutive=7` |
| 连续跨越窗口边界 | 窗口外连续不累计 |
| `windowDays=1` | 只观察最后 1 天；激活时 `currentConsecutive=1`，但 `activeDays<3` 仍为 insufficient |
| `windowDays=length` | 与全序列等长窗口结果一致 |
| `windowDays > length` | 分母保持指定窗口，实际只统计已有观察项 |
| 空序列 | insufficient，`currentConsecutive=0` |

性能：

| Window | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| 7-in-7 | 0.0014ms | 0.0046ms | 0.3597ms |
| 30-in-30 | 0.0022ms | 0.0029ms | 0.2790ms |
| 90-in-90 | 0.0031ms | 0.0035ms | 0.1168ms |
| 365-in-365 | 0.0108ms | 0.0136ms | 0.0913ms |
| 7-in-365 | 0.0006ms | 0.0007ms | 0.0438ms |

`7-in-365` 证明长序列不再被完整扫描。

---

## 4. P1-2：early 语义

最终采用的关系：

- `early` 是当前观察阶段，不是 `isHabitForming` 的布尔等价物。
- `forming` / `stable` 必须满足恢复后的 `isHabitForming=true`。
- `early` 允许两种情况：
  - `isHabitForming=true` 且 `currentConsecutive < 7`。
  - `isHabitForming=false`，但当前已有足够趋势证据：`currentConsecutive >= 2`、`maxConsecutive >= 3`、`consistency >= 0.1`。
- `early` 不表示已确认稳定习惯，只表示早期趋势证据。

状态规则：

| status | 条件 |
| --- | --- |
| `insufficient` | `activeDays < 3` |
| `not_forming` | 当前无连续记录，或既不满足正式布尔条件也不满足早期趋势证据 |
| `early` | 存在早期趋势证据；可与 `isHabitForming=true` 或 `false` 同时出现 |
| `forming` | `isHabitForming=true` 且 `7 <= currentConsecutive < 14` |
| `stable` | `isHabitForming=true`、`currentConsecutive >= 14`、`frequency >= 0.5`、`consistency >= 0.5` |

边界测试覆盖：

- `early + isHabitForming=true`
- `early + isHabitForming=false`
- 达到正式阈值后进入 `forming`
- 数据不足时进入 `insufficient`
- 边界 frequency 下 early evidence 仍可被表达

## 5. P1-3：reason 归因

没有新增 reason 枚举，继续使用现有 `unstable` 描述综合分不足，避免扩大 API。

当前 deterministic 优先级：

1. `insufficient_data`：有效激活天数少于 3。
2. `habit_stopped`：`currentConsecutive=0` 且 `maxConsecutive >= 3`。
3. `low_frequency`：`frequency < minFrequency`。
4. `low_continuity`：`maxConsecutive < 3`。
5. `unstable`：`consistency < 0.1` 或 `habitScore < 0.5`。
6. `forming`：正式形成且一致性别名未触发质量警告。

修复验证：

- frequency 足够 + `habitScore` 不足 → `unstable`，不再返回 `low_frequency`。
- frequency 不足 → `low_frequency`。
- 多条件失败按上述固定优先级。
- 正式形成且无质量警告 → `forming`。
- 极端波动但旧布尔语义通过时 → `unstable` 作为质量警告。

## 6. P1-4：isHabitForming 兼容性

### OLD v1.0

```text
isHabitForming =
  activeDays >= 3
  AND habitScore >= 0.5
  AND frequency >= minFrequency
  AND maxConsecutive >= 3
```

### Broken v1.1

```text
... AND currentConsecutive >= 2
... AND consistency >= 0.1
```

### Fixed v1.1.1

恢复 OLD 公式。Hardening 需要的严格当前趋势判断改由 additive 字段表达：

- `currentConsecutive`
- `status`
- `reason`

回归证据：

| Input | v1.0 | broken v1.1 | fixed v1.1.1 |
| --- | --- | --- | --- |
| `1110000` | true | false | true |
| `1111101` | true | false | true |
| `[1,1,1,1,1,1,1000]` | true | false | true |

`1110000` 仍然返回 `isHabitForming=true`，但当前状态可读为：

- `currentConsecutive=0`
- `status=not_forming`
- `reason=habit_stopped`

这样对外兼容旧布尔语义，同时通过新字段提供更精确的当前趋势解释。

---

## 7. 测试

新增/更新测试覆盖：

- `windowDays` 截断最近 N 个观察项。
- 连续记录跨越窗口边界时不再越界。
- `windowDays=1`。
- `windowDays=length`。
- `windowDays > length`。
- 空序列。
- `currentConsecutive` 在 insufficient 场景仍反映窗口尾部。
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

## 8. 前端测试

```text
npm test
Test Files: 1 failed | 46 passed (47)
Tests:      1 failed | 527 passed (528)
```

唯一失败：

- File: `tests/workbenchDailyFeedback.test.js`
- Case: `adding focus updates Daily Feedback without replacing the existing toast copy`
- Status: pre-existing failure，未修改，未删除，未弱化。

## 9. 后端测试

```text
cd backend
npm test
PASS 68/68
```

## 10. 构建

```text
npm run build
PASS
```

## 11. git diff --check 结果

```text
git diff --check
PASS
```

只有仓库中既有 LF/CRLF warning，没有 whitespace error。

## 12. 回归分析

| Check | Result |
| --- | --- |
| `windowDays` 是否限制观察窗口 | PASS |
| `currentConsecutive` 是否可能越界 | PASS，最大不超过最近 N 个观察项 |
| `early` 是否存在矛盾组合 | PASS，已定义为独立观察阶段 |
| `reason` 是否错误归因 | PASS，`habitScore` 失败返回 `unstable` |
| `isHabitForming` 是否恢复兼容 | PASS，恢复 v1.0 公式 |
| 是否产生新 breaking change | 未发现 |
| 是否修改冻结架构 | 未发现 |
| 是否影响此前 Phase 20/21/22 变更 | 未发现 |
| pre-existing failure 是否扩大 | 未扩大，仍只有同一失败 |

本次修改集中在：

- `js/habitFormation.js`
- `tests/habitFormation.test.js`
- `docs/PHASE_22_2_P1_REMEDIATION_REPORT.md`

安全静态扫描未发现 Store / localStorage / sessionStorage / 网络请求 / 敏感凭证 / `innerHTML`。

---

## 13. 剩余 P2

以下问题本轮未扩大处理：

1. `windowDays` 为负数或 NaN 时不抛错，但语义仍依赖 fallback 规则。
2. 非有限 value 仍按现有 `num()` 规则处理，后续可考虑显式拒绝。
3. `minFrequency` 的 `.24 / .25 / .26` 与 `.29 / .30 / .31` 三点边界测试尚未完整覆盖。
4. 模块仍不识别日历缺失日期，调用方必须保证传入连续观察日序列。
5. 文档仍应进一步区分 structural compatibility 与 behavioral compatibility。
6. 历史 `isHabitForming=true` 但 `currentConsecutive=0` 的组合属于兼容性行为，消费者必须理解布尔表示历史信号，`status/currentConsecutive` 表示当前趋势。

## 14. 最终建议

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

本报告不宣布进入 Phase 22.3；是否 READY FOR PHASE 22.3 必须由独立复审确认。
