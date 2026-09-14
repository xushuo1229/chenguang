/**
 * 知行 · 环境变量集中加载与校验
 * ============================================================
 * 【文件职责】
 * 这个文件是整个后端的"配置中心"，负责从 .env 文件和系统环境变量中
 * 读取所有配置项，统一校验后导出一个 config 对象供所有模块使用。
 *
 * 【核心概念】
 *
 * 1. 什么是环境变量？
 *    环境变量是操作系统提供的一种"传递配置信息"的机制。
 *    比如数据库密码、JWT 密钥等敏感信息不应该写在代码里（会被泄露到 Git），
 *    而是通过环境变量在运行时传入。
 *    设置方式：
 *    - 命令行：PORT=3000 node src/server.js
 *    - .env 文件：dotenv 库会自动读取
 *
 * 2. 什么是 .env 文件？
 *    .env 文件是一个纯文本文件，格式为 KEY=VALUE，每行一个配置项。
 *    例如：
 *      PORT=3000
 *      JWT_SECRET=my_secret_key
 *      CORS_ORIGIN=http://localhost:5173
 *    dotenv 库会在应用启动时读取这个文件，把里面的配置项
 *    自动设置为 process.env 对应的环境变量。
 *
 * 3. 为什么需要集中管理配置？
 *    如果每个文件都直接读 process.env，会出现：
 *    - 配置散落在各处，难以维护
 *    - 容易拼写错误（比如 process.env.JWT_SCERET）
 *    - 缺少校验，启动后才发现配置错误
 *    集中管理：所有配置在一个文件中定义、校验、导出，
 *    其他文件只需 require 这个模块即可。
 *
 * 4. 为什么生产环境需要校验必填项？
 *    开发环境可以用默认值（方便调试），
 *    但生产环境如果缺少关键配置（如 JWT 密钥），
 *    会导致严重的安全问题或服务不可用。
 *    所以在启动时就检查，缺失则直接报错退出，避免"带病运行"。
 *
 * 【配置项说明】
 *
 * - env：运行环境（development / production）
 * - isProd：是否为生产环境
 * - port：服务监听的端口号（默认 3000）
 * - dbPath：SQLite 数据库文件路径
 * - jwtSecret：JWT 签名密钥（用于生成和验证登录 token）
 * - jwtExpiresIn：JWT token 的有效期（默认 30 天）
 * - corsOrigin：允许的跨域来源列表（前端域名）
 * - rateLimitMax：限流最大请求数（默认每分钟 100 次）
 * - rateLimitWindowMs：限流时间窗口（默认 60000 毫秒 = 1 分钟）
 * - bcryptRounds：密码加密的轮数（越高越安全但越慢，默认 10）
 * - bodyLimit：请求体大小限制（默认 2MB）
 * - staticDir：静态文件目录（用于托管前端打包产物）
 * - supabase*：Supabase 相关配置（可选，用于 Realtime 广播）
 *
 * 【与其他文件的关系】
 * - .env 文件：本文件读取的配置来源
 * - .env.example：配置模板，告诉开发者需要哪些配置项
 * - server.js：读取 config.port 来启动服务
 * - app.js：读取 config.bodyLimit、config.staticDir 等
 * - db/index.js：读取 config.dbPath 来确定数据库文件位置
 * - 所有需要配置的模块都通过 require('./config/env') 获取配置
 */
require('dotenv').config();

// 判断当前是否为生产环境
// process.env.NODE_ENV 是 Node.js 的标准环境变量
// 只有明确设置为 'production' 才认为是生产环境
const isProd = process.env.NODE_ENV === 'production';

/**
 * 解析 CORS_ORIGIN 环境变量
 *
 * CORS_ORIGIN 的格式是逗号分隔的域名列表，例如：
 *   CORS_ORIGIN=http://localhost:5173,https://example.com
 *
 * 解析过程：
 * 1. 读取环境变量的原始值（字符串）
 * 2. 按逗号分割成数组
 * 3. 去除每个元素的首尾空格
 * 4. 过滤掉空字符串
 *
 * 最终得到：['http://localhost:5173', 'https://example.com']
 */
function parseCorsOrigin() {
  const raw = process.env.CORS_ORIGIN || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const corsOrigin = parseCorsOrigin();

// ===== 生产环境必填校验 =====
// 在生产环境中，以下配置项是必须的，缺少任何一个都会阻止启动
// 这是一种"快速失败"策略：早发现早解决，避免运行时出错
const required = isProd ? ['JWT_SECRET', 'CORS_ORIGIN'] : [];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(
    `[env] 生产环境缺少必填变量: ${missing.join(', ')}。请参考 .env.example 配置 .env`
  );
}

// 生产环境安全警告：如果还在用默认的 JWT 密钥，给出警告
// 不阻断启动（便于初次部署测试），但强烈建议尽快修改
if (isProd && process.env.JWT_SECRET === 'chenguang_dev_secret_change_me') {
  console.warn('[env] 警告: 生产环境使用默认 JWT_SECRET，请立即修改！');
}

// ===== 导出统一的配置对象 =====
// 所有配置项都从这里读取，其他文件不再直接访问 process.env
const config = {
  // --- 运行环境 ---
  env: process.env.NODE_ENV || 'development',  // 当前环境名称
  isProd,                                        // 是否生产环境
  isDev: !isProd,                                // 是否开发环境
  port: parseInt(process.env.PORT, 10) || 3000, // 服务端口（默认 3000）

  // --- 数据库 ---
  // 本地开发使用 SQLite 文件数据库（零安装、开箱即用）。
  // DB_PATH 可通过 backend/.env 配置，默认是 backend/chenguang.db
  dbPath: process.env.DB_PATH
    ? require('path').resolve(process.env.DB_PATH)
    : require('path').join(__dirname, '..', '..', 'chenguang.db'),

  // 保留 PostgreSQL 连接串配置，方便以后需要切换到云端 PostgreSQL 部署
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/chenguang',

  // --- JWT 认证 ---
  jwtSecret: process.env.JWT_SECRET || 'chenguang_dev_secret_change_me', // 签名密钥
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d', // token 有效期（默认 30 天）

  // --- CORS 跨域 ---
  corsOrigin,  // 允许的前端域名列表

  // --- 限流 ---
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,          // 最大请求数
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000, // 时间窗口（毫秒）

  // --- BCrypt 密码加密 ---
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10, // 加密轮数

  // --- 请求体限制 ---
  bodyLimit: process.env.BODY_LIMIT || '2mb', // 最大请求体大小

  // --- 静态文件托管 ---
  staticDir: process.env.STATIC_DIR || '', // 前端打包产物目录（空则不托管）

  // --- AI 助手（Phase 13 AI 2.0 · Coach 架构） ---
  // Key 只存放在服务端，绝不下发到浏览器
  aiProvider: process.env.AI_PROVIDER || 'openaiCompatible', // Provider Adapter 名称
  aiBaseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1', // OpenAI 兼容基址
  aiApiKey: process.env.AI_API_KEY || '', // AI 服务密钥（为空则 AI 不可用，前端走离线兜底）
  aiModel: process.env.AI_MODEL || 'deepseek-chat', // 模型名
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS, 10) || 30000, // 请求超时（毫秒）
  aiMaxMessages: parseInt(process.env.AI_MAX_MESSAGES, 10) || 20, // 对话消息条数上限
  aiMaxMsgLength: parseInt(process.env.AI_MAX_MSG_LENGTH, 10) || 8000, // 单条消息长度上限
  aiMaxContextChars: parseInt(process.env.AI_MAX_CONTEXT_CHARS, 10) || 24000, // Context JSON 字符上限（防超大请求）

  // --- 课表导入（代理抓取外部课表 HTML） ---
  // 通过后端代理抓取学校课表页并解析课程，天然规避浏览器 CORS
  importTimeoutMs: parseInt(process.env.IMPORT_TIMEOUT_MS, 10) || 15000, // 抓取超时（毫秒）
  importMaxUrlLen: parseInt(process.env.IMPORT_MAX_URL_LEN, 10) || 2000, // URL 长度上限
  importMaxCourse: parseInt(process.env.IMPORT_MAX_COURSE, 10) || 50,    // 单次最多导入课程数
  importMaxBodyBytes: parseInt(process.env.IMPORT_MAX_BODY_BYTES, 10) || 2 * 1024 * 1024, // 响应体上限

  // --- Supabase（可选，用于 Realtime 广播） ---
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
};

module.exports = config;
