# Phase 22.1 Growth Signal 实施报告

## 摘要

新增 `js/growthSignals.js` 统一 Growth Signal runtime projection 层。将已有 Growth Intelligence 输出（trends / positiveSignals / riskSignals / consistencyState）转换为标准 `{id, type, source, direction, strength, confidence, isSustained, evidence, createdFrom}` 结构。

不修改任何已有系统（CGStore / Sync / Backend / Memory / AI Context），只提供底层 projection 供未来消费。

## 修改文件

| 文件 | 修改内容 |
|---|---|
| `js/growthSignals.js` | 新增：统一 Signal 纯函数模块 |
| `tests/growthSignals.test.js` | 新增：16 条测试覆盖全部场景 |

## Signal 结构

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

### 信号生成规则

| 来源 | 映射规则 |
|---|---|
| `trendState.windows[span]` | `rising → improvement/up`，`falling → risk/down`，`stable → consistency/stable` |
| `positiveSignals` | `focus_habit_forming → improvement/up`，`consistency → consistency/stable`，`goal_achieved → achievement/up` |
| `riskSignals` | 全部映射为 `risk/down`，strength 根据 severity (high=0.8, medium=0.5, low=0.3) |
| `consistencyState` | `activeDays30 > 0` 时生成 `consistency` 信号，strength = activeDays/30 |

### 字段推导

| 字段 | 推导逻辑 |
|---|---|
| `strength` | `min(1, abs(delta) / (100 + volatility))` |
| `confidence` | `min(1, activeDays / 7) - min(1, volatility / 200) + 0.2` |
| `isSustained` | `volatility < 50 && activeDays >= 5` |
| `direction` | `rising/new_activity → up`，`falling → down`，其余 → `stable` |

## 架构影响

| 系统 | 是否修改 |
|---|---|
| CGStore | ❌ 未修改 |
| Sync | ❌ 未修改 |
| Backend | ❌ 未修改 |
| Memory schema | ❌ 未修改 |
| AI Context | ❌ 未修改（不新增 ctx.growthSignals） |

数据流：`已有 growthState → buildGrowthSignals()（纯函数）→ signals[]`

## 兼容性

| 已有系统 | 是否受影响 |
|---|---|
| DailyFeedback | ❌ 不受影响 |
| GrowthTimeline | ❌ 不受影响 |
| GrowthNarrative | ❌ 不受影响 |
| RetentionContext | ❌ 不受影响 |
| AI Context | ❌ 不受影响 |

GrowthSignals 独立于所有已有 projection，不替换、不覆盖、不修改任何输出。

## 测试

| 项目 | 结果 |
|---|---|
| Frontend | PASS 492/492（46 files） |
| Backend | PASS 68/68（20 suites） |
| Build | PASS（1.07s） |
| git diff --check | PASS |

### 新增测试覆盖（16 条）

- 基础转换：空 growthState → 空信号；正常转换 → 信号结构完整
- Direction：rising → up / falling → down / stable → stable
- Type：rising → improvement / falling → risk / stable → consistency
- Strength：范围 0-1
- Confidence：trend 来源有值，positiveSignals 来源默认 0.7
- isSustained：低波动 + 高活跃 → true；高波动 / 低活跃 → false
- 去重：ID 稳定不重复
- Evidence：无内部字段名（delta / volatility / currentRange）
- 排除：insufficient_data / no_data 不生成信号
- maxSignals：限制输出数量
- 安全：types / directions 均来自固定枚举

## 性能

365 天模拟数据（300 checkin + 183 focus + 122 reading + 92 sport + 73 english + 183 todo + 1 goal）

| 指标 | 值 | 目标 |
|---|---|---|
| p50 | 0.020ms | <5ms |
| p95 | 0.078ms | <5ms |
| max | 0.300ms | <5ms |

**结论：** 远低于 5ms 目标。

## 安全审查

- ✅ 无 Store 写入（`rg setUser` 0 匹配）
- ✅ 无 localStorage（`rg localStorage` 0 匹配）
- ✅ 无 token / password / API key（`rg password|token|api.?key` 0 匹配）
- ✅ 无用户敏感信息泄露
- ✅ Signal 不是 Memory，不是用户事实，不是 AI 记忆
- ✅ 纯函数，无副作用

## 剩余风险

| 风险 | 级别 | 说明 |
|---|---|---|
| Signal 尚无消费方 | P1 | 模块已就绪但 AI Context / UI / Timeline 尚未接入；需后续 Phase 消费 |
| strength 公式简化 | P2 | 当前 `abs(delta) / (100 + volatility)` 是基础近似，未来可优化 |
| positiveSignals strength 固定 0.6 | P2 | 保守默认值，未来可从 evidence 中推导 |
| isSustained 条件简单 | P2 | `volatility < 50 && activeDays >= 5` 可能误判；Phase 22.2 将引入 Habit Formation Detection |
