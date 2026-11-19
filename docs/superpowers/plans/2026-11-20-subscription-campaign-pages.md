# 群发 B2b：授权管理与活动草稿页面

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 每项先测失败再实现。

**Goal:** 管理员在后台授撤主题权限；获授权主管从后台创建、继续编辑本人活动，选择已发布政策，保存后查看双语固定预览和人数。

**Architecture:** 沿用 B1/B2a 服务，不开放私有集合 CRUD。新增中文 `/subscription-campaigns` 页面、同源 JSON 写接口和私有工作区读取。服务端加载当前权限；客户端仅处理表单及友好错误，失败保留勾选。复用现有后台样式和登录。

**Tech Stack:** Next.js 本地安装文档、React、Payload、PostgreSQL 15、Node 24.22.1；无新依赖。

**Spec:** 已批准的 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第 6–8 节及用户本轮明确要求；沿用已批准 UI 方向，不新增业务规则。

## Global Constraints

- 新分支从 PR84 合并后的 `d77ae451b9106a875d3c18d9539ceca21bb0995c` 开始。
- 只有当前有效管理员管理授权；管理员自己操作活动也须显式授权。主管只看本人活动和汇总人数，不能取得邮箱名单。
- 只选当前已发布政策、最多 10 项；保存追加版本，沿用事实配对、改版失效与冲突保护。页面明确仅本地草稿，不提供发送操作。
- 同源检查、受限 JSON、拒绝多余字段，动态私有页面和响应禁止缓存及搜索收录。
- 原演示库/图片保留；浏览器使用 3186 临时库预览，虚构共用事实政策、临时账号，无真实邮件。无迁移、环境变量或主演示种子变更。
- 业务源码控制 400 行以内；测试、文档和本机忽略证据另计。沿用当前任务分支，不另建工作树。

## Review Focus

当前数据库身份被撤权/停用、URL 枚举其他主管活动、直接绕过 UI 发请求、修改参数伪造授权、页面/HTML 泄露邮箱；对应真实集成测试。中文提示、键盘选择、手机横向溢出通过浏览器检查。

### Task 1: 工作区读取与同源写接口

**Files:** 新 `src/server/subscription-campaign-workspace.ts`、`src/app/(frontend)/api/subscriptions/campaigns/route.ts`；`src/server/subscription-campaign-drafts.ts` 只增加公开选择标识到白名单报告。

**Interfaces:** `campaignStaffAuth(headers)` 返回员工身份；`readCampaignWorkspace(payload,actor)` 返回 `canDraft/grants/choices/campaigns`。授权清单仅管理员可见，只含员工 ID、姓名和状态；政策选项为公开事实对应的中英文引用；活动列表仅本人最新 50 条。POST 包含 `action: grant|save` 和 `input`，复用既有设置授权/保存服务。

- [x] 测试先行：匿名/运营/未授权主管拒绝，管理员可管理但不隐式获活动权，主管不能授撤或读取名单；坏来源/类型/超限/额外字段拒绝；授权→保存→打开→续存版本→跨主管拒绝→撤权拒绝，邮件任务不增加。
- [x] 运行 `npm run test:subscriptions`；Expected: 缺少新模块而失败。
- [x] 实现上述读取和接口；重跑；Expected: 既有 14 组及新流程通过。

### Task 2: 后台页面、入口与本地操作预览

**Files:** 新页面及 `src/components/subscriptions/CampaignWorkspace.tsx`；`src/cms/Dashboard.tsx`；临时 `tests/integration/subscription-preview.ts` 的模拟夹具（管理员、两主管、运营及共用事实政策）。

- [x] 渲染测试先写：权限面板仅管理员，主管无员工/邮箱资料；已选政策保留、双语预览、人数、过期警告、空列表、没有发送按钮。
- [x] 运行集成见新组件缺失失败后实现；错误保留填写，成功显示保存版本。后台添加入口。
- [x] 3186 浏览器：管理员授予→主管新建选政策→保存双语预览→重新打开续存→管理员撤销→主管拒绝；运营拒绝。桌面和手机检查，截图本机归档，不提交 Git。

### Task 3: 验证与交付

- [x] `npm run check`、订阅集成通过，lint 警告不增加；独立只读复核重要问题修复。
- [x] 一页亲测指南、实际进度及交接；明确原 3100 副本未升级，3186 关闭自动清理临时数据。
- [ ] 推送独立 PR、核对远端提交及 CI，交用户合并；后续才做模拟测试与确认条件。
