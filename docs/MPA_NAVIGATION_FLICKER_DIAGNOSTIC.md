# MPA Navigation Flicker Diagnostic

## Executive Summary

本诊断通过 CDP Screencast 逐帧捕获了 `stats.html → goals.html` 的真实导航过程，证实了用户肉眼可见的闪烁仍然存在。根因是 `app-booting` CSS 隐藏机制导致新页面首帧与最终状态之间出现一个 **40–60ms 的可见中间态**（无图标、无用户信息），而非 Navigation Gap 或字体 FOUT。

---

## User-Visible Symptom

用户从 stats/goals/ai 页面点击侧栏导航跳转时，可以观察到页面内容切换后侧栏经历一个两阶段变化：

1. 新页面内容区域立即出现（标题、卡片等）
2. 侧栏图标和用户信息在 **约 40–60ms 后才出现**

在 60fps 显示器上，这至少跨越 2–4 个渲染帧，足以被人眼感知为"闪一下"。

---

## 8306a35 Coverage

`8306a35 fix: eliminate MPA shell first-frame flicker` 引入了以下机制：

| 修改 | 效果 | 是否解决闪烁 |
|------|------|-------------|
| `shellBootstrap.js` — 在 DOMContentLoaded 同步设置用户名和日期标签 | 防止默认文本"同学"闪烁 | 部分 |
| `css/shared.css` 添加 `html.app-booting` 选择器隐藏图标和用户区域 | 防止 FontAwesome FOUT | 引入了新的两步渲染闪烁 |
| `userChrome.js` — `document.fonts.load()` 后移除 `app-booting` | 在字体就绪后显示图标 | 延迟了图标出现 |

**结论：8306a35 消除了"默认文本闪烁"和"图标 FOUT"，但用 `visibility:hidden → reveal` 替代了它们，制造了一个新的可见中间态。**

---

## Reproduction Matrix

| 路径 | Commit | First Paint | 图标出现 | 闪烁可见 |
|------|--------|-------------|---------|---------|
| stats → goals | 3ms | 56ms | ~113ms | YES |
| goals → ai | 1ms | 80ms | ~130ms | YES |
| ai → stats | 2ms | 52ms | ~105ms | YES |
| stats → ai | 2ms | 64ms | ~120ms | YES |
| workbench → goals | 2ms | 68ms | ~125ms | YES |
| goals → workbench | 2ms | 140ms | ~200ms | YES（+布局偏移） |

所有路线均复现闪烁。

---

## Navigation Timeline

以 `stats.html → goals.html` 为例（CDP Performance API + Screencast 实测值）：

| 时间点 | 相对导航开始 (ms) | 事件 |
|--------|-----------------|------|
| 0 | 0 | Navigation commit |
| ~10 | 10 | Unload event (旧页面) |
| ~13 | 13 | domInteractive（HTML 解析完成） |
| ~13-17 | 13-17 | 所有 9 个 render-blocking CSS 加载完成 |
| ~25 | 25 | Module scripts 开始执行 (shellBootstrap → userChrome → page JS) |
| ~46 | 46 | DOMContentLoaded（所有 deferred scripts 完成） |
| ~56 | 56 | **First Paint / FCP** — 页面可见，但 `app-booting` 仍激活 |
| 70 | 70 | **Screencast Frame 1** — 可见：无侧栏图标、无用户信息 |
| 77 | 77 | **Screencast Frame 2** — 与 Frame 1 相同 |
| 97 | 97 | **Screencast Frame 3** — 与 Frame 1 相同 |
| 113 | 113 | **Screencast Frame 4** — 图标出现、用户信息出现 → 稳定 |

**关键窗口：56ms → 113ms = 57ms 页面可见但侧栏不完整。**

---

## Browser Evidence

### Screencast 逐帧截图

- `frame_0000.png`：旧页面（stats）稳定态 — 有图标、有用户信息
- `frame_0001.png`（70ms）：新页面（goals）首帧 — **无图标、无用户信息**
- `frame_0002.png`（77ms）：同 Frame 1
- `frame_0003.png`（97ms）：同 Frame 1
- `frame_0004.png`（113ms）：图标和用户信息出现 → 稳定态

### Performance API

```json
{
  "first-paint": 56,
  "first-contentful-paint": 56,
  "domInteractive": 13.3,
  "domContentLoadedEventEnd": 46.2,
  "loadEventEnd": 47
}
```

### FontAwesome 字体状态

- `fa-solid-900.woff2` 已 preload 且 HTTP 304 缓存命中
- `font-display: block` — 浏览器不会显示 fallback 字形
- `document.fonts.check('900 16px "Font Awesome 6 Free"')` → `true`
- `document.fonts.check('400 16px "Font Awesome 6 Free"')` → `false`（仅 solid 权重被加载）

---

## DOM / CSS Analysis

### `app-booting` 机制

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

### 移除 `app-booting` 的触发链

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
4. 样式失效 → 浏览器安排下一帧 style recalc + repaint
5. **至少延迟 1–2 帧后才完成 repaint**

### CSS 层覆盖链（背景色冲突）

| 顺序 | 文件 | html background | body background |
|------|------|----------------|-----------------|
| 1 | `variables.css` | `#0f1114` (dark) | `#0f1114` (dark) |
| 2 | `shared.css` | — | `#0f1114` (dark) |
| 3 | `components.css` | — | — |
| 4 | inline `<style>` | — | 页面特定 |
| 5 | `calm-dawn-pro.css` | — | `#0f1114` (dark) |
| 6 | `calm-dawn-fusion.css` | — | `#faf8f2` (light) |
| 7 | `calm-dawn-1to1.css` | `#fbf8f1` (light) | gradient (light) |
| 8 | `xingzhixing.css` | — | gradient (light) |

**最终计算值：html = `rgb(251, 248, 241)`（light cream），body = light gradient。**

所有样式表均为 render-blocking，因此首帧应呈现最终值。但在生产环境（网络延迟）下，如果 CSS 文件加载时间不一致，可能出现中间态闪烁。

### Workbench vs Dashboard 侧栏差异

`assets/calm-dawn-1to1.css` 中：

- `body[data-theme="fusion"].dashboard-shell .sidebar`（stats/goals/ai）：`width: 220px; flex: 0 0 220px;` `.logo { display: none; }`
- `body[data-theme="fusion"].wb-pro .sidebar`（workbench）：`width: auto; flex: initial;` logo 可见

**workbench ↔ 其他页面导航时 sidebar 布局不同，产生额外 LAYOUT_SHIFT。**

---

## Font Analysis

| 属性 | 值 | 影响 |
|------|-----|------|
| `@font-face` font-display | `block` | 字体加载期间不显示 fallback（≤3s），防止 FOUT |
| preload | `<link rel="preload" as="font">` | 字体在 CSS 之前开始加载 |
| `document.fonts.load()` | 异步 Promise | 即使已缓存，回调仍在 microtask 中执行 |
| `app-booting` visibility:hidden | 在首帧隐藏图标 | 与 font-display: block 双重保护，但制造了 reveal 延迟 |

**FontAwesome 字体本身不导致 FOUT（font-display: block + preload 已足够），但 `app-booting` 机制导致了可感知的延迟出现。**

---

## Service Worker Analysis

开发模式下 `serviceWorkerRegistration.js` 检测到 `import.meta.env.DEV` 并主动注销 SW。

**所有网络请求的 `fromServiceWorker = false`。SW_CACHE_TRANSITION 不适用于当前开发环境。**

生产模式行为未在本次诊断中测试。

---

## Network Analysis

以 `stats → goals` 导航为例：

| 资源 | 类型 | 开始 (ms) | 耗时 (ms) | HTTP Cache |
|------|------|----------|----------|-----------|
| variables.css | link | 13 | 1 | 304 |
| shared.css | link | 13 | 1 | 304 |
| app.css | link | 13 | 2 | 200 |
| all.min.css | link | 13 | 3 | 304 |
| calm-dawn-pro.css | link | 13 | 4 | 304 |
| calm-dawn-fusion.css | link | 13 | 4 | 304 |
| calm-dawn-1to1.css | link | 13 | 4 | 304 |
| xingzhixing.css | link | 13 | 4 | 304 |
| fa-solid-900.woff2 | font | 18 | 0 | 304 (preload hit) |
| shellBootstrap.js | script | ~25 | ~5 | — |
| userChrome.js | script | ~25 | ~5 | — |

**9 个 render-blocking CSS 全部在 13-17ms 内加载完成（dev server 本地文件）。**

CSS 不是闪烁的瓶颈。瓶颈在于 JS 驱动的 `app-booting` reveal 时序。

---

## Root Cause

### 主根因：`app-booting` 两步渲染

```
HTML 解析完成 → CSSOM 就绪 → First Paint（app-booting 激活，图标隐藏）
                                    ↓
                          document.fonts.load() 异步完成
                                    ↓
                          app-booting 移除 → Style Recalc → Repaint
                                    ↓
                          图标和用户信息出现（~113ms）
```

**闪烁 = First Paint (56ms) 与 app-booting Reveal (~113ms) 之间的 57ms 可见中间态。**

### 次要因素

1. **CSS 层冲突**：`variables.css` 设置暗色背景 → `calm-dawn-1to1.css` 覆盖为亮色。在慢网络下，CSS 加载时序可能导致暗色→亮色闪变。
2. **Workbench 布局差异**：`wb-pro` 与 `dashboard-shell` 侧栏宽度/结构不同，跨类型导航时产生 LAYOUT_SHIFT。
3. **Module script 异步时序**：`document.fonts.load()` 即使字体已缓存，其 Promise 回调仍在 microtask 中执行，需要额外 1-2 帧才能反映到渲染。

---

## Evidence

1. **CDP Screencast Frame 1-3**（70ms-97ms）：页面已渲染但侧栏图标缺失
2. **CDP Screencast Frame 4**（113ms）：图标突然出现
3. **Performance API**: first-paint = 56ms, DCL = 46ms → 首帧在 DCL 后 10ms 发生
4. **计算样式**: `html.app-booting` 存在于首帧时 → `.sidebar .nav-item i` 的 `visibility: hidden`
5. **FontAwesome**: `font-display: block` + preload → 字体本身不导致 FOUT
6. **`userChrome.js` 源码**: `document.fonts.load().finally(revealChrome)` → 异步 reveal

---

## What 8306a35 Fixed

- ✅ 默认用户名"同学"闪烁（`shellBootstrap.js` 同步设置）
- ✅ FontAwesome 图标 FOUT（`app-booting` + `font-display: block`）
- ✅ Stats welcomeName / rangeLabel 首帧异常

## What 8306a35 Did Not Fix

- ❌ `app-booting` reveal 造成的 57ms 两步渲染闪烁
- ❌ CSS 层背景色冲突（暗→亮覆盖链）
- ❌ Workbench 与 Dashboard 侧栏布局差异导致的 LAYOUT_SHIFT
- ❌ MPA 导航本身的内容切换跳变

---

## Recommended Fix Direction

### 核心策略：消除两步渲染

**将侧栏的最终状态在首帧前确定，避免 `visibility: hidden → reveal` 模式。**

1. **移除 `app-booting` 机制**：FontAwesome 已有 `font-display: block` + preload，图标不会出现 fallback 字形。`app-booting` 是冗余保护，且是当前闪烁的直接原因。

2. **在 HTML 模板中预填用户名**：通过构建时注入或 inline script 在 `<head>` 中读取 `localStorage('cg_user')` 并同步设置 `#sidebarUserName` 文本，避免 `shellBootstrap.js` 在 DOMContentLoaded 后才设置。

3. **统一 `wb-pro` 与 `dashboard-shell` 的侧栏宽度**：确保 workbench 与其他页面的 sidebar 使用相同的 `width: 220px; flex: 0 0 220px`。

---

## Risk Assessment

| 修改 | 风险 | 缓解 |
|------|------|------|
| 移除 `app-booting` | 极慢网络下可能出现图标 FOUT | `font-display: block` 已兜底（最多阻塞 3s） |
| 预填用户名 | 构建复杂度增加 | 可用 1 行 inline script 在 `<head>` 实现 |
| 统一侧栏宽度 | workbench 布局可能需要适配 | 只改变量值，不动结构 |

---

## Files That Would Need Modification

| 文件 | 修改 |
|------|------|
| `css/shared.css` | 移除 `html.app-booting` 选择器规则 |
| `stats.html` / `goals.html` / `ai.html` / `workbench.html` / `index.html` | 移除 `class="app-booting"` |
| `js/shellBootstrap.js` | 改为 inline script 或移至 `<head>` 非 module 方式 |
| `js/userChrome.js` | 移除 `revealAfterChromeIsReady`，简化为直接渲染 |
| `assets/calm-dawn-1to1.css` | 统一 `wb-pro` / `dashboard-shell` 侧栏宽度 |

---

## Conclusion

**闪烁是 `app-booting` CSS 隐藏机制造成的两步渲染**，而非 Navigation Gap、字体 FOUT 或 Service Worker 缓存问题。8306a35 通过 `visibility: hidden → JS reveal` 防御了 FOUT 和默认文本闪烁，但代价是引入了一个 57ms 的可见中间态，用户肉眼将其感知为"闪一下"。

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
