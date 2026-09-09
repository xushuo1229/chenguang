/**
 * ============================================================
 * 晨光自律台 · API 客户端统一入口
 * ------------------------------------------------------------
 * 一行导入全部服务:
 *   import { http, authService, taskService, checkinService, studyService, ApiError } from './js/api/index.js';
 *
 * HTML 使用方式:
 *   <script type="module" src="./js/api/index.js"></script>
 *   或在 module 脚本中 import
 * ============================================================
 */
export { http, ApiError } from './httpClient.js';
export { authService } from './authService.js';
export { taskService } from './taskService.js';
export { checkinService } from './checkinService.js';
export { studyService } from './studyService.js';
