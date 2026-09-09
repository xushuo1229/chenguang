/**
 * ============================================================
 * 晨光自律台 · Realtime 连接管理器
 * ------------------------------------------------------------
 * 基于 Supabase Realtime (WebSocket), 提供:
 *   - 自动连接 / 断线重连 (指数退避)
 *   - 频道订阅管理 (feed / leaderboard)
 *   - 连接状态事件回调 (onConnect / onDisconnect / onReconnect)
 *   - 心跳检测 (超时自动重连)
 *
 * 依赖: @supabase/supabase-js v2 (通过 CDN ESM 加载)
 * ============================================================
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FEED_CHANNEL, LEADERBOARD_CHANNEL } from '../config.js';

class RealtimeManager {
  constructor() {
    this.client = null;
    this.channels = {};
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;

    // 事件回调
    this._callbacks = {
      connect: [],
      disconnect: [],
      reconnect: [],
      error: [],
    };

    // feed / leaderboard 消息回调
    this._handlers = {
      feed: [],
      leaderboard: [],
    };
  }

  /**
   * 初始化 Supabase 客户端并连接
   */
  init() {
    if (this.client) return;

    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });

    // 监听连接状态
    this.client.realtime.onOpen(() => this._onOpen());
    this.client.realtime.onClose(() => this._onClose());
    this.client.realtime.onError((err) => this._onError(err));

    this._subscribeFeed();
    this._subscribeLeaderboard();
  }

  // ============================================================
  // 频道订阅
  // ============================================================

  /** 订阅打卡动态流 */
  _subscribeFeed() {
    const channel = this.client.channel(FEED_CHANNEL);
    channel.on('broadcast', { event: 'checkin' }, (msg) => {
      const data = msg.payload || msg;
      this._handlers.feed.forEach((cb) => cb(data));
    });
    channel.subscribe();
    this.channels.feed = channel;
  }

  /** 订阅排行榜更新 */
  _subscribeLeaderboard() {
    const channel = this.client.channel(LEADERBOARD_CHANNEL);
    channel.on('broadcast', { event: 'update' }, (msg) => {
      const data = msg.payload || msg;
      this._handlers.leaderboard.forEach((cb) => cb(data));
    });
    channel.subscribe();
    this.channels.leaderboard = channel;
  }

  // ============================================================
  // 事件注册
  // ============================================================

  /**
   * 注册 feed 动态回调
   * @param {Function} cb - (feedEvent) => void
   */
  onFeed(cb) {
    this._handlers.feed.push(cb);
  }

  /**
   * 注册排行榜更新回调
   * @param {Function} cb - (leaderboardData) => void
   */
  onLeaderboard(cb) {
    this._handlers.leaderboard.push(cb);
  }

  /**
   * 注册连接状态回调
   * @param {'connect'|'disconnect'|'reconnect'|'error'} event
   * @param {Function} cb
   */
  on(event, cb) {
    if (this._callbacks[event]) {
      this._callbacks[event].push(cb);
    }
  }

  // ============================================================
  // 连接状态处理
  // ============================================================

  _onOpen() {
    const wasReconnecting = this.reconnectAttempts > 0;

    this.connected = true;
    this.reconnectAttempts = 0;
    this._startHeartbeat();

    console.log('[realtime] 连接已建立');
    this._callbacks.connect.forEach((cb) => cb());

    if (wasReconnecting) {
      this._callbacks.reconnect.forEach((cb) => cb());
    }
  }

  _onClose() {
    if (!this.connected) return; // 已手动断开

    this.connected = false;
    this._stopHeartbeat();

    console.warn('[realtime] 连接已断开');
    this._callbacks.disconnect.forEach((cb) => cb());

    this._scheduleReconnect();
  }

  _onError(err) {
    console.error('[realtime] 连接错误:', err);
    this._callbacks.error.forEach((cb) => cb(err));
  }

  // ============================================================
  // 断线重连 (指数退避: 1s → 2s → 4s → 8s → ... → 最大 30s)
  // ============================================================

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[realtime] 达到最大重连次数, 停止重连');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`[realtime] ${delay / 1000}s 后第 ${this.reconnectAttempts} 次重连...`);

    this.reconnectTimer = setTimeout(() => {
      // 重新建立连接
      try {
        // Supabase v2: 手动触发重连
        this.client.realtime.connect();
      } catch (err) {
        console.error('[realtime] 重连失败:', err);
        this._scheduleReconnect();
      }
    }, delay);
  }

  // ============================================================
  // 心跳检测
  // ============================================================

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      // 检查连接状态
      if (this.client?.realtime?.socket?.readyState !== 1) {
        console.warn('[realtime] 心跳检测: 连接已失效, 触发重连');
        this._onClose();
      }
    }, 30000); // 每 30s 检查一次
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ============================================================
  // 主动断开
  // ============================================================

  disconnect() {
    this._stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    Object.values(this.channels).forEach((ch) => {
      try { ch.unsubscribe(); } catch (_) {}
    });

    this.connected = false;
    this.client = null;
    this.channels = {};
    console.log('[realtime] 已主动断开');
  }

  /** 是否已连接 */
  isConnected() {
    return this.connected;
  }
}

// 单例导出
const realtime = new RealtimeManager();
export default realtime;
