# 第22.2阶段最终复审

# 1. 审计范围

这次是只读终审，基于当前工作区重新验证 Phase 22.2 习惯形成 v1.1.1。

审查范围：

- `js/habitFormation.js`
- `tests/habitFormation.test.js`
- `docs/PHASE_22_2_P1_REMEDIATION_REPORT.md`
- 第22.2阶段 硬化 前后语义
- 当前工作区中的既有 Phase 20 / 21 / 22 变更

This round did not modify production code, tests, existing documents, pre-existing failures, was not committed, not pushed, and did not enter Phase 22.3.

# 2. P1-1 验证

结论：**已关闭**。

`detectHabitFormation()` 现在先取最近 `windowDays` 个观察项，再计算全部投影字段：

```js
var windowSeries = source.slice(Math.max(0, source.length - days));
```

位置：`js/habitFormation.js:36`。

验证结果：

| 场景 | 结果 |
| --- | --- |
| 365 天全激活   `windowDays=7` | `activeDays=7`、`frequency=1`、`maxConsecutive=7`、`currentConsecutive=7` |
| 前 360 天连续，最后 7 天为 `25,25,25,25,25,0,0` | `activeDays=5`、`maxConsecutive=5`、`currentConsecutive=0` |
| 前 360 天存在活跃记录，最后 7 天为 `25,0,25,25,25,0,0` | `activeDays=4`、`maxConsecutive=3`、`currentConsecutive=0` |
| `windowDays=1` | 只观察最后 1 天；激活时 `currentConsecutive=1`，但 `activeDays<3` 仍为 insufficient |
| 空序列 | insufficient，`currentConsecutive=0` |

`frequency`、`consistency`、`currentConsecutive`、`habitScore`、`status`、`reason`、`evidence` 均基于截断后的窗口计算，未发现越界残留。

# 3. P1-2 验证

结论：**已关闭**。

`early` 已定义为独立 观测阶段，不要求与 `isHabitForming` 互斥：

|场景 |isHabitForming |状态 |判定 |
| --- | --- | --- | --- |
| 最近连续 3 天，满足旧布尔公式 | true | 早期 | 通过 |
| 最近连续 3 天，但频率低于 0.4 | false | 早期 | 通过 |
| 最近连续 7 天 | true | 形成中 | 通过 |
| 最近连续 14 天 | true | 稳定 | 通过 |
| 历史连续 3 天但当前中断 | true | 未形成 | 通过 |

`forming` 与 `stable` 均位于 `result.isHabitForming === true` 分支内；`early` 可以表达“已满足旧布尔语义但当前证据较短”，也可以表达“存在早期趋势但尚未达到正式布尔阈值”。该组合符合当前设计，不是矛盾状态。

# 4. P1-3 验证

结论：**已关闭**。

当前原因优先级固定：

1. [[代码0]]
2. [[代码0]]
3. [[代码0]]
4. [[代码0]]
5. [[代码0]]
6. [[代码0]]

`deriveNegativeReason()` 在 `habitScore < 0.5` 或 `consistency < 0.1` 时返回 `unstable`，不再回退到 `low_frequency`。位置：`js/habitFormation.js:131`。

验证结果：

- 当 frequency 达到阈值且 `habitScore=0.419` 不足时：`reason=unstable`，不是 `low_frequency`。
- 当 frequency 不足时：`reason=low_frequency`。
- 历史连续但当前中断：`reason=habit_stopped`。
- 正式形成且无质量警告：`reason=forming`。

多条件失败时优先级稳定，reason 与实际失败状态一致。

# 5. P1-4兼容性验证

结论：**已关闭**。

v1.0 对外语义已恢复：

```text
isHabitForming =
  activeDays >= 3
  AND habitScore >= 0.5
  AND frequency >= minFrequency
  AND maxConsecutive >= 3
```

当前实现不再将 `currentConsecutive >= 2` 作为布尔门槛，也不再要求 `isHabitForming` 必须满足 `consistency >= 0.1`。 这些更严格的当前趋势证据只保留在 `currentConsecutive`、`status`、`reason` 等 additive 字段中。

对比验证：

|机壳 |v1.0 |v1.1 坏了 |v1.1.1 当前 |
| --- | --- | --- | --- |
| `1110000` | 真 | 假 | 真 |
| `1111101` | 真 | 假 | 真 |
| `[1,1,1,1,1,1,1000]` | 真 | 假 | 真 |

额外执行 600 个随机样本对比，覆盖 7 / 14 / 30 天窗口，当前 `isHabitForming` 与 v1.0 公式结果 mismatch 数量为 0。当前仓库也没有生产调用方，因此既有调用方不会因 Hardening 改变布尔结果。

# 6. 回归测试结果

| 层级 | 命令 | 结果 |
| --- | --- | --- |
| 习惯养成 | `npx vitest run tests/habitFormation.test.js` | 通过 36/36 |
| 前端 | `npm test` | 527 通过 / 1 失败 |
| 后端 | `cd backend && npm test` | 通过 68/68 |

Frontend 唯一失败为已知的预先存在的失败，详见第 9 节。

# 7. 构建 / 差异检查

|检查 |结果 |
| --- | --- |
| `npm run build` | 通过 |
| `git diff --check` | 通过 |

`git diff --check` 只有既有 LF/CRLF 警告，没有 空白空间错误。

# 8. 架构验证

Phase 22.2 相关生产代码仅集中在 `js/habitFormation.js`。该模块：

- No CGStore write.
- No Sync modifications.
- No Backend modifications.
- No Memory schema modifications.
- No AI Context modifications.
- No Analytics modifications.
- 无 UI 修改。
- 无生产调用方。
- 无 `localStorage` / `sessionStorage` / 网络请求 / 敏感凭证处理。

当前工作区仍包含此前 Phase 20 / 21 / 22 的未提交变更。这些属于历史工作区状态，未归因于 Phase 22.2。除本终审报告外，本轮未再修改代码或文档。

# 9. 事先存在的故障验证

前端仍然只有一项失败：

- 文件: `tests/workbenchDailyFeedback.test.js`
- 案例: `adding focus updates Daily Feedback without replacing the existing toast copy`
- 结果: 1 失败 / 527 通过

该失败已在 Phase 22.2 前确认，与 `js/habitFormation.js`、`tests/habitFormation.test.js` 无依赖关系。本轮未修改该测试，未扩大失败范围，也未将其计入 Phase 22.2 回归。

# 10. 剩余 P2

以下 P2 已检查但未修复，不构成当前阻塞：

- `windowDays` 负数 / NaN 的输入语义仍依赖 fallback 规则。
- 非有限 value 会被安全处理，但未来可考虑显式拒绝。
- `minFrequency` 的 `.24 / .25 / .26` 与 `.29 / .30 / .31` 三点边界测试尚未完整覆盖。
- 缺失日期不会自动识别，调用方需保证输入为连续观察日序列。
- structural compatibility 与 behavioral compatibility 的文档描述仍可进一步细化。

No actual regression caused by P2 was found, and no open P1 was found.

# 11. 最终决定

```text
READY
```

All four P1s closed; Habit Formation 0 failures; Frontend has no new failures except known pre-existing failures; Backend, Build, diff check all passed; no new regressions, no breaking changes, no frozen architecture changes.
