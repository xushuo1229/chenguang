/**
 * Realtime 广播服务
 * ------------------------------------------------------------
 * 通过 Supabase Realtime Broadcast 向所有在线前端推送消息
 *
 * 频道:
 *   chenguang-feed       — 打卡动态流 (有人打卡时推送)
 *   chenguang-leaderboard — 排行榜更新 (打卡后推送最新排行)
 *
 * 流程:
 *   1. 用户打卡 → checkinController 调用 broadcastCheckin()
 *   2. realtimeService 查询用户名 + 任务名 + 排行榜
 *   3. 向两个频道发送 broadcast 消息
 *   4. 所有订阅的前端实时收到更新
 *
 * 注意: 广播是 fire-and-forget, 失败不影响打卡主流程
 */
const { getSupabase } = require('../utils/supabase');
const leaderboardModel = require('../models/leaderboardModel');

const FEED_CHANNEL = 'chenguang-feed';
const LEADERBOARD_CHANNEL = 'chenguang-leaderboard';

/**
 * 广播打卡动态
 * @param {Object} checkin - 打卡记录 (含 user_id, task_id, current_streak, checkin_date, created_at)
 */
async function broadcastCheckin(checkin) {
  const supabase = getSupabase();
  if (!supabase) return; // 未配置 Supabase, 静默跳过

  try {
    // 并行查询: 用户公开信息 + 任务名 + 最新排行榜
    const [userInfo, taskName, leaderboard] = await Promise.all([
      leaderboardModel.getUserDisplayInfo(checkin.user_id),
      leaderboardModel.getTaskName(checkin.task_id),
      leaderboardModel.getLeaderboard(),
    ]);

    // 1. 推送 feed 动态
    const feedEvent = {
      type: 'checkin',
      user_id: checkin.user_id,
      username: userInfo?.username || '匿名用户',
      avatar: userInfo?.avatar || null,
      task_name: taskName || '未知任务',
      streak: checkin.current_streak || 0,
      checkin_date: checkin.checkin_date,
      created_at: checkin.created_at || new Date().toISOString(),
    };

    await supabase.channel(FEED_CHANNEL).send({
      type: 'broadcast',
      event: 'checkin',
      payload: feedEvent,
    });

    // 2. 推送排行榜更新
    await supabase.channel(LEADERBOARD_CHANNEL).send({
      type: 'broadcast',
      event: 'update',
      payload: leaderboard,
    });

  } catch (err) {
    // 广播失败不影响打卡主流程, 仅记录日志
    console.error('[realtime] 广播失败:', err.message);
  }
}

module.exports = {
  broadcastCheckin,
  FEED_CHANNEL,
  LEADERBOARD_CHANNEL,
};
