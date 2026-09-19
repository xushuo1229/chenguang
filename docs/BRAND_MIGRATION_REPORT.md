# 知行品牌迁移报告

## 1.迁移摘要

- 迁移方向：晨光自律台 → 知行。
- 英文定位：智行。
- 产品定位：AI 个人成长操作系统
- 核心品牌语义：认识自己，规划当下，持续成长。
- AI 身份：知行 AI 教练。
- 结论：当前产品品牌迁移 * *完成* * ；历史报告与平静黎明 视觉概念按约定保留。

本次修改聚焦品牌、定位、PWA 元数据、AI 人设、当前文档、测试断言和源码品牌注释。未修改业务架构、数据结构、API、数据库、同步协议、Analytics 计算、Goal Engine、认证逻辑或 AI 安全边界。

# 已更改的文件

共迁移 105 个已跟踪文件，主要包括：

- -登录/登录/工作台/目标/统计/AI 页面。
- `manifest.json`、 `service-worker.js`、 `package.json`、 `backend/package.json`。
- `pages/`、 `js/`、 `backend/src/` 中的品牌注释、用户可见品牌与 AI 教练文案。
- `backend/src/services/promptBuilder.js` 的 AI 身份与产品定位。
- README、后端README、 Beta 文档、当前状态文档、UI 设计文档和 `.claude/agents` 项目说明。
- `tests/ux-product.test.js`、 `backend/test/ai.test.js` 等品牌相关断言。

完整清单以本次 commit 的 `git diff --name-only` 为准。

## 3.品牌映射

| 旧名称 / 定位 | 新名称 / 定位 |
| --- | --- |
| 晨光自律台 | 知行 |
| 晨光 AI 教练 | 知行 AI 教练 |
| 晨光教练 | 知行教练 |
| 晨光智能助手 | 知行 AI 教练 |
| 大学生 AI 自律工作台 | AI 个人成长操作系统 |
| 一站式自律工作台 | 一站式 AI 个人成长操作系统 |
| 记录今天，成为更好的自己。 | 认识自己，规划当下，持续成长。 |

UI 中泛指“AI 教练”的动作与导航仍保留自然表达；顶部与 AI 人设统一为“知行 AI 教练”。

## 4.用户界面更改

- -着陆标题改为`知行 · AI 个人成长操作系统` ，英雄、导航、页脚、登录/注册弹窗统一为知行。
- -登录、Workbench、目标、统计、AI 页面标题和品牌块统一为知行。
- Workbench 引导改为 `4 步上手知行` ，成长提示改为 `知行发现` ， AI 侧栏语义改为 `知行教练`。
- Landing 与 AI 空态中的“自律”定位文案调整为“成长”语境。
- 未调整布局、颜色体系、圆角卡片、动效、组件结构或任何交互逻辑。

## 5. AI教练命名

- `backend/src/services/promptBuilder.js` 中的人设从“晨光 AI 教练”改为“知行 AI 教练”。
- 产品称呼从“自律学习应用”改为“AI 个人成长操作系统”。
- Context 边界描述从“用户自律数据”调整为“用户成长数据”。
- Retrieval、Tool Runner、只读铁律、注入防护和 Action Layer 安全边界均未修改。

## 6. PWA/元数据更改

- `manifest.json` ：
  - - `name` ： `知行 · AI 个人成长操作系统`
  - - `short_name` ： `知行`
  - `description`: 学习、课程、英语、阅读、运动、专注、待办与目标的一站式 AI 个人成长操作系统。
- 页面 `<title>` 统一迁移到知行。
- Service Worker 品牌注释迁移；缓存标识与构建注入变量保持兼容。
- 图标资源与视觉资产未重新设计。

## 7.文档更改

当前产品文档已迁移到知行与 AI 个人成长操作系统定位，包括 README、后端README、 Beta 文档、当前产品状态、技术债、路线图和 UI 设计文档标题。

历史报告保留原有产品名称，不篡改当时事实。

## 8.保留技术标识符

以下技术标识未修改：

- `chenguangData`、`chenguangSyncPending`、`chenguang:update`。
- `CGStore`、`CGAnalytics`、`CGAPI`、`CGSync`、`CGAIActions`。
- `/api/data`、`/api/auth`、`/api/ai/chat`。
- `users`、`user_data`、`revision`、`device_id`、`updated_at`、`payload`。
- `chenguang-platform-frontend`、`chenguang-backend`、`chenguang.db`、`DB_PATH`。
- -教练记忆结构、工具运行器 白名单、同步协议与安全边界。

## 9.测试

命令编号： `npm test`

结果：23 个测试文件，317 个测试全部通过。

品牌相关测试同步更新：

- -工作台 品牌断言更新为知行。
- -后端AI系统提示断言更新为知行AI 教练。
- CJK token 估算用例在缩短品牌词后调整为同等字符量，测试语义不变。

## 10.构建

命令编号： `npm run build`

结果：通过。

VITE 多页生产构建成功， AI/Workbench/统计/目标/登录/着陆 页面产物正常生成。

# 安全检查

- 未提交 `.env`、 API密钥、令牌 或本地私密配置。
- 未修改 JWT、鉴权、CORS、CSRF、限流、SSRF、提示注入防护或用户隔离逻辑。
- 未修改 localStorage 密钥、数据库结构、同步协议或业务写入路径。
- `git diff --check` 通过。
- 品牌补丁只影响文案、注释、元数据、当前文档和品牌测试断言。

## 12.剩余的老品牌参考文献

保留的原因如下：

1. **历史报告**：`FINAL_*`、`USER_SIMULATION_REPORT.md`、`PRODUCT_UX_AUDIT.md` 中保留“晨光自律台”，用于记录当时事实。
2. **视觉设计概念**：`静晨光 Calm Dawn`、`晨光 · 静`、`晨光琥珀`、`晨光四色`、登录日出插画注释保留，这是既有视觉体系的名称与意象；任务明确要求不做视觉重设计。
3. **技术标识**：`chenguangData`、`chenguang.db`、`CG*`、路径、包名、构建变量和示例环境标识保持不变。

以上均非当前用户可见产品品牌。

# 最终裁决

* *通过—完成。* *

当前用户可见品牌、PWA 元数据、AI 人设、当前文档和品牌测试均已迁移为知行；历史与视觉语境保持真实稳定；业务功能、数据架构、API 和安全边界未改变。
