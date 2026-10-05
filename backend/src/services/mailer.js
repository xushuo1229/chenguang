/**
 * Zeno · 邮件发送（SMTP 可选 / 开发控制台兜底）
 * ============================================================
 * - 配置 SMTP_* 且安装了 nodemailer → 真实发送。
 * - 未配置或依赖缺失 → 把邮件内容打印到服务端日志（本地开发可用链接直接访问）。
 * 任何邮件失败都不阻塞注册/登录主流程（由调用方 catch）。
 */
'use strict';

const ent = require('../config/enterprise');

let cachedTransport;
async function getTransport() {
  if (!ent.smtp.host) return null;
  if (cachedTransport !== undefined) return cachedTransport;
  try {
    const nodemailer = require('nodemailer');
    cachedTransport = nodemailer.createTransport({
      host: ent.smtp.host,
      port: ent.smtp.port,
      secure: ent.smtp.secure,
      auth: ent.smtp.user ? { user: ent.smtp.user, pass: ent.smtp.pass } : undefined,
    });
  } catch (_) {
    cachedTransport = null; // 未安装 nodemailer → 回退日志
  }
  return cachedTransport;
}

async function sendMail({ to, subject, text, html }) {
  const transport = await getTransport();
  if (transport) {
    try {
      await transport.sendMail({ from: ent.smtp.from, to, subject, text, html });
      return { transport: 'smtp' };
    } catch (err) {
      console.error('[mailer] SMTP 发送失败，回退日志:', err && err.message);
    }
  }
  console.warn(
    `[mailer:dev] 未配置可用 SMTP，邮件仅输出到日志。\n  → 收件人: ${to}\n  → 主题: ${subject}\n${text}\n`
  );
  return { transport: 'log' };
}

module.exports = { sendMail };
