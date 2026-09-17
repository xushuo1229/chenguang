/**
 * Vite 配置文件 (vite.config.js)
 * ============================================================
 * Vite 是什么？
 *   Vite 是一个现代化的前端构建工具（类似 Webpack，但更快）
 *   它在开发时不需要打包，直接利用浏览器的 ES Module 功能加载文件
 *   构建时会把代码压缩、合并，生成适合部署的文件
 *
 * 这个文件配置了：
 *   - 项目根目录
 *   - 静态资源目录
 *   - 多页面应用（MPA）入口
 *   - 构建输出目录
 *   - 代码压缩选项
 *   - 开发服务器端口
 * ============================================================
 */

// defineConfig 是 Vite 提供的辅助函数，让配置有更好的类型提示和校验
import { defineConfig } from 'vite';

// resolve 用于拼接文件的绝对路径
import { resolve } from 'path';

// Node 文件系统模块用于在构建完成后生成部署资产
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

/**
 * 构建后收集 dist 内真实文件，并生成 PWA 部署资产。
 * 禁止在 Service Worker 源码中手写打包前路径。
 */
function chenguangDeploymentAssets() {
  let projectRoot = process.cwd();
  let outputDirectory = '';

  function listFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory)) {
      const fullPath = resolve(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        files.push(...listFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  return {
    name: 'chenguang-deployment-assets',
    apply: 'build',
    configResolved(config) {
      projectRoot = config.root;
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    generateBundle() {
      const manifest = readFileSync(resolve(projectRoot, 'manifest.json'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: manifest
      });
    },
    closeBundle() {
      const source = readFileSync(resolve(projectRoot, 'service-worker.js'), 'utf8');
      const urls = new Set(['/', '/manifest.json', '/service-worker.js']);
      for (const file of listFiles(outputDirectory)) {
        urls.add(`/${file.slice(outputDirectory.length + 1).split('\\').join('/')}`);
      }
      const urlList = [...urls].sort();
      const buildId = createHash('sha256')
        .update(urlList.join('\n'))
        .digest('hex')
        .slice(0, 12);
      const prelude = [
        `globalThis.__CHENGUANG_PRECACHE_URLS__ = ${JSON.stringify(urlList, null, 2)};`,
        `globalThis.__CHENGUANG_BUILD_ID__ = '${buildId}';`,
        '',
        ''
      ].join('\n');
      writeFileSync(resolve(outputDirectory, 'service-worker.js'), prelude + source);
    }
  };
}

function chenguangManifestLink() {
  return {
    name: 'chenguang-manifest-link',
    transformIndexHtml() {
      return [{
        tag: 'link',
        attrs: { rel: 'manifest', href: '/manifest.json' },
        injectTo: 'head'
      }];
    }
  };
}

function chenguangShellBootstrapAsset() {
  return {
    name: 'chenguang-shell-bootstrap-asset',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'js/shellBootstrap.js',
        source: readFileSync(resolve(__dirname, 'js/shellBootstrap.js'), 'utf8'),
      });
    },
  };
}

// 导出 Vite 配置对象；生产构建不注入 localhost 开发地址
export default defineConfig(({ mode }) => ({
  // root: 项目根目录，'.' 表示当前目录（F:\chenguang-platform）
  root: '.',

  define: {
    __CHENGUANG_DEV_API_BASE__: JSON.stringify(
      mode === 'production' ? '' : 'http://localhost:3000/api'
    )
  },

  // publicDir: 静态资源目录，放在这里的文件会原样复制到构建输出目录
  // 比如 assets/logo.svg 会被复制到 dist/assets/logo.svg
  publicDir: 'assets',

  // build: 构建相关配置
  build: {
    // outDir: 构建输出目录，`npm run build` 后生成的文件放在这里
    outDir: 'dist',

    // emptyOutDir: 构建前是否清空输出目录（true = 先清空再构建，避免残留旧文件）
    emptyOutDir: true,

    // rollupOptions: Rollup 打包器的高级配置
    // Rollup 是 Vite 底层使用的打包工具
    rollupOptions: {
      // input: 多页面应用（MPA）的入口文件
      // 普通的 SPA（单页应用）只有一个入口 index.html
      // 但这个项目有 4 个页面，所以需要 4 个入口
      // 每个入口对应一个 HTML 文件，Vite 会为每个页面单独打包
      input: {
        main: resolve(__dirname, 'index.html'),         // 首页（落地页）
        login: resolve(__dirname, 'login.html'),        // 登录页（独立左右分栏）
        workbench: resolve(__dirname, 'workbench.html'), // 工作台
        today: resolve(__dirname, 'today.html'),         // 今日计划
        stats: resolve(__dirname, 'stats.html'),         // 统计数据页
        ai: resolve(__dirname, 'ai.html'),               // AI 助手
        goals: resolve(__dirname, 'goals.html'),         // 目标系统
      },
    },

    // minify: 代码压缩工具，terser 比默认的 esbuild 压缩率更高但速度稍慢
    minify: 'terser',

    // terserOptions: terser 压缩工具的配置
    terserOptions: {
      // compress: 压缩选项
      compress: {
        // drop_console: false → 保留 console.log 等日志输出（生产环境可以设为 true 移除）
        drop_console: false,
      },
      // format: 格式化选项
      format: {
        // comments: false → 移除代码中的注释（减小文件体积）
        comments: false,
      },
    },
  },

  // server: 开发服务器配置（`npm run dev` 时生效）
  server: {
    // port: 开发服务器端口号，默认 5173
    port: 5173,

    // open: 启动开发服务器后自动打开浏览器，打开的是 /index.html
    open: '/index.html',
  },

  // 构建后注入 manifest 与真实资源清单
  plugins: [chenguangDeploymentAssets(), chenguangManifestLink(), chenguangShellBootstrapAsset()],
}));
