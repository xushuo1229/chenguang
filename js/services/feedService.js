/**
 * ============================================================
 * 晨光自律台 · 打卡动态流服务
 * ------------------------------------------------------------
 * 功能:
 *   - 订阅 Realtime feed 频道, 实时接收打卡动态
 *   - 渲染动态流列表 (类似朋友圈)
 *   - 初始数据通过 API 获取 (近期打卡)
 *   - 新动态插入列表顶部, 限制最大数量
 *
 * 依赖: realtimeClient, httpClient (初始数据)
 * ============================================================
 */
import realtime from '../api/realtimeClient.js';
import http from '../api/httpClient.js';
import { esc } from '../app/authGuard.js';

const MAX_FEED_ITEMS = 50;

class FeedService {
  constructor() {
    this.items = [];
    this.container = null;
    this.emptyEl = null;
    this._initDone = false;
  }

  /**
   * 初始化动态流
   * @param {HTMLElement} container - 动态列表容器
   * @param {HTMLElement} emptyEl - 空状态元素
   */
  init(container, emptyEl = null) {
    this.container = container;
    this.emptyEl = emptyEl;

    if (!this._initDone) {
      this._initDone = true;
      // 注册 Realtime 回调
      realtime.onFeed((event) => this._onNewCheckin(event));
    }
  }

  /**
   * 加载初始动态流数据 (近期打卡)
   */
  async loadInitial() {
    if (!this.container) return;

    try {
      // 获取全站近期打卡 (需后端公开接口, 当前用 leaderboard 数据模拟)
      // 实际场景: 可添加 GET /api/feed 公开接口
      // 暂时从 leaderboard 数据初始化, 实时部分由 Realtime 推送
      this._render();
    } catch (err) {
      console.error('[feed] 加载初始数据失败:', err);
    }
  }

  /**
   * Realtime 收到新打卡动态
   */
  _onNewCheckin(event) {
    // 插入列表顶部
    this.items.unshift(event);

    // 限制最大数量
    if (this.items.length > MAX_FEED_ITEMS) {
      this.items = this.items.slice(0, MAX_FEED_ITEMS);
    }

    this._render(true); // animate=true
  }

  /**
   * 渲染动态流
   * @param {boolean} animate - 是否为新条目播放动画
   */
  _render(animate = false) {
    if (!this.container) return;

    if (this.items.length === 0) {
      this.container.innerHTML = '';
      if (this.emptyEl) this.emptyEl.style.display = 'block';
      return;
    }

    if (this.emptyEl) this.emptyEl.style.display = 'none';

    this.container.innerHTML = this.items.map((item, idx) => {
      const isNew = animate && idx === 0;
      return this._renderItem(item, isNew);
    }).join('');
  }

  /**
   * 渲染单条动态
   */
  _renderItem(item, isNew = false) {
    const avatar = item.avatar
      ? `<img src="${esc(item.avatar)}" class="feed-avatar">`
      : `<div class="feed-avatar-placeholder">${esc((item.username || '?').charAt(0))}</div>`;

    const streakBadge = item.streak > 0
      ? `<span class="feed-streak">🔥 ${esc(item.streak)}天</span>`
      : '';

    return `
      <div class="feed-item ${isNew ? 'feed-item-new' : ''}">
        ${avatar}
        <div class="feed-body">
          <div class="feed-text">
            <span class="feed-user">${esc(item.username)}</span>
            刚刚完成了
            <span class="feed-task">${esc(item.task_name)}</span>
            打卡！
          </div>
          <div class="feed-meta">
            <span class="feed-time">${this._formatTime(item.created_at)}</span>
            ${streakBadge}
          </div>
        </div>
      </div>`;
  }

  /**
   * 格式化时间为 "刚刚 / x分钟前 / x小时前"
   */
  _formatTime(isoStr) {
    if (!isoStr) return '刚刚';
    const now = Date.now();
    const then = new Date(isoStr).getTime();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  }
}

export default new FeedService();
