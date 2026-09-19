# Phase 今日计划 Final

# 1. 目标

之前：

```
今日计划入口
      ↓
workbench.html
      ↓
首页 Dashboard 摘要
```

问题：没有独立执行空间，"今日计划"只是首页跳转入口。

现在：

```
今日计划入口
      ↓
today.html
      ↓
今日任务执行工作区
```

首页保留 Dashboard 摘要定位。

- --

# 2. 架构设计

```
CGStore (chenguangData)
   |
todos[]
   |
getTodosByDate(todayStr())
   |
today.html
   |
pages/today.js
   |
Analytics (todoStatsIn / todoCompletionRate)
```

今日计划不是新的数据类型。不是 `todayPlans[]`。

- --

# 3. 功能列表

- 独立今日计划页面（today.html）
- 今日任务过滤（getTodosByDate）
- 新增任务（addTodo   文本/时间输入）
- 完成任务（toggleTodo）
- 编辑任务（updateTodo）
- 删除任务（removeTodo）
- 完成率统计（总/完成/未完成/率 + 进度条）
- 首页同步（chenguang:update 事件，共享 CGStore）
- CGStore 数据同步（LOCAL/REMOTE 继承）
- 响应式支持（Desktop   Mobile 640px 断点）

- --

# 4. 修改文件

| 文件 | 修改 |
|------|------|
|today.html |新增今日计划页面 |
|页数/today.js |今日计划页面逻辑 |
|测试/todayPlan.test.js |自动化测试（12 项） |
|stats.html |侧栏导航入口 → today.html |
|goals.html |侧栏导航入口 → today.html |
|ai.html |侧栏导航入口 → today.html |
|workbench.html |侧栏导航入口 → today.html |

- --

# 5. 测试结果

```yaml
Frontend: 555/557
Backend: 68/68
Today Plan: 12/12
Build: PASS
git diff --check: PASS
```

- --

# 6. 已知问题

`tests/workbenchDailyFeedback.test.js`（2 失败）

现有问题 — 不属于今日计划阶段。

- --

# 7. 冻结声明

Phase 今日计划已冻结。

后续修改必须：
1. 明确需求
2. 新建 Phase
3. 不直接破坏当前数据模型
