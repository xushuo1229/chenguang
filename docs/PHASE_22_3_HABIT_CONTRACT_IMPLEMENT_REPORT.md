# Phase 22.3 · Habit Formation Contract Hardening 实施报告

## Summary

Phase 22.3 已按“Additive First / Minimal Change / Backward Compatible”完成 Habit Formation 契约强化。

本次没有新增第二套习惯算法，也没有把 Habit Formation 接入持久化、Store、Sync、Backend、Memory、AI Context 或 UI。核心工作是明确观察数据契约、数值边界、窗口投影、状态派生和证据解释，并补齐对应的契约与边界测试。

关键变化：

- `HabitFormation.VERSION` 提升为 `1.2`。
- 观察数据支持严格 `YYYY-MM-DD` 字符串和本地 `Date`。
- 无效日期会被排除，重复日期按最后一条值合并。
- 日期乱序会排序后计算，不改变派生结果。
- 缺失日历日期会中断连续性，不会伪造连续记录。
- `opts.today` 可过滤未来观察。
- 非有限数值按不活跃观察处理。
- 正数有限 `windowDays` 向下取整且最小为 `1`；`<=0`、`NaN`、`Infinity`、`-Infinity` 回退到 `source.length || 1`。
- `frequency` 使用 `activeDays / coverageDays`，其中 `coverageDays = max(windowDays, realDateSpan)`。

## Changed Files

| 文件 | 修改内容 |
| --- | --- |
| `js/habitFormation.js` | 修正窗口内日期覆盖率引用；保持并完善 Observation / Value / Window / State / Evidence 契约实现。 |
| `tests/habitFormation.test.js` | 修复测试日期生成器的无效日期问题；补充 Phase 22.3 契约、边界、数据完整性和兼容性测试。 |
| `docs/PHASE_22_3_HABIT_CONTRACT_IMPLEMENT_REPORT.md` | 新增本阶段中文实施报告。 |

## Contract Changes

### Observation Contract

- 有效日期：严格 `YYYY-MM-DD` 字符串；本地 `Date` 会转换为用户本地日期键。
- 无效日期：排除，不计入任何习惯指标，并在 `evidence` 中说明“已排除无效记录”。
- 重复日期：按最后一条值合并，不重复增加 `activeDays`、`frequency`、`currentConsecutive` 或 `maxConsecutive`。
- 日期乱序：先按日期键排序，再派生指标。
- 缺失日期：按真实日历日期判断连续性；缺失日期会中断 streak。
- 未来日期：传入 `opts.today` 时排除晚于 today 的观察，并在 `evidence` 中说明。

### Value Contract

- `value` 使用 `Number()` 转换。
- 非有限值，包括 `NaN`、`Infinity`、`-Infinity`，按 `0` 处理，即不活跃观察。
- 只有 `value > 0` 才计入活跃天数。

### Window Contract

- 输入为正数有限值时向下取整，最小窗口为 `1`。
- `windowDays <= 0`、`NaN`、`Infinity`、`-Infinity` 回退到 `source.length || 1`。
- 空数据窗口回退为 `1`。
- 投影只使用最后 `windowDays` 条观察，不读取窗口外历史数据。

### Metric Contract

- `frequency = activeDays / coverageDays`。
- `coverageDays = max(windowDays, realDateSpan)`。
- `consistency` 继续基于窗口内非零值的变异系数派生。
- `currentConsecutive` 与 `maxConsecutive` 按真实日历日期计算。
- `habitScore` 继续由已有权重派生，未引入第二套评分系统。

### State Contract

- `isHabitForming` 保持 Phase 22.2 / v1.0 兼容语义：基于 `habitScore`、`frequency`、`maxConsecutive`。
- `currentConsecutive` 与 `consistency` 不作为 breaking boolean gate。
- `early` 是独立 observation stage，可与 `isHabitForming=true` 或 `isHabitForming=false` 同时成立。
- `forming` 与 `stable` 只能在 `isHabitForming === true` 时出现。
- `reason` 保持稳定优先级，`habitScore` 不足不会再被错误归因为 `low_frequency`。

## Compatibility

以下冻结契约未改变：

- `isHabitForming` 的兼容行为。
- `forming` / `stable` 与 `isHabitForming` 的关系。
- `early` 的独立 observation stage 语义。
- `reason` 的稳定归因规则。

以下旧输出字段继续保留：

- `isHabitForming`
- `habitScore`
- `frequency`
- `consistency`
- `maxConsecutive`

Phase 22.2 已恢复的行为未被本次修改破坏。

## Architecture Impact

| 边界 | 是否修改 | 结论 |
| --- | --- | --- |
| CGStore | 否 | 未新增 Store 字段，未修改 Store 语义。 |
| localStorage / Sync | 否 | 未新增持久化，未修改同步协议。 |
| Backend | 否 | 未修改 API、Schema 或数据库。 |
| Memory | 否 | 未写入 `user.memory`。 |
| AI Context | 否 | 未新增 Context 字段或 AI 消费路径。 |
| Analytics | 否 | 未迁移或重写唯一统计事实来源。 |
| UI | 否 | 未新增页面、组件或视觉变更。 |

Habit Formation 继续保持为纯派生领域模块。

## Security Review

- 模块没有写入 `localStorage` 或 `sessionStorage`。
- 模块没有调用 Store、Sync、Backend 或 AI Provider。
- 模块没有读取或保存 API Key、Token、Password、Secret。
- 模块没有保存聊天原文或 Prompt 内容。
- 输出证据使用固定中文模板，不拼接用户敏感内容。
- 新增测试继续确认模块不会写 Store 或 localStorage。

## Performance

新增/更新的 365 天性能用例继续要求 p95 < 5ms，当前测试通过。

实现保持窗口投影复杂度为 `O(windowDays)`：

- 先裁剪最后 `windowDays` 条观察。
- 再在窗口内规范化日期、数值和重复项。
- 不扫描窗口外历史数据。

## Tests

### Target Tests

命令：

```bash
npx vitest run tests/habitFormation.test.js
```

结果：

```text
PASS: 47 / 47
```

覆盖范围：

- 基础转换与旧字段。
- 窗口边界：empty、1、N、N 大于序列长度、非法值。
- Observation Integrity：无效日期、本地日期、重复日期、日期乱序、缺失日期、未来日期。
- Value Boundary：`NaN`、`Infinity`、`-Infinity`。
- `minFrequency` 边界：低于阈值、等于阈值、高于阈值、`1`、大于 `1`。
- Legacy 兼容：`currentConsecutive` 与 `consistency` 不构成 breaking gate。
- State：`early=true + isHabitForming=true`、`early=true + isHabitForming=false`、`forming/stable` 只在 `isHabitForming=true` 时出现。
- Reason：低频率、低连续性、不稳定、习惯停止、`habitScore` 不足归因。
- Security：无 Store 写入、无 localStorage 写入。
- Performance：365 天 p95 < 5ms。

### Full Verification

```text
Frontend: FAIL（仅 1 个已知 pre-existing failure）
Backend:  PASS 68 / 68
Build:    PASS
Diff Check: PASS
```

前端唯一失败为：

```text
tests/workbenchDailyFeedback.test.js
adding focus updates Daily Feedback without replacing the existing toast copy
```

该失败属于既有工作区失败，不在 Phase 22.3 修改范围内，本次未修改该测试，也未观察到失败范围扩大。

## Remaining Risks

- `opts.today` 如果不是有效日期，当前不会启用未来日期过滤。该行为已作为 v1.2 明确边界写入 Architecture Freeze，并由回归测试锁定。
- 缺失日期会降低有效覆盖率，这是符合真实日历语义的设计；未来若引入显式“休息日”语义，需要单独扩展契约。
- 测试中的日期为固定日期，不依赖系统当前时间；后续如需相对时间测试，应继续通过 `opts.today` 注入。

## Final Status

Phase 22.3 实施完成，并通过最小 Remediation 关闭独立审计发现的文档、`minFrequency=0`、invalid-date evidence 和 invalid `opts.today` 测试缺口。

未 commit，未 push，未进入 Phase 22.4。
