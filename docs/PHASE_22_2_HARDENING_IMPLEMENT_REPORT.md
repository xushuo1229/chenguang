# 第22.2阶段 习惯形成 加固实施报告

# 摘要

完成 Habit Formation v1.1 加固：

- 新增 `currentConsecutive`，区分历史最长连续与当前连续。
- `isHabitForming` 要求当前至少连续 2 天，避免把已中断的旧连续记录误判为正在形成。
- 新增 5 级 `status`：`insufficient` / `not_forming` / `early` / `forming` / `stable`。
- 新增 `reason`，统一解释 `insufficient_data`、`low_frequency`、`low_continuity`、`unstable`、`habit_stopped`、`forming`。
- 支持调用方通过 `opts.minFrequency` 覆盖默认频率阈值，适配低频行为。
- 保留 `isHabitForming`、`habitScore`、`frequency`、`consistency`、`maxConsecutive` 等旧字段。
- 补充 365 天性能回归测试；实测 365 天数据 p50 约 0.012ms，p95 约 0.040ms。

# 修改文件

- `js/habitFormation.js`
  - 版本更新为 `1.1`。
  - 输出新增 `currentConsecutive`、`status`、`reason`。
  - 输入新增 `opts.minFrequency`。
  - `isHabitForming` 增加 `currentConsecutive >= 2` 与 `consistency >= 0.1` 防护。
  - 修正 `early` 状态边界：形成中但不足 7 天时返回 `early`。
- `tests/habitFormation.test.js`
  - 修正长期稳定、中断恢复与频率边界用例。
  - 新增 API、状态、原因、阈值覆盖、极端值、兼容性和性能测试。
  - 目标模块测试结果：30/30 PASS。

# 行为语义

`isHabitForming` 现在必须同时满足：

1. [[代码0]]
2. [[代码0]]
3. [[代码0]]
4. [[代码0]]
5. [[代码0]]

状态规则：

| 状态 | 语义 |
| --- | --- |
| `insufficient` | 少于 3 条有效记录，不做判断 |
| `not_forming` | 有数据但未达到形成条件 |
| `early` | 已判定形成中，且当前连续不足 7 天 |
| `forming` | Current consecutive 7-13 days |
| `stable` | 当前连续不少于 14 天，且频率与一致性达标 |

# 架构影响

- CGStore：未修改。
- Sync：未修改。
- Backend schema：未修改。
- Memory schema：未修改。
- AI Context：未修改。
- UI：未修改。
- Analytics / GrowthIntelligence: 未修改。

`habitFormation.js` Keep pure runtime projection, no import dependencies, no side effects, no writes to any storage.

# 兼容性

- 旧布尔字段 `isHabitForming` 保留。
- 旧数值字段和窗口字段保留。
- All newly added fields are additive.
- 默认频率阈值保持 `0.3`。
- `isHabitForming` 语义有有意收紧：旧连续但当前已中断的行为不再返回 true。

# 测试

## 目标模块

- 命令：`npx vitest run tests/habitFormation.test.js`
- 结果：通过 30/30

## 前端

- 命令：`npm test`
- 结果：失败 1/522
- 详情：`tests/workbenchDailyFeedback.test.js` 中 `adding focus updates Daily Feedback without replacing the existing toast copy` 失败。
- Note: 该失败是既有失败，不属于本阶段修改文件；按交接约束未修复。

## 后端

- 命令：`cd backend && npm test`
- 结果：通过 68/68

## 构建

- 命令：`npm run build`
- 结果：通过

## 差异检查

- 命令：`git diff --check`
- 结果：通过（无空白错误；仅存在原有的 LF/CRLF 警告）

# 性能

365 天模拟序列、500 次执行：

- p50: 0.012ms
- p95: 0.040ms
- 目标: <10ms
- 结果：通过

测试中另加入 200 次 365 天投影的 p95 回归断言，阈值 5ms。

# 安全审查

- No `CGStore` written.
- No `localStorage` / `sessionStorage` access.
- 无网络请求。
- No API Key, Token, Password, Secret, Authorization processing.
- 无 UI 渲染逻辑，不存在 `innerHTML` 注入面。
- 输出仅基于传入日序列与固定模板，不引入用户敏感内容。

# 剩余风险

- `isHabitForming` 语义收紧是故意的破坏性更改；下游未来接入时必须理解“当前正在形成”的含义。
- `minFrequency` 覆盖由调用方负责，本阶段未引入领域配置表，避免扩大范围。
- The frontend still has one existing Workbench Daily Feedback test failure unrelated to this project, which needs to be fixed independently.
- 当前模型仍使用固定规则阈值，不做基线对比、领域差异建模或长期中断恢复推断。
