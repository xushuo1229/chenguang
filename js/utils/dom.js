/**
 * 知行 · DOM 工具函数 (ES Module)
 *
 * 本文件提供了一组简化 DOM 操作的工具函数。
 *
 * DOM 是什么？
 * DOM（Document Object Model，文档对象模型）是浏览器将 HTML 页面解析后
 * 生成的一棵"对象树"。页面上的每个标签（如 <div>、<button>）都是树上的一个节点。
 * JavaScript 通过 DOM API 来读取、修改页面内容。
 *
 * 本文件封装了常用的 DOM 操作，让代码更简洁易读。
 */
'use strict';

// ============================================================
// $ 函数 - 快速查询单个 DOM 元素
// ============================================================
// 用法: $('选择器') 或 $('选择器', 父元素)
//
// 为什么需要这个函数？
// 原生写法 document.querySelector('#btn') 太长了。
// 用 $('#btn') 可以更快速地获取页面上的某个元素。
//
// 参数说明：
//   sel  - CSS 选择器字符串，如 '.card'、'#myId'、'button'
//   root - 可选，在哪个父元素内查找（默认是整个 document）
//
// 返回值：找到的 DOM 元素，如果没找到则返回 null
function $(sel, root) {
  // 使用 try-catch 防止选择器语法错误导致程序崩溃
  try { return (root || document).querySelector(sel); }
  catch (_) { return null; }
}

// ============================================================
// $$ 函数 - 批量查询多个 DOM 元素
// ============================================================
// 用法: $$('.task-item')
//
// 与 $ 的区别：$ 只返回第一个匹配的元素，$$ 返回所有匹配的元素。
//
// 返回值：一个数组（Array），包含所有匹配的 DOM 元素
// 注意：querySelectorAll 返回的是 NodeList（类数组），用 Array.from 转成真正的数组
// 这样才能使用 .map()、.filter() 等数组方法
function $$(sel, root) {
  return Array.from((root || document).querySelectorAll(sel));
}

// ============================================================
// esc / escapeHtml 函数 - 转义 HTML 特殊字符（防 XSS 攻击）
// ============================================================
// 用法: esc('用户输入的内容')
//
// 为什么需要这个函数？
// 如果用户在输入框里输入了 <script>alert('黑客攻击')</script>，
// 浏览器会把它当作真正的 HTML 标签来执行，这就是 XSS 攻击。
// esc 函数把特殊字符转换成安全的"转义字符"：
//   < 变成 &lt;   > 变成 &gt;   & 变成 &amp;   " 变成 &quot;   ' 变成 &#39;
// 转换后浏览器只会显示文字，不会执行任何代码。
//
// 参数：
//   s - 要转义的字符串
//
// 返回值：转义后的安全字符串
function esc(s) {
  // 如果传入的不是字符串，直接返回空字符串（防御性编程）
  if (typeof s !== 'string') return '';
  // 定义特殊字符到转义字符的映射表
  var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  // 用正则表达式匹配所有特殊字符，逐个替换成转义后的字符
  return s.replace(/[&<>"']/g, function (c) { return map[c]; });
}

// ============================================================
// setText 函数 - 安全地设置元素的纯文本内容
// ============================================================
// 用法: setText('#msg', '你好')  或  setText(dom元素, '你好')
//
// 与 setHTML 的区别：setText 不会解析 HTML 标签，只显示纯文本。
// 比如 setText(el, '<b>加粗</b>')，页面会直接显示 "<b>加粗</b>" 这几个字。
//
// 参数：
//   sel - CSS 选择器字符串（'#msg' / '.cls'），或 DOM 元素对象，
//         也兼容裸 id（'msg'）——workbench 等页大量使用裸 id 调用，
//         此前会被当作类型选择器而静默失效，导致仪表盘数字冻结（Phase 15 P0 修复）
//   val - 要显示的文本内容
function setText(sel, val) {
  // 字符串：先按 id 精确匹配（裸 id 调用），再回退 CSS 选择器；非字符串按 DOM 元素处理
  var el = typeof sel === 'string' ? (document.getElementById(sel) || $(sel)) : sel;
  // 找到元素后，用 textContent 设置文本（textContent 是纯文本，不会解析 HTML）
  if (el) el.textContent = val != null ? val : '';
}

// ============================================================
// setHTML 函数 - 安全地设置元素的 HTML 内容
// ============================================================
// 用法: setHTML('#msg', '欢迎回来')
//
// 这个函数会先用 esc() 转义用户输入，防止 XSS 攻击，
// 然后再设置 innerHTML。
//
// 参数：
//   sel - CSS 选择器字符串，或者 DOM 元素对象
//   val - 要显示的文本内容
function setHTML(sel, val) {
  var el = typeof sel === 'string' ? $(sel) : sel;
  // 先转义再赋值，双重保险
  if (el) el.innerHTML = esc(val != null ? val : '');
}

// ============================================================
// debounce 函数 - 防抖（延迟执行）
// ============================================================
// 用法: input.addEventListener('input', debounce(search, 300))
//
// 什么是防抖？
// 假设用户在搜索框里快速输入"苹果手机"，每个字都会触发搜索事件。
// 如果每个字都发一次请求，服务器会收到 4 次请求，太浪费了。
// 防抖的策略是：用户停止输入后，再等待一段时间（比如 300ms）才执行函数。
// 如果在等待期间又输入了新内容，之前的等待会被取消，重新计时。
//
// 类比：就像你等电梯关门——有人进来就重新等，没人了才关门。
//
// 参数：
//   fn    - 要执行的函数
//   delay - 等待时间，单位毫秒（默认 300ms）
//
// 返回值：一个新的函数（包装了防抖逻辑）
function debounce(fn, delay) {
  // 如果没有传 delay 参数，默认 300 毫秒
  if (delay === undefined) delay = 300;
  // timer 用于记录当前的定时器 ID
  var timer = null;
  // 返回一个新函数，这个函数包含了防抖逻辑
  return function () {
    // 保存原始的参数和 this 上下文
    var args = arguments;
    var ctx = this;
    // 如果之前有定时器在倒计时，先取消它
    if (timer) clearTimeout(timer);
    // 重新设置一个新的定时器
    timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
  };
}

// ============================================================
// throttle 函数 - 节流（固定间隔执行）
// ============================================================
// 用法: window.addEventListener('scroll', throttle(handleScroll, 300))
//
// 什么是节流？
// 滚动事件每秒可能触发几十甚至上百次，如果每次都执行处理函数，页面会卡顿。
// 节流的策略是：每隔一段时间（比如 300ms）最多执行一次函数。
// 在间隔时间内即使触发了多次，也只会执行第一次。
//
// 与防抖的区别：
// - 防抖：等用户停下来后才执行（适合搜索输入）
// - 节流：固定频率执行，防止过于频繁（适合滚动、窗口缩放）
//
// 类比：就像水龙头的节水阀——无论你拧多快，出水速度是固定的。
//
// 参数：
//   fn    - 要执行的函数
//   delay - 最小间隔时间，单位毫秒（默认 300ms）
//
// 返回值：一个新的函数（包装了节流逻辑）
function throttle(fn, delay) {
  if (delay === undefined) delay = 300;
  // last 记录上一次执行函数的时间戳
  var last = 0;
  return function () {
    var args = arguments;
    var ctx = this;
    // 获取当前时间戳
    var now = Date.now();
    // 判断是否距离上次执行已经超过了指定的间隔时间
    if (now - last >= delay) {
      last = now;  // 更新上次执行时间
      fn.apply(ctx, args);  // 执行函数
    }
  };
}

// ============================================================
// 将工具函数注册到全局对象，方便在任何地方使用
// ============================================================
// globalThis 是浏览器和 Node.js 都支持的全局对象
// 这样在其他文件中可以直接调用 $()、$$()、toast() 等函数
globalThis.$ = $;
globalThis.$$ = $$;
globalThis.esc = esc;
globalThis.escapeHtml = esc;   // escapeHtml 是 esc 的别名，方便记忆
globalThis.setText = setText;
globalThis.setHTML = setHTML;
globalThis.debounce = debounce;
globalThis.throttle = throttle;

// 同时挂载到 CGDom 命名空间下，避免全局变量污染
// 用法：CGDom.$('#id')、CGDom.debounce(fn, 300)
globalThis.CGDom = { $: $, $$: $$, esc: esc, setText: setText, setHTML: setHTML, debounce: debounce, throttle: throttle };

// ES Module 导出，支持 import { $, $$ } from './dom.js' 语法
export { $, $$, esc, setText, setHTML, debounce, throttle };
export default { $: $, $$: $$, esc: esc, setText: setText, setHTML: setHTML, debounce: debounce, throttle: throttle };
