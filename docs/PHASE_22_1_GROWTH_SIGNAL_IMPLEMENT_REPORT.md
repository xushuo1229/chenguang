# 阶段 22.1 增长信号实施报告

# 摘要

新增 `js/growthSignals.js` 统一 Growth Signal runtime projection 层。将已有的 Growth Intelligence 输出（trends / positiveSignals / riskSignals / consistencyState）转换为标准 `{id, type, source, direction, strength, confidence, isSustained, evidence, createdFrom}` 结构。

Do not modify any existing systems (CGStore / Sync / Backend / Memory / AI Context), only provide the underlying projection for future consumption.

# 修改文件

| 文件 | 修改内容 |
|---|---|
| `js/growthSignals.js` | 新增：统一 Signal 纯函数模块 |
| `tests/growthSignals.test.js` | 新增：16 条测试覆盖全部场景 |

# Signal 结构

```javascript
{
  signals: [
    {
      id: "focus_improvement_7d",       // 稳定标识（非随机）
      type: "improvement",               // improvement | risk | consistency | achievement
      source: "focus",                   // focus | exercise | reading | english | todo | streak | goal | growth
      direction: "up",                   // up | down | stable
      strength: 0.36,                    // 0-1 信号强度
      confidence: 0.86,                  // 0-1 判断可靠度
      isSustained: true,                 // 是否为持续趋势（非一次波动）
      evidence: "最近 7d 专注时长上升 36%。", // 用户可理解文案
      createdFrom: "trend_7d"            // 追溯来源
    }
  ]
}
```

## 信号生成规则

| 来源 | 映射规则 |
|---|---|
| `trendState.windows[span]` | `rising → improvement/up`，`falling → risk/down`，`stable → consistency/stable` |
| `positiveSignals` | `focus_habit_forming → improvement/up`，`consistency → consistency/stable`，`goal_achieved → achievement/up` |
| `riskSignals` | 全部映射为 `risk/down`，strength 根据 severity (high=0.8, medium=0.5, low=0.3) |
| `consistencyState` | `activeDays30 > 0` 时生成 `consistency` 信号，strength = activeDays/30 |

## 字段推导

| 字段 | 推导逻辑 |
|---|---|
| `strength` | `min(1, abs(delta) / (100 + volatility))` |
| `confidence` | `min(1, activeDays / 7) - min(1, volatility / 200) + 0.2` |
| `isSustained` | `volatility < 50 && activeDays >= 5` |
| `direction` | `rising/new_activity → up`，`falling → down`，其余 → `stable` |

# 架构影响

| 系统 | 是否修改 |
|---|---|
| CGStore | ❌ Unmodified |
| Sync | ❌ Unmodified |
| Backend | ❌ Unmodified |
| Memory schema | ❌ Unmodified |
| AI Context | ❌ Unmodified (no new ctx.growthSignals) |

数据流：`已有 growthState → buildGrowthSignals()（纯函数）→ signals[]`

# 兼容性

| 已有系统 | 是否受影响 |
|---|---|
| 每日反馈 | ❌ 不受影响 |
| 成长时间线 | ❌ 不受影响 |
| 成长叙述 | ❌ 不受影响 |
| 保留上下文 | ❌ 不受影响 |
| AI 上下文 | ❌ 不受影响 |

GrowthSignals 独立于所有已有 projection，不替换、不覆盖、不修改任何输出。

# 测试

| 项目 | 结果 |
|---|---|
| 前端 | 通过 492/492（46 个文件） |
| 后端 | 通过 68/68（20 个测试套件） |
| 构建 | 通过（1.07 秒） |
| git diff --check | 通过 |

## 新增测试覆盖（16 条）

- 基础转换：空 growthState → 空信号；正常转换 → 信号结构完整
- 方向：rising → 上升 / falling → 下降 / stable → 稳定
- 类型：rising → 改善 / falling → 风险 / stable → 一致性
- 强度：范围 0-1
- 置信度：trend 来源有值，positiveSignals 来源默认 0.7
- 是否持续：低波动 高活跃 → true；高波动 / 低活跃 → false
- 去重：ID 稳定不重复
- 证据：无内部字段名（delta / 波动率 / 当前范围）
- 排除：数据不足 / 无数据 不生成信号
- 最大信号：限制输出数量
- 安全性：类型 / 方向 均来自固定枚举

# 性能

365 天模拟数据（300 checkin 183 focus 122 reading 92 sport 73 英语 183 todo 1 goals）

| 指标 | 值 | 目标 |
|---|---|---|
| p50 | 0.020毫秒 | <5毫秒 |
| p95 | 0.078毫秒 | <5毫秒 |
| 最大值 | 0.300毫秒 | <5毫秒 |

* *结论：** 远低于 5ms 目标。

# 安全审查

- ✅ No store writes (`rg setUser` 0 matches)
- ✅ No localStorage (`rg localStorage` 0 matches)
- ✅ No token / password / API key (`rg password|token|api.?key` 0 matches)
- ✅ 无用户敏感信息泄露
- ✅ Signal 不是记忆，不是用户事实，不是 AI 记忆
- ✅ 纯函数，无副作用

# 剩余风险

| 风险 | 级别 | 说明 |
|---|---|---|
| Signal 尚无消费方 | P1 | 模块已就绪但 AI 上下文 / UI / 时间线 尚未接入；需后续阶段消费 |
| strength 公式简化 | P2 | 当前 `abs(delta) / (100 + volatility)` 是基础近似，未来可优化 |
| positiveSignals strength 固定 0.6 | P2 | 保守默认值，未来可从证据中推导 |
| isSustained 条件简单 | P2 | `volatility < 50 && activeDays >= 5` 可能误判；阶段 22.2 将引入习惯形成检测 |
