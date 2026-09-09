/**
 * ============================================================
 * 晨光自律台 · 前端资源压缩构建脚本
 * ------------------------------------------------------------
 * 用法:
 *   npm install          # 安装压缩工具依赖
 *   npm run build        # 压缩 HTML/CSS/JS 到 dist/ 目录
 *
 * 压缩效果 (预估):
 *   - HTML:   减少 ~30% (移除空白/注释)
 *   - CSS:    减少 ~25% (移除空白/注释/合并规则)
 *   - JS:     减少 ~40% (Terser 变量名缩短/死代码消除)
 *   - 总体积: 2.3MB → ~1.4MB (减少 ~40%)
 *
 * GitHub Actions 部署时自动运行 build, 从 dist/ 发布
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// 压缩工具 (延迟加载, 避免未安装时报错)
let terser, CleanCSS, htmlMinifier;

try {
  terser = require('terser');
  CleanCSS = require('clean-css');
  htmlMinifier = require('html-minifier-terser');
} catch (e) {
  console.error('[build] 依赖未安装, 请先运行: npm install');
  console.error('[build] 或直接部署源文件 (GitHub Pages 已启用 gzip)');
  process.exit(0); // 不阻塞部署
}

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// 需要压缩的文件类型
const HTML_FILES = ['index.html', 'login.html', 'register.html', 'dashboard.html', 'stats.html'];
const CSS_DIR = path.join(ROOT, 'css');
const JS_DIRS = ['js/api', 'js/app', 'js/charts', 'js/services', 'js/utils'];

// 静态资源直接复制 (不压缩)
const COPY_DIRS = ['server'];

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 压缩 JS 文件
 */
async function minifyJS(inputPath, outputPath) {
  const code = fs.readFileSync(inputPath, 'utf8');
  const result = await terser.minify(code, {
    module: true,
    format: { comments: false },
    compress: { drop_console: false }, // 保留 console (调试用)
  });

  if (result.error) throw result.error;
  fs.writeFileSync(outputPath, result.code, 'utf8');
  return { before: code.length, after: result.code.length };
}

/**
 * 压缩 CSS 文件
 */
function minifyCSS(inputPath, outputPath) {
  const css = fs.readFileSync(inputPath, 'utf8');
  const result = new CleanCSS({
    level: 2, // 高级优化
    returnFormatted: false,
  }).minify(css);

  if (result.errors.length > 0) throw new Error(result.errors.join('\n'));
  fs.writeFileSync(outputPath, result.styles, 'utf8');
  return { before: css.length, after: result.styles.length };
}

/**
 * 压缩 HTML 文件
 */
async function minifyHTML(inputPath, outputPath) {
  const html = fs.readFileSync(inputPath, 'utf8');
  const result = await htmlMinifier.minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    sortAttributes: true,
    sortClassName: true,
  });

  fs.writeFileSync(outputPath, result, 'utf8');
  return { before: html.length, after: result.length };
}

/**
 * 复制目录 (递归)
 */
function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 主构建流程
 */
async function build() {
  const startTime = Date.now();
  let totalBefore = 0;
  let totalAfter = 0;
  let fileCount = 0;

  console.log('================================================');
  console.log('  晨光自律台 · 前端构建');
  console.log('================================================\n');

  // 清理 dist
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  ensureDir(DIST);

  // 1. 压缩 HTML
  console.log('[1/4] 压缩 HTML...');
  for (const file of HTML_FILES) {
    const input = path.join(ROOT, file);
    if (!fs.existsSync(input)) continue;
    const output = path.join(DIST, file);
    const stats = await minifyHTML(input, output);
    totalBefore += stats.before;
    totalAfter += stats.after;
    fileCount++;
    const saved = Math.round((1 - stats.after / stats.before) * 100);
    console.log(`  ✓ ${file}  ${fmt(stats.before)} → ${fmt(stats.after)}  (-${saved}%)`);
  }

  // 2. 压缩 CSS
  console.log('\n[2/4] 压缩 CSS...');
  ensureDir(path.join(DIST, 'css'));
  const cssFiles = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'));
  for (const file of cssFiles) {
    const input = path.join(CSS_DIR, file);
    const output = path.join(DIST, 'css', file);
    const stats = minifyCSS(input, output);
    totalBefore += stats.before;
    totalAfter += stats.after;
    fileCount++;
    const saved = Math.round((1 - stats.after / stats.before) * 100);
    console.log(`  ✓ css/${file}  ${fmt(stats.before)} → ${fmt(stats.after)}  (-${saved}%)`);
  }

  // 3. 压缩 JS
  console.log('\n[3/4] 压缩 JS...');
  for (const dir of JS_DIRS) {
    const srcDir = path.join(ROOT, dir);
    if (!fs.existsSync(srcDir)) continue;
    const destDir = path.join(DIST, dir);
    ensureDir(destDir);

    const jsFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
    for (const file of jsFiles) {
      const input = path.join(srcDir, file);
      const output = path.join(destDir, file);
      try {
        const stats = await minifyJS(input, output);
        totalBefore += stats.before;
        totalAfter += stats.after;
        fileCount++;
        const saved = Math.round((1 - stats.after / stats.before) * 100);
        console.log(`  ✓ ${dir}/${file}  ${fmt(stats.before)} → ${fmt(stats.after)}  (-${saved}%)`);
      } catch (err) {
        console.warn(`  ⚠ ${dir}/${file} 压缩失败: ${err.message}, 直接复制`);
        fs.copyFileSync(input, output);
      }
    }
  }

  // 4. 复制静态资源
  console.log('\n[4/4] 复制静态资源...');
  // service-worker.js
  if (fs.existsSync(path.join(ROOT, 'service-worker.js'))) {
    fs.copyFileSync(path.join(ROOT, 'service-worker.js'), path.join(DIST, 'service-worker.js'));
    console.log('  ✓ service-worker.js');
  }
  // server 目录
  for (const dir of COPY_DIRS) {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(DIST, dir));
      console.log(`  ✓ ${dir}/ (直接复制)`);
    }
  }

  // 汇总
  const elapsed = Date.now() - startTime;
  const totalSaved = Math.round((1 - totalAfter / totalBefore) * 100);
  console.log('\n================================================');
  console.log(`  构建完成! ${fileCount} 个文件, 耗时 ${elapsed}ms`);
  console.log(`  总体积: ${fmt(totalBefore)} → ${fmt(totalAfter)}  (-${totalSaved}%)`);
  console.log(`  输出目录: ${DIST}`);
  console.log('================================================\n');
}

/** 格式化字节 */
function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(2)}MB`;
}

// 运行
build().catch(err => {
  console.error('[build] 构建失败:', err);
  process.exit(1);
});
