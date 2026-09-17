# Phase 22.2 Final Re-Audit

## 1. Audit Scope

本次为只读终审，基于当前工作区重新验证 Phase 22.2 Habit Formation v1.1.1。

审查范围：

- `js/habitFormation.js`
- `tests/habitFormation.test.js`
- `docs/PHASE_22_2_P1_REMEDIATION_REPORT.md`
- Phase 22.2 Hardening 前后语义
- 当前工作区中的既有 Phase 20 / 21 / 22 变更

本轮未修改生产代码、测试、既有文档、pre-existing failure，未 commit，未 push，也未进入 Phase 22.3。

## 2. P1-1 Verification

结论：**已关闭**。

`detectHabitFormation()` 现在先取最近 `windowDays` 个观察项，再计算全部投影字段：

```js
var windowSeries = source.slice(Math.max(0, source.length - days));
```

位置：`js/habitFormation.js:36`。

验证结果：

| 场景 | 结果 |
| --- | --- |
| 365 天全激活 + `windowDays=7` | `activeDays=7`、`frequency=1`、`maxConsecutive=7`、`currentConsecutive=7` |
| 前 360 天连续，最后 7 天为 `25,25,25,25,25,0,0` | `activeDays=5`、`maxConsecutive=5`、`currentConsecutive=0` |
| 前 360 天存在活跃记录，最后 7 天为 `25,0,25,25,25,0,0` | `activeDays=4`、`maxConsecutive=3`、`currentConsecutive=0` |
| `windowDays=1` | 只观察最后 1 天；激活时 `currentConsecutive=1`，但 `activeDays<3` 仍为 insufficient |
| 空序列 | insufficient，`currentConsecutive=0` |

`frequency`、`consistency`、`currentConsecutive`、`habitScore`、`status`、`reason`、`evidence` 均基于截断后的窗口计算，未发现越界残留。

## 3. P1-2 Verification

结论：**已关闭**。

`early` 已定义为独立 observation stage，不要求与 `isHabitForming` 互斥：

| 场景 | isHabitForming | status | 判定 |
| --- | --- | --- | --- |
| 最近连续 3 天，满足旧布尔公式 | true | early | PASS |
| 最近连续 3 天，但 frequency 低于 0.4 | false | early | PASS |
| 最近连续 7 天 | true | forming | PASS |
| 最近连续 14 天 | true | stable | PASS |
| 历史连续 3 天但当前中断 | true | not_forming | PASS |

`forming` 与 `stable` 均位于 `result.isHabitForming === true` 分支内；`early` 可以表达“已满足旧布尔语义但当前证据较短”，也可以表达“存在早期趋势但尚未达到正式布尔阈值”。该组合符合当前设计，不是矛盾状态。

## 4. P1-3 Verification

结论：**已关闭**。

当前 reason 优先级固定：

1. `insufficient_data`
2. `habit_stopped`
3. `low_frequency`
4. `low_continuity`
5. `unstable`
6. `forming`

`deriveNegativeReason()` 在 `habitScore < 0.5` 或 `consistency < 0.1` 时返回 `unstable`，不再 fallback 到 `low_frequency`。位置：`js/habitFormation.js:131`。

验证结果：

- frequency 达到阈值、`habitScore=0.419` 不足时：`reason=unstable`，不是 `low_frequency`。
- frequency 不足：`reason=low_frequency`。
- 历史连续但当前中断：`reason=habit_stopped`。
- 正式形成且无质量警告：`reason=forming`。

多条件失败时优先级稳定，reason 与实际失败状态一致。

## 5. P1-4 Compatibility Verification

结论：**已关闭**。

v1.0 对外语义已恢复：

```text
isHabitForming =
  activeDays >= 3
  AND habitScore >= 0.5
  AND frequency >= minFrequency
  AND maxConsecutive >= 3
```

当前实现不再将 `currentConsecutive >= 2` 作为布尔门槛，也不再要求 `isHabitForming` 必须满足 `consistency >= 0.1`。这些更严格的当前趋势证据只保留在 `currentConsecutive`、`status`、`reason` 等 additive 字段中。

对比验证：

| Case | v1.0 | v1.1 broken | v1.1.1 current |
| --- | --- | --- | --- |
| `1110000` | true | false | true |
| `1111101` | true | false | true |
| `[1,1,1,1,1,1,1000]` | true | false | true |

额外执行 600 个随机样本对比，覆盖 7 / 14 / 30 天窗口，当前 `isHabitForming` 与 v1.0 公式结果 mismatch 数量为 0。当前仓库也没有生产调用方，因此既有调用方不会因 Hardening 改变布尔结果。

## 6. Regression Test Results

| 层级 | Command | Result |
| --- | --- | --- |
| Habit Formation | `npx vitest run tests/habitFormation.test.js` | PASS 36/36 |
| Frontend | `npm test` | 527 passed / 1 failed |
| Backend | `cd backend && npm test` | PASS 68/68 |

Frontend 唯一失败为已知 pre-existing failure，详见第 9 节。

## 7. Build / Diff Check

| Check | Result |
| --- | --- |
| `npm run build` | PASS |
| `git diff --check` | PASS |

`git diff --check` 只有既有 LF/CRLF warning，没有 whitespace error。

## 8. Architecture Verification

Phase 22.2 相关生产代码仅集中在 `js/habitFormation.js`。该模块：

- 无 CGStore 写入。
- 无 Sync 修改。
- 无 Backend 修改。
- 无 Memory schema 修改。
- 无 AI Context 修改。
- 无 Analytics 修改。
- 无 UI 修改。
- 无生产调用方。
- 无 `localStorage` / `sessionStorage` / 网络请求 / 敏感凭证处理。

当前工作区仍包含此前 Phase 20 / 21 / 22 的未提交变更。这些属于历史工作区状态，未归因于 Phase 22.2。除本终审报告外，本轮未再修改代码或文档。

## 9. Pre-existing Failure Verification

Frontend 仍只有一项失败：

- File: `tests/workbenchDailyFeedback.test.js`
- Case: `adding focus updates Daily Feedback without replacing the existing toast copy`
- Result: 1 failed / 527 passed

该失败已在 Phase 22.2 前确认，与 `js/habitFormation.js`、`tests/habitFormation.test.js` 无依赖关系。本轮未修改该测试，未扩大失败范围，也未将其计入 Phase 22.2 regression。

## 10. Remaining P2

以下 P2 已检查但未修复，不构成当前阻塞：

- `windowDays` 负数 / NaN 的输入语义仍依赖 fallback 规则。
- 非有限 value 会被安全处理，但未来可考虑显式拒绝。
- `minFrequency` 的 `.24 / .25 / .26` 与 `.29 / .30 / .31` 三点边界测试尚未完整覆盖。
- 缺失日期不会自动识别，调用方需保证输入为连续观察日序列。
- structural compatibility 与 behavioral compatibility 的文档描述仍可进一步细化。

未发现 P2 已造成实际 regression，也未发现未关闭的 P1。

## 11. Final Decision

```text
READY
```

四个 P1 全部关闭；Habit Formation 0 failures；Frontend 除已知 pre-existing failure 外无新增失败；Backend、Build、diff check 全部通过；无新 regression、无 breaking change、无冻结架构变更。
