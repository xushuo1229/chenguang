# MPA 页面首帧闪烁专项修复报告

# 1. 根本原因

MPA 每次跳转都会重新加载静态 HTML。Stats / Goals / AI 在字体和页面 JS 完成前先显示默认壳：

- 侧边栏 HTML 中预写「同 / 同学」，JS 后替换为真实用户。
- Stats 的 `#rangeLabel` 预写 `…`，JS 后替换为完整时间范围。
- Stats / Goals / AI 没有与 Workbench 一致的 FontAwesome Solid 字体预加载。
- 旧初始化逻辑在 `DOMContentLoaded` 后才渲染用户壳，首帧与稳定态之间存在可见跳变。

# 2. 修改文件

- `workbench.html`、`stats.html`、`goals.html`、`ai.html`：加入 `app-booting`、Shell Bootstrap，并清空错误默认壳值;非 Workbench 页面补齐 FontAwesome Solid preload。
- `css/shared.css`：新增启动期局部 `visibility: hidden` 规则，只隐藏侧边栏图标、侧边栏用户区和 Stats 头部值，不做整页白屏。
- `js/shellBootstrap.js`：新增轻量首帧壳初始化模块。
- `js/userChrome.js`: Avoid writing the DOM with duplicate values; remove `app-booting` after FontAwesome Solid is ready, keeping a 200ms fallback.
- `tests/shellBootstrap.test.js`、`tests/dashboardRenderStability.test.js`、`tests/pageInitialization.test.js`：补充壳初始化、加载顺序、默认占位清理、字体预加载与无路由动画回归。

# 3. Shell 启动策略

`js/shellBootstrap.js` 只读取既有登录用户镜像 `cg_user`，读取 `nickname/name`，在业务 JS 前写入侧边栏用户名、头像首字、`#welcomeName` 和 Stats 默认 `#week` 标签。 它不读取 `chenguangData`，不初始化 CGStore，不请求网络，不写业务数据，不参与同步。

HTML 中的错误默认值已清空。在 `app-booting` 移除前，这些不稳定区域保持局部不可见；移除后首次可见值就是最终值。

# 4. FontAwesome 策略

继续使用项目本地 FontAwesome。统计 / 目标 / AI 已补齐：

```html
<link rel="preload" href="assets/vendor/fontawesome/webfonts/fa-solid-900.woff2" as="font" type="font/woff2" crossorigin>
```

CSS 中 FontAwesome 已使用 `font-display: block`。启动期隐藏侧边栏图标，`userChrome` 只等待 Solid 字体可用即显示，避免等待全部字体;200ms 兜底用于防止字体异常导致永久隐藏。

# 5. 用户名策略

登录用户 `自律王` 的验证结果：

- `sidebarUserName` 首次可见值：`自律王`。
- `sidebarUserAvatar` 首次可见值：`自`。
- 可见的 `同学 → 自律王` 替换：0 次。

Note: There is a hidden DOM mutation when static HTML empty values are converted to the final Bootstrap values; this is not considered a visible error default state replacement. `userChrome` has added protection to prevent writing the same value repeatedly.

# 6. 统计策略

Stats 默认 `week` 范围在 Shell Bootstrap 中直接生成最终展示文本，例如：

```text
本周 · 2026年9月14日 – 2026年9月20日
```

验证结果：

- `#welcomeName` 首次可见值：`· 自律王`。
- `#rangeLabel` 首次可见值：`本周 · 2026年9月14日 – 2026年9月20日`。
- 可见的 `… → 最终值` 替换：0 次。

用户切换时间范围后，`pages/stats.js` 仍按原逻辑更新标签；该变化属于用户主动交互，不是首帧闪烁。

# 7. 浏览器验证

Using Microsoft Edge Headless Chrome DevTools Protocol verification, the test user is `自律王`.

## 冷加载 20 次 / 页

|页面 |样本 |T0→T2 P95 |T1→T2 P95 |最大 CLS |可见默认壳 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 统计 | 20 | 111毫秒 | 55毫秒 | 0 | 0 |
| 目标 | 20 | 119毫秒 | 35毫秒 | 0 | 0 |
| 人工智能 | 20 | 80毫秒 | 37毫秒 | 0 | 0 |

## 页面间跳转 20 次 / 路径

| Path | Sample | T0→T2 P95 | T1→T2 P95 | Max CLS | Visible Default Shell |
| --- | ---: | ---: | ---: | ---: | ---: |
|统计数据 → 进球 |20 |61毫秒 |60毫秒 |0 |
|目标→人工智能 |20 |83毫秒 |34毫秒 |0 |0 |
|AI→统计 |20 |83毫秒 |41毫秒 |0 |0 |

所有关键元素在首次可见时的文本均为最终值；T1→T2 P95 均满足 ≤100ms。T0→T2 是更严格的导航全程口径，Stats / Goals 冷加载超过 100ms，但不表示可见默认壳停留。

## 未测量项

- 慢速3G / 快速3G：`NOT MEASURED`。已尝试 CDP 网络限速采样，但受测页面状态未可靠捕获；不能伪造结果。
- 首帧/稳定帧像素差异比率：`NOT MEASURED`。
- 页面壳元素逐项 `x/y/width/height` 差值：`NOT MEASURED`。
- FCP / LCP / 资源逐项时序报告：`NOT MEASURED`。

# 8. 测试

- Frontend：544 / 545 通过，1 项失败为既有 `tests/workbenchDailyFeedback.test.js:60`，与本次修复无关。
- Frontend 首帧专项：`shellBootstrap`、`dashboardRenderStability`、`pageInitialization` 合计 18 / 18 通过。
- Backend：68 / 68 通过。
- Build：通过；`js/shellBootstrap.js` 已以 ES module 参与 Vite 构建，无未打包脚本警告。
- `git diff --check`：通过。

# 9. 回归

未修改：

- CGStore 数据语义。
- 分析。
- 目标引擎。
- AI 上下文 / AI API。
- 同步协议。
- 后端 / JWT / 认证。
- 数据结构、localStorage 数据格式、revision / updatedAt / deviceId。

本次修复只增加运行时页面壳初始化与局部展示保护，不改变业务统计、目标计算、AI 权限或同步协议。

# 10. 剩余风险

- 慢速网络仍未完成量化验收；在补齐可靠自动化前不能宣称 Slow 3G PASS。
- 若字体请求异常，侧边栏图标 / 用户区最多延迟 200ms 显示；这是避免永久隐藏的兜底。
- Stats 的默认周标签由 Shell Bootstrap 生成；后续如果 Analytics 周定义变化，必须同步该展示层日期逻辑或改为局部等待最终业务值。

# 11. 阶段最终审查

独立复核结论：`PASS_WITH_CONDITIONS`。Shell Bootstrap、登录态、`cg_user` 异常输入、FontAwesome、Stats scope、Mutation、架构边界和既有回归均通过复核；Fast 3G / Slow 3G 仍为 `NOT MEASURED`。
