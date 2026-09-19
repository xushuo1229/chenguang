# MPA 导航闪烁诊断

# 执行摘要

本诊断通过 CDP Screencast 逐帧捕获了 `stats.html → goals.html` 的真实导航过程，证实了用户肉眼可见的闪烁仍然存在。根因是 `app-booting` CSS 隐藏机制导致新页面首帧与最终状态之间出现一个 **40–60ms 的可见中间态**（无图标、无用户信息），而非 Navigation Gap 或字体 FOUT。

- --

# 用户可见症状

用户从 stats/goals/ai 页面点击侧栏导航跳转时，可以观察到页面内容切换后侧栏经历一个两阶段变化：

1. 新页面内容区域立即出现（标题、卡片等）
2. 侧栏图标和用户信息在 **约 40–60ms 后才出现**

在 60fps 显示器上，这至少跨越 2–4 个渲染帧，足以被人眼感知为"闪一下"。

- --

# 8306a35 覆盖

`8306a35 fix: eliminate MPA shell first-frame flicker` 引入了以下机制：

| 修改 | 效果 | 是否解决闪烁 |
|------|------|-------------|
| `shellBootstrap.js` — 在 DOMContentLoaded 同步设置用户名和日期标签 | 防止默认文本“同学”闪烁 | 部分 |
| `css/shared.css` 添加 `html.app-booting` 选择器隐藏图标和用户区域 | 防止 FontAwesome FOUT | 引入了新的两步渲染闪烁 |
| `userChrome.js` — `document.fonts.load()` 后移除 `app-booting` | 在字体就绪后显示图标 | 延迟了图标出现 |

* *结论：8306a35 消除了"默认文本闪烁"和"图标 FOUT"，但用 `visibility:hidden → reveal` 替代了它们，制造了一个新的可见中间态。**

- --

# 复制矩阵

| 路径 | 提交 | 首次绘制 | 图标出现 | 闪烁可见 |
|------|--------|-------------|---------|---------|
|统计→目标 |3毫秒 |56毫秒 |~113毫秒 |是的 |
|目标→人工智能 |1毫秒 |80毫秒 |~130毫秒 |是的 |
|AI的 → 统计 |2毫秒 |52毫秒 |~105毫秒 |是的 |
|AI →统计数据 |2毫秒 |64毫秒 |~120毫秒 |是的 |
|工作台→目标 |2毫秒 |68毫秒 |~125毫秒 |是的 |
|目标→工作台 |2毫秒 |140毫秒 |~200毫秒 |是的（布局偏移） |

所有路线均复现闪烁。

- --

# 导航时间线

以 `stats.html → goals.html` 为例（CDP 性能 API Screencast 实测值）：

| 时间点 | 相对导航开始 (ms) | 事件 |
|--------|-----------------|------|
| 0 | 0 | 导航提交 |
| ~10 | 10 | 卸载事件（旧页面） |
| ~13 | 13 | domInteractive（HTML 解析完成） |
| ~13-17 | 13-17 | 所有 9 个阻塞渲染的 CSS 加载完成 |
| ~25 | 25 | 模块脚本开始执行 (shellBootstrap → userChrome → 页面 JS) |
| ~46 | 46 | DOMContentLoaded（所有延迟脚本完成） |
| ~56 | 56 | **首次绘制 / FCP** — 页面可见，但 `app-booting` 仍激活 |
| 70 | 70 | **演示帧 1** — 可见：无侧栏图标、无用户信息 |
| 77 | 77 | **演示帧 2** — 与帧 1 相同 |
| 97 | 97 | **演示帧 3** — 与帧 1 相同 |
| 113 | 113 | **演示帧 4** — 图标出现、用户信息出现 → 稳定 |

* *关键窗口：56ms → 113ms = 57ms 页面可见但侧栏不完整。**

- --

# 浏览器证据

## 屏幕录制逐帧截图

- `frame_0000.png`：旧页面（stats）稳定态 — 有图标、有用户信息
- `frame_0001.png`（70ms）：新页面（goals）首帧 — **无图标、无用户信息**
- `frame_0002.png`（77ms）：同 Frame 1
- `frame_0003.png`（97ms）：同 Frame 1
- `frame_0004.png`（113ms）：图标和用户信息出现 → 稳定态

## 性能 API

```json
{
  "first-paint": 56,
  "first-contentful-paint": 56,
  "domInteractive": 13.3,
  "domContentLoadedEventEnd": 46.2,
  "loadEventEnd": 47
}
```

## FontAwesome 字体状态

- `fa-solid-900.woff2` 已预加载且 HTTP 304 缓存命中
- `font-display: block` — 浏览器不会显示后备字体
- `document.fonts.check('900 16px "Font Awesome 6 Free"')` → `true`
- `document.fonts.check('400 16px "Font Awesome 6 Free"')` → `false`（仅加载了 solid 权重）

- --

# DOM / CSS 分析

## `app-booting` 机制

所有页面 `<html>` 元素带有 `class="app-booting"`。

`css/shared.css` L44-L50:

```css
html.app-booting .sidebar .nav-item i,
html.app-booting .sidebar .wb-user,
html.app-booting #welcomeName,
html.app-booting #rangeLabel {
  visibility: hidden;
}
```

这导致首帧渲染时：
- `.sidebar .nav-item i`（FontAwesome 图标）→ 不可见
- `.sidebar .wb-user`（用户头像和名字）→ 不可见
- `#welcomeName` → 不可见
- `#rangeLabel` → 不可见

## 移除 `app-booting` 的触发链

`js/userChrome.js` L33-L38:

```js
function revealAfterChromeIsReady() {
    var timeoutId = setTimeout(revealChrome, 200);
    document.fonts.load('900 1em "Font Awesome 6 Free"').finally(function () {
      clearTimeout(timeoutId);
      revealChrome();
    });
}
```

1. `DOMContentLoaded` 触发 → `userChrome.js` 执行
2. `document.fonts.load()` 返回 Promise（即使字体已缓存，Promise 回调仍在 microtask 中异步执行）
3. `.finally()` → `revealChrome()` → 移除 `app-booting` class
4. 样式失效 → 浏览器安排下一帧 style recalc   repaint
5. **至少延迟 1–2 帧后才完成 repaint**

## CSS 层覆盖链（背景色冲突）

|顺序 |文件 |HTML 背景 |正体背景 |
|------|------|----------------|-----------------|
| 1 | `variables.css` | `#0f1114`（深色） | `#0f1114`（深色） |
| 2 | `shared.css` | — | `#0f1114`（深色） |
| 3 | `components.css` | — | — |
| 4 | 内联 `<style>` | — | 页面特定 |
| 5 | `calm-dawn-pro.css` | — | `#0f1114`（深色） |
| 6 | `calm-dawn-fusion.css` | — | `#faf8f2`（浅色） |
| 7 | `calm-dawn-1to1.css` | `#fbf8f1`（浅色） | 渐变（浅色） |
| 8 | `xingzhixing.css` | — | 渐变（浅色） |

* *最终计算值：html = `rgb(251, 248, 241)`（浅奶油色），body = 浅渐变。**

所有样式表均为 render-blocking，因此首帧应呈现最终值。但在生产环境（网络延迟）下，如果 CSS 文件加载时间不一致，可能出现中间态闪烁。

## 工作台 vs 仪表板 侧栏差异

`assets/calm-dawn-1to1.css` 中：

- `body[data-theme="fusion"].dashboard-shell .sidebar`（统计/目标/人工智能）：`width: 220px; flex: 0 0 220px;` `.logo { display: none; }`
- `body[data-theme="fusion"].wb-pro .sidebar`（工作台）：`width: auto; flex: initial;` logo 可见

* *工作台 ↔ 在其他页面导航时侧边栏布局不同，产生额外的 LAYOUT_SHIFT。**

- --

# 字体分析

| 属性 | 值 | 影响 |
|------|-----|------|
| `@font-face` 字体显示 | `block` | 字体加载期间不显示后备字体（≤3秒），防止 FOUT |
| 预加载 | `<link rel="preload" as="font">` | 字体在 CSS 之前开始加载 |
| `document.fonts.load()` | 异步 Promise | 即使已缓存，回调仍在微任务中执行 |
| `app-booting` 可见性:hidden | 在首帧隐藏图标 | 与 font-display: block 双重保护，但会产生显示延迟 |

* *FontAwesome 字体本身不会导致 FOUT（font-display: block 和 preload 已经足够），但 `app-booting` 机制会导致可感知的延迟出现。**

- --

# 服务工作者分析

开发模式下 `serviceWorkerRegistration.js` 检测到 `import.meta.env.DEV` 并主动注销 SW。

* *所有网络请求的 `fromServiceWorker = false`。SW_CACHE_TRANSITION 不适用于当前开发环境。**

生产模式行为未在本次诊断中测试。

- --

# 网络分析

以 `stats → goals` 导航为例：

| 资源 | 类型 | 开始 (毫秒) | 耗时 (毫秒) | HTTP 缓存 |
|------|------|----------|----------|-----------|
| variables.css | 链接 | 13 | 1 | 304 |
| shared.css | 链接 | 13 | 1 | 304 |
| app.css | 链接 | 13 | 2 | 200 |
| all.min.css | 链接 | 13 | 3 | 304 |
| calm-dawn-pro.css | 链接 | 13 | 4 | 304 |
| calm-dawn-fusion.css | 链接 | 13 | 4 | 304 |
| calm-dawn-1to1.css | 链接 | 13 | 4 | 304 |
| xingzhixing.css | 链接 | 13 | 4 | 304 |
| fa-solid-900.woff2 | 字体 | 18 | 0 | 304（预加载命中） |
| shellBootstrap.js | 脚本 | ~25 | ~5 | — |
| userChrome.js | 脚本 | ~25 | ~5 | — |

* *9 个阻止渲染的 CSS 全部在 13-17 毫秒内加载完成（开发服务器本地文件）。**

CSS 不是性能瓶颈。瓶颈在于 JS 驱动的 `app-booting` reveal 时序。

- --

# 根本原因

## 主根因：`app-booting` 两步渲染

```
HTML 解析完成 → CSSOM 就绪 → First Paint（app-booting 激活，图标隐藏）
                                    ↓
                          document.fonts.load() 异步完成
                                    ↓
                          app-booting 移除 → Style Recalc → Repaint
                                    ↓
                          图标和用户信息出现（~113ms）
```

* *闪烁 = First Paint （56ms） 与 app-booting Reveal （~113ms） 之间的 57ms 可见中间态。**

## 次要因素

1. **CSS 层冲突**：`variables.css` 设置暗色背景 → `calm-dawn-1to1.css` 覆盖为亮色。在慢网络下，CSS 加载时序可能导致暗色→亮色闪变。
2. **Workbench 布局差异**：`wb-pro` 与 `dashboard-shell` 侧栏宽度/结构不同，跨类型导航时产生 LAYOUT_SHIFT。
3. **Module 脚本异步时序**：`document.fonts.load()` 即使字体已缓存，其 Promise 回调仍在 microtask 中执行，需要额外 1-2 帧才能反映到渲染。

- --

# 证据

1. **CDP Screencast 帧 1-3**（70ms-97ms）：页面已渲染但侧栏图标缺失
2. **CDP Screencast 帧 4**（113ms）：图标突然出现
3. **Performance API**: first-paint = 56ms, DCL = 46ms → 首帧在 DCL 后 10ms 发生
4. **计算样式**: `html.app-booting` 存在于首帧时 → `.sidebar .nav-item i` 的 `visibility: hidden`
5. **FontAwesome**: `font-display: block`   preload → 字体本身不导致 FOUT
6. **`userChrome.js` 源码**: `document.fonts.load().finally(revealChrome)` → 异步 reveal

- --

# 8306a35 修复了什么

- ✅ 默认用户名"同学"闪烁（`shellBootstrap.js` 同步设置）
- ✅ FontAwesome 图标 FOUT（`app-booting`   `font-display: block`）
- ✅ Stats welcomeName / rangeLabel 首帧异常

# 8306a35 未修复的内容

- ❌ `app-booting` reveal 造成的 57ms 两步渲染闪烁
- ❌ CSS 层背景色冲突（暗→亮覆盖链）
- ❌ Workbench 与 Dashboard 侧栏布局差异导致的 LAYOUT_SHIFT
- ❌ MPA 导航本身的内容切换跳变

- --

# 建议的修复方向

## 核心策略：消除两步渲染

* *将侧栏的最终状态在首帧前确定，避免 `visibility: hidden → reveal` 模式。**

1. **Remove `app-booting` mechanism**: FontAwesome already has `font-display: block` preload, so icons will not show fallback glyphs. `app-booting` is redundant protection and is the direct cause of the current flickering.

2. **在 HTML 模板中预填用户名**：通过构建时注入或内联脚本在 `<head>` 中读取 `localStorage('cg_user')` 并同步设置 `#sidebarUserName` 文本，避免 `shellBootstrap.js` 在 DOMContentLoaded 后才设置。

3. **统一 `wb-pro` 与 `dashboard-shell` 的侧栏宽度**：确保工作台与其他页面的侧边栏使用相同的 `width: 220px; flex: 0 0 220px`。

- --

# 风险评估

| 修改 | 风险 | 缓解 |
|------|------|------|
| 移除 `app-booting` | 在极慢网络下可能出现图标 FOUT | `font-display: block` 已兜底（最多阻塞 3 秒） |
| 预填用户名 | 构建复杂度增加 | 可用 1 行内联脚本在 `<head>` 实现 |
| 统一侧栏宽度 | workbench 布局可能需要适配 | 只改变量值，不动结构 |

- --

# 需要修改的文件

| 文件 | 修改 |
|------|------|
| `css/shared.css` | 移除 `html.app-booting` 选择器规则 |
| `stats.html` / `goals.html` / `ai.html` / `workbench.html` / `index.html` | 移除 `class="app-booting"` |
| `js/shellBootstrap.js` | 改为内联脚本或移至 `<head>` 非模块方式 |
| `js/userChrome.js` | 移除 `revealAfterChromeIsReady`，简化为直接渲染 |
| `assets/calm-dawn-1to1.css` | 统一 `wb-pro` / `dashboard-shell` 侧栏宽度 |

- --

# 结论

* *闪烁是由 `app-booting` CSS 隐藏机制引起的两步渲染**，而不是 Navigation Gap、字体 FOUT 或 Service Worker 缓存问题。8306a35 通过 `visibility: hidden → JS reveal` 防御了 FOUT 和默认文本闪烁，但代价是引入了一个 57 毫秒的可见中间状态，用户肉眼会感知为“闪一下”。

```
Diagnosis:
app-booting CSS 隐藏机制导致新页面首帧（~56ms）缺少侧栏图标和用户信息，
直到 document.fonts.load() 异步完成后 app-booting 才被移除（~113ms），
产生 57ms 的可见中间态闪烁。

Category:
NEW_DOCUMENT_FOUC + LAYOUT_SHIFT

8306a35:
PARTIALLY_FIXED

Confidence:
HIGH

Evidence:
CDP Screencast 逐帧截图（frame_0001 到 frame_0004）显示 70ms→113ms 之间
图标缺失→出现；Performance API 确认 first-paint 在 56ms 而图标出现在 113ms。

Code Change Required:
YES

Recommended Next Step:
移除 app-booting 机制，依赖 font-display: block 防止 FOUT，并在 <head> 中
同步预填用户名。
```
