# Phase 22.2 Habit Formation v1.1 — 加固终审

## 1. 执行摘要

本次为 READ-ONLY FINAL AUDIT，未修改源码、未修复测试、未 commit、未 push。

Hardening 已成功修复旧模型的核心问题：`currentConsecutive` 已真实存在，历史连续与当前连续已分离，已中断的 `111000` 不再被判定为 forming。目标测试、Backend 测试、Build 和 `git diff --check` 均通过。

但 Final Audit 发现 4 项 P1：

1. 当输入序列长于 `windowDays` 时，模块会扫描整个序列，`currentConsecutive` 可能超出观察窗口。
2. `early` 状态存在双语义：既可能 `isHabitForming=true`，也可能 `isHabitForming=false`。
3. 当仅 `habitScore` 不足时，`reason` 会错误落到 `low_frequency`。
4. 结构保持 additive，但 `isHabitForming` 有意语义收紧，严格不符合“不存在 breaking change”。

最终结论为 **NOT READY**，不能进入 Phase 22.3。

---

## 2. 审计范围

审查文件：

- `js/habitFormation.js`
- `tests/habitFormation.test.js`
- `docs/PHASE_22_2_HARDENING_IMPLEMENT_REPORT.md`
- `docs/PHASE_22_2_HARDENING_AUDIT.md`
- `docs/PHASE_22_2_HABIT_FORMATION_AUDIT.md`
- `docs/PHASE_22_2_HABIT_FORMATION_IMPLEMENT_REPORT.md`

同时静态检查调用方和架构边界。本次新增的唯一文件是本审计报告。

---

## 3. currentConsecutive 审计

### PASS Cases

| Case | 结果 | 判定 |
| --- | ---: | --- |
| `111000` | `maxConsecutive=3`, `currentConsecutive=0` | PASS |
| `000111` | `maxConsecutive=3`, `currentConsecutive=3` | PASS |
| `11100011` | `maxConsecutive=3`, `currentConsecutive=2` | PASS |
| 空数组 | `maxConsecutive=0`, `currentConsecutive=0` | PASS |
| 全 0 | `maxConsecutive=0`, `currentConsecutive=0` | PASS |
| 全 1 | `maxConsecutive=length`, `currentConsecutive=length` | PASS |
| 单天 | `maxConsecutive=1`, `currentConsecutive=1` | PASS |
| 中间连续 / 尾部连续 | 均能区分 | PASS |

实现不是复用 `maxConsecutive`，而是在同一次循环内维护独立的 `current`。

### P1-1: Window Boundary Failure

当序列长度大于 `windowDays` 时，代码没有截断到观察窗口。

复现：输入 365 天，`windowDays=7`，实际输出 `activeDays=243`、`frequency=1`、`maxConsecutive=2`、`currentConsecutive=1`、`windowDays=7`。

问题：

- `activeDays` 覆盖了 365 天，而非 7 天。
- 复杂度是 O(series length)，不是 O(windowDays)。
- 若最后 365 天全部激活，`currentConsecutive` 可以达到 365，超出 7 天观察窗口。

这违反本次终审的窗口语义与性能要求，标记为 **P1**。

---

## 4. isHabitForming 公式审计

代码实际条件：

```js
activeDays >= 3
AND habitScore >= 0.5
AND frequency >= minFrequency
AND maxConsecutive >= 3
AND currentConsecutive >= 2
AND consistency >= 0.1
```

其中 `activeDays >= 3` 由前置 early return 实现；其余条件使用 `&&` 连接。

| 检查 | 结果 |
| --- | --- |
| 无漏条件 | PASS |
| 无 OR / AND 混用 | PASS |
| 阈值方向正确 | PASS |
| 默认 `minFrequency=0.3` | PASS |
| 空数据不误判 | PASS |
| `111000` 不误判 | PASS |
| `000111` 不判 stable | PASS |
| consistency guard 存在 | PASS |

公式本身符合 Hardening 设计。

---

## 5. status 审计

枚举确认：

```text
insufficient
not_forming
early
forming
stable
```

关键结果：

| 场景 | isHabitForming | status | 判定 |
| --- | --- | --- | --- |
| 少于 3 条有效记录 | false | insufficient | PASS |
| `111000` | false | not_forming | PASS |
| `000111` | true | early | 见 P1-2 |
| 7 天全激活 | true | forming | PASS |
| 4 天全激活 | true | early，不是 stable | PASS |
| 14 天全激活 | true | stable | PASS |

`stable` 没有被过度使用：需要当前连续 `>= 14`，且 `frequency >= 0.5`、`consistency >= 0.5`。

### P1-2: early 双语义

代码中存在两条进入 `early` 的路径：

1. `isHabitForming=true` 且 `currentConsecutive < 7` 时返回 `early`。
2. `isHabitForming=false` 但 `currentConsecutive >= 2`、`maxConsecutive >= 3`、`consistency >= 0.1` 时，也可能返回 `early`。

实际证据：

- `000111`：`isHabitForming=true`, `status=early`
- 10 天内 3 天激活并设置 `minFrequency=0.4`：`isHabitForming=false`, `status=early`

因此 `early` 不能被稳定解释为“仅为早期趋势且布尔结果为 false”。本次终审明确要求 `early` 不应意味着 `isHabitForming=true`，当前实现不符合，标记为 **P1**。

---

## 6. reason 审计

允许值确认：

```text
insufficient_data
low_frequency
low_continuity
unstable
habit_stopped
forming
```

当前 deterministic 优先级：

1. 数据不足：`insufficient_data`
2. 当前连续为 0 且历史最大连续 `>= 3`：`habit_stopped`
3. `frequency < minFrequency`：`low_frequency`
4. `maxConsecutive < 3`：`low_continuity`
5. `consistency < 0.1`：`unstable`
6. 其他失败：fallback `low_frequency`
7. 形成中：`forming`

### P1-3: reason fallback 矛盾

复现场景：

- `windowDays=100`
- `activeDays=30`
- `frequency=0.3`
- `consistency=1`
- `maxConsecutive=4`
- `currentConsecutive=2`
- `habitScore=0.419`
- `isHabitForming=false`
- 实际 `reason=low_frequency`

此时频率已达到默认阈值，真实失败原因是 `habitScore < 0.5`，但 `reason` 返回 `low_frequency`。原因枚举缺少 `low_score` 或类似语义，fallback 会误导调用方，标记为 **P1**。

---

## 7. early 边界审计

当前边界为：

```text
currentConsecutive < 7  => early
currentConsecutive >= 7 && < 14 => forming
currentConsecutive >= 14 => stable
```

因此第 3 天是 `early`，第 7 天是 `forming`，第 14 天是 `stable`。`111` 不会被判定为 `stable`。

但由于 P1-2，`early` 与 `isHabitForming` 的关系仍不满足本次终审要求。

---

## 8. minFrequency 审计

### PASS

- 默认值保持 `0.3`。
- 旧调用方式不传 options 正常。
- override 通过 `opts.minFrequency` 生效。
- 没有硬编码 focus / reading / exercise / course 等领域。
- 阈值判断为 `frequency >= minFrequency`，没有 off-by-one。

边界验证：

- `minFrequency=0.2`：`frequency=0.3` 时通过。
- `minFrequency=0.4`：`frequency=0.3` 时不通过。
- `minFrequency=Infinity` 会被 clamp 到 1。
- `minFrequency=0` 会被接受。
- `minFrequency=NaN` / null 回落默认值。

P2：测试尚未显式覆盖 `0.24 / 0.25 / 0.26` 与 `0.29 / 0.30 / 0.31` 三点边界，只覆盖了 `.2 / .3 / .4`。

---

## 9. consistency 审计

公式为：

```text
consistency = clamp01(1 - CV)
```

验证结果：

- `[1, 1, 1]`：`consistency=1`。
- `[1, 1, 1000]`：`consistency=0`，`isHabitForming=false`。
- `[1, 1000]`：因 `activeDays < 3` 直接 false，无法单独验证 guard，但不会误判。
- 极端 `Infinity` 不会导致关键输出为 NaN / Infinity，会被 clamp 到 0。
- 非零 active values 至少有 3 条后才计算 CV，避免空集合除零。

---

## 10. 误报审计

| Case | 结果 |
| --- | --- |
| `0001000` 单次 spike | false, insufficient |
| `101010` 高波动 | false, not_forming, low_continuity |
| `111000` 历史习惯已停 | false, not_forming, habit_stopped |
| `000111` 刚连续 3 天 | true, early；不是 stable，但布尔为 true |
| `[1, 1000]` 极端值 | false, insufficient |
| 频率不足 | false |

`111000`、单次 spike、高波动和频率不足的风险已控制。但 `000111` 仍说明 early / boolean 语义需要按 P1-2 收敛。

---

## 11. 漏报审计

### Case 1: 低频行为

`minFrequency` caller override 已验证可以放宽或收紧判定。

### Case 2: 长期稳定行为

正常传入等长窗口时，14 天连续行为可正确进入 `stable`。但当序列长度大于 `windowDays` 时，存在 P1-1 的窗口截断缺失问题。

### Case 3: 恢复行为

`11100011`：`maxConsecutive=3`、`currentConsecutive=2`、`isHabitForming=true`、`status=early`。恢复状态表达正确。

---

## 12. 向后兼容性

旧字段全部保留：

```text
isHabitForming
habitScore
frequency
consistency
maxConsecutive
activeDays
windowDays
evidence
```

新字段为 additive：

```text
status
reason
currentConsecutive
version
```

旧调用不传 options 不报错。

但 `isHabitForming` 因新增 `currentConsecutive >= 2` 和 `consistency >= 0.1` 发生有意语义收紧。相同输入下，部分旧结果会从 true 变为 false。当前仓库没有生产调用方，实际影响可控；但严格按本次终审“不存在 breaking change”的要求，该行为变化仍需在下一阶段明确决策或通过版本化策略处理。

---

## 13. 架构边界

| 检查 | 结果 |
| --- | --- |
| 修改 CGStore | 未发现 |
| 修改 Sync | 未发现 |
| 修改 Backend | 未发现 |
| 修改 Memory | 未发现 |
| 修改 AI Context | 未发现 |
| 修改 Analytics | 未发现 |
| 修改 UI | 未发现 |
| 生产调用方 | 未发现 |
| 第二套存储 | 未发现 |
| localStorage / sessionStorage | 未发现 |
| 网络请求 | 未发现 |
| AI 自动写入 | 未发现 |

说明：当前工作区仍包含 Phase 20 / 21 / 22 早期阶段的未提交架构文件变更。这些不属于本次 Hardening 的增量；Hardening 增量集中在 `js/habitFormation.js`、`tests/habitFormation.test.js` 和 Phase 22.2 文档。

---

## 14. 测试结果

| 层级 | Command | Result |
| --- | --- | --- |
| Habit Formation target | `npx vitest run tests/habitFormation.test.js` | PASS 30/30 |
| Frontend | `npm test` | FAIL 1/522（521 PASS，1 pre-existing FAIL） |
| Backend | `cd backend; npm test` | PASS 68/68 |
| Build | `npm run build` | PASS |
| Diff Check | `git diff --check` | PASS |

`git diff --check` 只有既有 LF/CRLF warning，没有 whitespace error。

---

## 15. 性能

500 次采样，输入序列长度等于观察窗口：

| Window | p50 | p95 | max |
| ---: | ---: | ---: | ---: |
| 7d | 0.0014ms | 0.0042ms | 0.3659ms |
| 30d | 0.0021ms | 0.0037ms | 0.2397ms |
| 90d | 0.0035ms | 0.0039ms | 0.0765ms |
| 365d | 0.0126ms | 0.0161ms | 0.1205ms |

365d p95 < 10ms，达标。但这是在序列长度等于 `windowDays` 的前提下。由于 P1-1，如果调用方传入长序列与小窗口，实际复杂度会变成 O(series length)，该项不能整体判定通过。

---

## 16. 安全审计

输入测试覆盖：

- `null`
- `undefined`
- 非数组标量
- 普通对象
- 缺失对象
- `NaN`
- `Infinity`
- 负值
- 空数组
- 负 `windowDays`
- NaN `windowDays`
- `minFrequency=Infinity`
- `minFrequency=0`

结果：

- 无 unexpected exception。
- 关键输出没有 NaN / Infinity。
- 空数据返回 insufficient，不误判。
- 无 Store / localStorage / sessionStorage / 网络访问。
- 无 API_KEY / TOKEN / PASSWORD / SECRET / authorization。
- 无 innerHTML / DOM 渲染面。

P2：负数或 NaN `windowDays` 虽然不抛错，但会回落到 `1` 或序列长度，语义不够严格。建议未来显式校验或规范化。

---

## 17. 文档一致性

`js/habitFormation.js`、`tests/habitFormation.test.js` 和 `docs/PHASE_22_2_HARDENING_IMPLEMENT_REPORT.md` 在以下内容一致：

- v1.1
- 新字段
- `currentConsecutive >= 2`
- `minFrequency` override
- `consistency >= 0.1`
- 30/30 target tests
- 性能达标（等长窗口）

不一致或覆盖缺口：

1. Final Audit 要求 `early` 不意味着 `isHabitForming=true`，但实现和测试当前允许 true。
2. Final Audit 要求无 breaking change，但实现报告正确记录了 `isHabitForming` 有意语义收紧。
3. Final Audit 要求 O(windowDays)，但当前代码在序列长于窗口时为 O(series length)。
4. 测试缺少 `low_score` reason fallback 反例和 `windowDays < sequence.length` 反例。

---

## 18. 已知既有失败

Frontend 已知失败：

- File: `tests/workbenchDailyFeedback.test.js`
- Case: `adding focus updates Daily Feedback without replacing the existing toast copy`
- Result: 1 failed / 521 passed

确认：

1. 该失败在 Hardening 前的交接状态中已存在。
2. 不属于 `js/habitFormation.js` 或 `tests/habitFormation.test.js`。
3. 目标模块 30/30 通过，Backend 与 Build 通过，未见 Hardening 扩大失败范围。

按终审规则，本次未修复该失败。

---

## 19. 剩余风险

### P0

无。

### P1

1. **Window Projection Bug**：`windowDays` 小于序列长度时，未截断观察窗口，导致频率、连续性和复杂度错误。
2. **Early Semantic Conflict**：`early` 可能同时对应 `isHabitForming=true` 和 `isHabitForming=false`，违反终审语义。
3. **Reason Fallback Mislabel**：`habitScore < 0.5` 时可能被解释为 `low_frequency`，即使频率达到阈值。
4. **Strict Breaking-change Rule Not Met**：结构 additive，但 `isHabitForming` 语义有意收紧。当前无调用方，风险可控，但仍与“不存在 breaking change”的终审标准冲突。

### P2

1. `windowDays` 的负数 / NaN 行为不抛错但语义不严格。
2. 非有限 value 会被归零或参与统计，建议未来显式拒绝。
3. `minFrequency` 的 `.24 / .25 / .26` 与 `.29 / .30 / .31` 三点边界缺少显式测试。
4. 序列中缺失日期不会被识别；调用方必须保证传入连续日序列。
5. 文档应区分 structural compatibility 与 behavioral compatibility。

---

## 20. 最终结论

```text
NOT READY
```

原因：

- 存在 3 项新确认 P1，加上严格 breaking-change 判定共 4 项阻断风险。
- 虽然核心 currentConsecutive 修复有效，且测试、Backend、Build 和等长窗口性能达标，但不能进入 Phase 22.3。

下一阶段前应先完成：

1. 修复 `windowDays` 截断语义。
2. 统一 `early` 与 `isHabitForming` 状态关系。
3. 为 `habitScore` 失败增加 deterministic reason。
4. 明确并测试 `isHabitForming` 语义变化策略。
