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

// 导出 Vite 配置对象
export default defineConfig({
  // root: 项目根目录，'.' 表示当前目录（F:\chenguang-platform）
  root: '.',

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
        dashboard: resolve(__dirname, 'dashboard.html'), // 管理控制台
        workbench: resolve(__dirname, 'workbench.html'), // 工作台
        stats: resolve(__dirname, 'stats.html'),         // 统计数据页
        ai: resolve(__dirname, 'ai.html'),               // AI 助手
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
});
