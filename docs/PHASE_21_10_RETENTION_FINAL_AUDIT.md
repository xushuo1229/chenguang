# Phase 21.10 留存终审报告

## 1. 留存闭环状态

**PARTIAL LOOP → IMPROVED**

Phase 21 系列实施后，内环（记录 → 分析 → 反馈 → 成长理解）已形成完整闭环。用户在 Workbench 打开即能看到 Daily Feedback、Welcome Back、Streak Reminder 和 Growth Stage，完成记录后立即获得反馈。

外环（用户离开 → 重新打开）仍有缺口：系统无主动推送/通知能力（Service Worker 仅实现离线缓存）。用户回访完全依赖自身习惯。

判定：**PARTIAL LOOP**（内环 FULL，外环 PENDING）

---

## 2. 完整留存架构

```
用户行为记录
↓
CGStore（唯一数据入口）
↓
Analytics（唯一统计事实来源）
↓
Growth Intelligence（唯一成长计算来源）
↓
Runtime Projection（Phase 21 新增）
├── DailyFeedback（js/dailyFeedback.js）
├── GrowthTimeline（js/growthTimeline.js）
├── GrowthNarrative（js/growthTimeline.js buildNarrative）
├── RetentionContext（js/retentionContext.js）
└── GrowthMemory Projection（Phase 20，js/growthMemory.js buildContextMemory）
↓
Workbench（每日入口）
├── Growth Brief（状态 / 变化 / 风险 / 优势 / 建议）
├── Daily Feedback（今日变化 / 亮点 / 下一步）
├── Welcome Back（昨日记录摘要）
├── Streak Reminder（连续记录保护）
├── Growth Stage（当前成长阶段）
└── Candidate Activation（1 条 pending candidate + 确认/拒绝）
↓
Stats（长期分析中心）
├── Growth Timeline（最多 8 条事件）
├── Growth Narrative（阶段叙事）
├── Report（周报 / 月报）
└── Memory 管理（candidate 确认 + confirmed 列表）
↓
AI Coach（解释 / 建议 / 陪伴）
├── confirmed Memory（长期规律事实）
├── candidate（可能趋势，非事实）
└── dailyFeedback（今日反馈上下文）
```

---

## 3. 架构影响

| 系统 | Phase 21 是否修改 | 证据 |
|---|---|---|
| CGStore schema | ❌ 未修改 | `store.js` 无 Phase 21 相关变更 |
| Sync 协议 | ❌ 未修改 | `sync.js` 无 Phase 21 相关变更 |
| Backend | ❌ 未修改 | `backend/src/` 无 Phase 21 相关变更 |
| Memory 数据模型 | ❌ 未修改 | `growthMemory.js` 仅 Phase 20 修改 |
| AI Context | ⚠️ 新增 `dailyFeedback` | runtime-only，裁剪优先级最高 |

### AI Context `dailyFeedback` 审计

- **位置：** `js/aiContext.js:344-353`
- **性质：** runtime-only derived field，从 `buildDailyFeedback()` 派生
- **裁剪：** `js/aiContext.js:517` 中作为第一优先裁剪项
- **Memory 污染：** 无（不写入 user.memory）
- **必要性：** 是（AI 需要统一今日反馈以回答"我今天做了什么"）

---

## 4. 投影审计

### DailyFeedback (`js/dailyFeedback.js`)

| 检查项 | 结果 | 证据 |
|---|---|---|
| 纯函数 | ✅ | 无副作用，返回新对象 |
| 只消费 snapshot | ✅ | 输入 `snapshot` + `opts` |
| 重新计算 Analytics | ✅ 仅 1 次 | `Analytics.getDateRangeSummary(today, today)` 用于当日 |
| 扫描完整历史 | ❌ | 仅查询当日范围 |
| 写 Store | ❌ | 无 |

### GrowthTimeline (`js/growthTimeline.js`)

| 检查项 | 结果 | 证据 |
|---|---|---|
| 纯 projection | ✅ | 无副作用 |
| 限制输出数量 | ✅ | `MAX_ITEMS = 8` |
| 依赖已有数据 | ✅ | 消费 `growthState` snapshot |
| 历史事件数据库 | ❌ 不存在 | 无 storage |
| `completedAt` 虚构 | ❌ 不存在 | 测试验证不生成虚假日期 |

### GrowthNarrative (`js/growthTimeline.js` buildNarrative)

| 检查项 | 结果 | 证据 |
|---|---|---|
| 只依赖 Timeline | ✅ | 输入 `buildTimeline()` 输出 |
| 固定规则映射 | ✅ | `NARRATIVE_STAGES` 硬编码 |
| 生成虚假历史 | ❌ | 无 `createdAt` / `completedAt` |
| 写 Store | ❌ | 无 |

### RetentionContext (`js/retentionContext.js`)

| 检查项 | 结果 | 证据 |
|---|---|---|
| 纯函数 | ✅ | 三个函数均为纯计算 |
| buildWelcomeBack 从已有数据生成 | ✅ | 使用 `Analytics.getDateRangeSummary(yesterday, yesterday, snap)` |
| buildWelcomeBack 伪造昨天状态 | ❌ | 无数据时返回 `null`，UI 隐藏 |
| buildStreakReminder 基于已有 streak | ✅ | 使用 `Analytics.getStreaks(snap, { today })` |
| buildStreakReminder 温和提醒 | ✅ | 无"消失/失败/必须"等词汇 |
| getRetentionCandidate 消费已有 memory | ✅ | 从 `snapshot.memory.candidates` 过滤 pending |
| getRetentionCandidate 重新生成 candidate | ❌ | 只做展示层提取 |
| 写 Store | ❌ | 无 |

---

## 5. UX 旅程回顾

### Day 1（首次使用）
- **下一步指引：** ✅ Growth Brief 显示"完成一次记录后，这里会生成你的今日成长反馈"
- **即时反馈：** ✅ 记录后 `updateUI()` 刷新 Growth Brief + Daily Feedback
- **价值感：** ✅ 用户能看到"今天完成了 1 次成长记录"
- **Welcome Back：** ✅ 无昨日数据时正确隐藏
- **Candidate：** N/A（数据不足，无 candidate）

### Day 7（连续使用一周）
- **成长变化：** ✅ Growth Brief changes 显示 7 天趋势
- **Timeline：** ✅ Stats 展示最多 8 条事件（首次记录、连续成长等）
- **Stage：** ✅ Workbench 显示"当前成长阶段：稳定尝试"
- **Candidate：** ✅ 可能出现第一条 pending candidate，用户可在 Workbench 确认
- **Streak：** ✅ 显示"连续记录 7 天"

### Day 30（长期使用）
- **成长规律理解：** ✅ Confirmed Memory 累积，AI 可以引用
- **月报：** ✅ Stats 展示月度报告
- **Timeline：** ✅ 更多事件节点
- **Candidate：** ✅ 更多候选可能被发现
- **长期价值：** ✅ Memory + Timeline + Narrative 提供持续成长叙事

### Day 90（深度使用）
- **成长陪伴感：** ✅ AI 能结合 confirmed Memory 回答长期问题
- **Narrative：** ✅ 阶段叙事更丰富
- **Memory aging：** ✅ 未活跃的 Memory 逐渐衰减，系统保持新鲜
- **风险：** ⚠️ 用户如果停止使用，Memory 会过期；无主动召回机制

---

## 6. 性能报告

365 天模拟数据（200 条 checkin + 183 focus + 122 reading + 92 sport + 73 english + 183 todo + 1 goal）

| Projection | p50 (ms) | p95 (ms) | <10ms |
|---|---|---|---|
| Analytics.getDateRangeSummary (365d) | 0.56 | 0.75 | ✅ |
| GrowthIntelligence.buildDailyInsight | 30.65 | 32.83 | ⚠️ 基线（非 Phase 21 新增） |
| DailyFeedback | 0.01 | 0.03 | ✅ |
| GrowthTimeline | 0.01 | 0.03 | ✅ |
| GrowthNarrative | 0.01 | 0.02 | ✅ |
| RetentionContext.buildWelcomeBack | 0.30 | 0.48 | ✅ |
| RetentionContext.buildStreakReminder | 0.24 | 0.34 | ✅ |
| RetentionContext.getRetentionCandidate | 0.002 | 0.008 | ✅ |

**结论：** 所有 Phase 21 新增 runtime projection 均远低于 10ms 目标。GrowthIntelligence 的 ~30ms 是 Phase 19 基线，非 Phase 21 范围。

---

## 7. 安全审查

### 前端渲染
- Phase 21 新增 UI 全部使用 `textContent` 或 `document.createElement`
- ✅ 无新增 `innerHTML`（`workbench.js` 中的 innerHTML 均为 Phase 21 之前已有功能）
- ✅ `tests/workbenchDailyFeedback.test.js` 验证 Growth Stage 无 innerHTML
- ✅ `tests/retentionContext.test.js` 验证安全渲染

### 数据安全
- ✅ 无 API key / token / password / 聊天记录泄露
- ✅ 无敏感字段进入 RetentionContext 输出
- ✅ GrowthMemory candidate content 经 `SENSITIVE_PATTERN` 过滤

### 产品文案安全
- ✅ 无绝对化（"你一定会成功"）
- ✅ 无恐吓（"你的记录马上消失"）
- ✅ 无强迫（"你必须完成"）
- ✅ Welcome Back / Streak Reminder 使用温和鼓励语气

### AI 安全
- ✅ AI 权限保持只读
- ✅ Candidate 在 AI 上下文中标记为"可能趋势"，非事实
- ✅ Confirmed Memory 才可作为长期规律引用

---

## 8. 剩余风险

### P0（必须关注）
| 风险 | 说明 | 建议 |
|---|---|---|
| 无主动回访触发 | 离开应用后无法通知用户 | P2 引入 Service Worker Push |

### P1（建议优化）
| 风险 | 说明 | 建议 |
|---|---|---|
| Memory Candidate 出现慢 | 需要连续数据才能生成 | 提前管理用户预期 |
| Memory aging 静默 | 衰减过程用户无感知 | AI 交互时轻量提示 |
| Timeline 只在 Stats | Workbench 用户可能不看 Stats | Workbench 已显示 Stage，部分缓解 |

### P2（未来优化）
| 风险 | 说明 | 建议 |
|---|---|---|
| 无月度/季度主动报告 | 用户需自行打开 Stats | 增加"本月新事件 N 条"标记 |
| 无年度回顾 | 缺少长期仪式感 | 未来 Phase 考虑 |
| 长期未回访后"遗忘" | Memory expire 后 AI 不引用 | 正确设计，无需修改 |

---

## 9. 最终建议

**READY FOR PHASE 22**

Phase 21 内环（Daily Feedback → Timeline → Narrative → Stage → Retention → Memory → AI Coach）已形成稳定完整闭环。所有架构边界保持不变，性能远低于目标，安全审查通过，476 条前端测试 + 68 条后端测试全部通过。

系统可以进入 Phase 22。
