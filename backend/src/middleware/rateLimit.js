/**
 * 知行 · 限流中间件 (express-rate-limit)
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是限流（Rate Limiting）？
 *    限流就是"限制同一个用户在一段时间内能发多少次请求"。
 *    比如：每分钟最多 100 次请求。
 *    如果超过这个限制，服务器会返回 429 错误（Too Many Requests）。
 *
 * 二、为什么需要限流？
 *    1. 防止恶意攻击：有人写脚本疯狂发请求，想把你的服务器搞挂
 *    2. 防止暴力破解：有人尝试用不同密码登录你的账号
 *    3. 保护服务器资源：避免一个用户占用太多资源，影响其他用户
 *    4. 节省成本：云服务器按请求量收费，限流能控制成本
 *
 * 三、三级限流体系
 *    我们设计了三个层次的限流，各有不同用途：
 *
 *    1. apiLimiter（全局限流）
 *       - 作用于所有 /api 开头的请求
 *       - 每分钟最多 100 次（可配置）
 *       - 防止普通用户滥用
 *
 *    2. authLimiter（登录/注册限流）
 *       - 专门保护登录和注册接口
 *       - 每 15 分钟最多 5 次失败尝试
 *       - 只计算失败的请求（skipSuccessfulRequests: true）
 *       - 防止暴力破解密码
 *
 *    3. writeLimiter（写操作限流）
 *       - 保护 POST/PUT/DELETE 等修改数据的操作
 *       - 每分钟最多 30 次
 *       - GET 请求不计数（skip: req.method === 'GET'）
 *       - 防止有人疯狂创建/删除数据
 *
 * 四、限流依据
 *    基于 req.ip（客户端 IP 地址）计数。
 *    如果服务器前面有反向代理（如 Nginx），
 *    需要设置 app.set('trust proxy', 1) 才能获取真实 IP。
 *
 * 五、存储方式
 *    当前使用内存存储（适合 SQLite 单进程）。
 *    如果是多实例部署（如多台服务器），
 *    需要换成 Redis 存储，否则每台服务器的计数是独立的。
 * ============================================================
 */
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

// 全局 API 限流：每分钟 N 次（默认 100）
// 作用于所有 /api 路由，是最基础的防护
const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,   // 时间窗口（毫秒），默认 60000（1 分钟）
  max: config.rateLimitMax,             // 窗口内最大请求数，默认 100
  standardHeaders: true,                // 返回标准的 RateLimit-* 响应头
  legacyHeaders: false,                 // 不返回旧版 X-RateLimit-* 头
  message: {
    error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' },
  },
});

// 登录/注册限流：每 15 分钟 5 次（仅失败计数，防暴力破解）
// 专门保护认证相关接口，因为这里是攻击者的重点目标
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,            // 15 分钟时间窗口
  max: 5,                              // 最多 5 次失败尝试
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,         // 成功的登录不计数，只记录失败
  message: {
    error: { code: 'TOO_MANY_AUTH_ATTEMPTS', message: '登录/注册失败次数过多，请 15 分钟后再试' },
  },
});

// 写操作限流：每分钟 30 次（防滥用创建/删除）
// 保护数据修改接口，防止恶意批量操作
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,                 // 1 分钟时间窗口
  max: 30,                             // 最多 30 次写操作
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET', // GET 请求不计数（只限制修改操作）
  message: {
    error: { code: 'WRITE_RATE_LIMITED', message: '操作过于频繁，请稍后再试' },
  },
});

// AI 助手限流：每分钟 15 次
// 保护 AI 对话接口，防止被刷爆（每次调用都会消耗大模型额度/token）
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,                 // 1 分钟时间窗口
  max: 15,                             // 最多 15 次对话
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'AI_RATE_LIMITED', message: 'AI 请求过于频繁，请稍后再试' },
  },
});

// 课表导入限流：每分钟 10 次
// 保护外部课表抓取接口，防止把本服务当作无限制的代理去刷外网（SSRF 风险兜底）
const importLimiter = rateLimit({
  windowMs: 60 * 1000,                 // 1 分钟时间窗口
  max: 10,                             // 最多 10 次抓取
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'IMPORT_RATE_LIMITED', message: '课表导入过于频繁，请稍后再试' },
  },
});

module.exports = { apiLimiter, authLimiter, writeLimiter, aiLimiter, importLimiter };
