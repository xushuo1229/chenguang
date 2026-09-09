/**
 * Supabase 服务端客户端
 * ------------------------------------------------------------
 * 使用 service_role key, 拥有完整数据库权限 (绕过 RLS)
 * 仅用于后端: Realtime 广播 + 可选的 Supabase 直连操作
 *
 * 安全: service_role key 绝不暴露给前端!
 */
const { createClient } = require('@supabase/supabase-js');
const config = require('../config/env');

let _client = null;

/**
 * 获取 Supabase 服务端客户端 (单例)
 * 如果未配置 SUPABASE_URL / SUPABASE_SERVICE_KEY, 返回 null
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
function getSupabase() {
  if (_client) return _client;

  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    console.warn('[supabase] 未配置 SUPABASE_URL / SUPABASE_SERVICE_KEY, Realtime 广播功能不可用');
    return null;
  }

  _client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}

module.exports = { getSupabase };
