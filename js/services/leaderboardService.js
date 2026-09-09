/**
 * ============================================================
 * 晨光自律台 · 排行榜服务
 * ------------------------------------------------------------
 * 功能:
 *   - 初始数据: GET /api/leaderboard 获取今日 + 连续排行
 *   - 实时更新: 订阅 Realtime leaderboard 频道
 *   - 渲染今日打卡榜 + 连续天数榜 (Top 10)
 *
 * 依赖: realtimeClient, httpClient
 * ============================================================
 */
import realtime from '../api/realtimeClient.js';
import http from '../api/httpClient.js';
import { esc } from '../app/authGuard.js';

class LeaderboardService {
  constructor() {
    this.data = { today: [], streak: [] };
    this.todayListEl = null;
    this.streakListEl = null;
    this._initDone = false;
  }

  /**
   * 初始化排行榜
   * @param {HTMLElement} todayList - 今日榜容器
   * @param {HTMLElement} streakList - 连续榜容器
   */
  init(todayList, streakList) {
    this.todayListEl = todayList;
    this.streakListEl = streakList;

    if (!this._initDone) {
      this._initDone = true;
      realtime.onLeaderboard((data) => {
        this.data = data;
        this._render();
      });
    }
  }

  /**
   * 加载初始排行榜数据
   */
  async loadInitial() {
    if (!this.todayListEl || !this.streakListEl) return;

    try {
      const res = await http.get('/leaderboard');
      this.data = res.data || res;
      this._render();
    } catch (err) {
      console.error('[leaderboard] 加载初始数据失败:', err);
      this._renderError();
    }
  }

  /**
   * 渲染排行榜
   */
  _render() {
    this._renderToday();
    this._renderStreak();
  }

  /** 今日打卡榜 */
  _renderToday() {
    if (!this.todayListEl) return;
    const list = this.data.today || [];

    if (list.length === 0) {
      this.todayListEl.innerHTML = '<div class="lb-empty">暂无数据</div>';
      return;
    }

    this.todayListEl.innerHTML = list.map((item, idx) => {
      const rank = idx + 1;
      const rankClass = rank <= 3 ? `lb-rank-${rank}` : '';
      return `
        <div class="lb-item ${rankClass}">
          <span class="lb-rank">${rank}</span>
          ${this._renderAvatar(item)}
          <span class="lb-name">${esc(item.username)}</span>
          <span class="lb-value">${item.done_count} 次</span>
        </div>`;
    }).join('');
  }

  /** 连续天数榜 */
  _renderStreak() {
    if (!this.streakListEl) return;
    const list = this.data.streak || [];

    if (list.length === 0) {
      this.streakListEl.innerHTML = '<div class="lb-empty">暂无数据</div>';
      return;
    }

    this.streakListEl.innerHTML = list.map((item, idx) => {
      const rank = idx + 1;
      const rankClass = rank <= 3 ? `lb-rank-${rank}` : '';
      return `
        <div class="lb-item ${rankClass}">
          <span class="lb-rank">${rank}</span>
          ${this._renderAvatar(item)}
          <span class="lb-name">${esc(item.username)}</span>
          <span class="lb-value">🔥 ${item.max_streak} 天</span>
        </div>`;
    }).join('');
  }

  /** 渲染头像 */
  _renderAvatar(item) {
    if (item.avatar) {
      return `<img src="${esc(item.avatar)}" class="lb-avatar">`;
    }
    return `<div class="lb-avatar-placeholder">${esc((item.username || '?').charAt(0))}</div>`;
  }

  /** 渲染错误状态 */
  _renderError() {
    const html = '<div class="lb-empty">加载失败, 等待实时更新...</div>';
    if (this.todayListEl) this.todayListEl.innerHTML = html;
    if (this.streakListEl) this.streakListEl.innerHTML = html;
  }
}

export default new LeaderboardService();
