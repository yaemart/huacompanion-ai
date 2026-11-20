# 群发 B5b：本地模拟余额与份额占位

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. TDD后实现，最终一次只读复核。

**Goal:** 默认未知余额暂停，用数据库账本验证模拟预算、北京时间每日2,000份和同邮箱滚动24小时1份，跨并发不超占。

**Architecture:** 两个私有只追加集合保存模拟余额和唯一任务占位；管理员设置模拟剩余份额，默认无余额记录。主管在现有当前本人草稿/授权/来源/模拟确认事务内，为尚未占位的原冻结有效任务取得模拟份额，返回不含名单的收据。保留held/cancelled状态，不接传输。

**Tech Stack:** Node24.22.1、Payload、PostgreSQL15；无新依赖。

**Spec:** 已批准 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第6–8节；PR89合并 `452ae9643c87fde918a60703ca2492dc5e5d5c90`。

## Global Constraints

- 仅APP_ENV=local，只占位@example.invalid虚构收件人。余额是本机模拟值，不是真实账户验证或付费授权。
- 模拟余额仅当前有效管理员设置，原因必填；剩余份数0–2,000，服务端固定1小时过期。未知、失效或不足时不占位。
- 余额只追加版本，以设置时累计占位数为基线；后续占位递减可用额。余额更新不能绕过固定每天2,000或同邮箱滚动24小时1份。
- 每任务只能一个占位，请求UUID幂等；同一请求不得换活动。已取消、失效同意/地址/语言/来源/授权或旧版本不能新增占位；不加入新订阅者。
- 所有占位共用现有数据库事务锁，计数/创建/审计原子提交；未知提交结果也不能换键重复占位。现有占位不会因取消或余额过期自动归还。
- 返回仅状态和占位编号，不返回邮箱、摘要、任务ID或名单。模型通用CRUD/REST全部关闭。
- 本批不消费传输尝试、不占任务租约、不调用供应商或worker；共用5次尝试、15分钟冷却、每秒1次全站传输、优先级及真实余额核对留传输批次。原单封限额不改，不宣称这些已统一。
- 新迁移只在随机库验证，原3100/55442及图片保留。无新环境变量、原种子或依赖。业务代码低于400行。

## Review Focus

更新余额绕过日上限；同一任务换请求键重复占位；跨午夜错误重置邮箱频控；审计提交失败残留份额；当前资格改变后仍新占位。Task1逐项覆盖。

### Task 1: 私有账本与占位服务

**Files:** 订阅集合/类型、新 `20261121_090000_subscription_campaign_mock_quota.ts` 及注册；新 `src/server/subscription-campaign-quota.ts`；recheck服务抽出共享资格比较；新quota集成及入口/旧迁移依赖测试。

**Interfaces:** `setMockCampaignBudget(p,actor,{remaining,reason})` 管理员设置带过期模拟余额；`reserveMockCampaignSlot(p,actor,{campaignKey,revision,key})` 返回状态或唯一收据，内部挑原冻结有效任务。共享`campaignTaskReason(job,live,preview)`沿用PR89判断。

- [x] 先写测试并跑订阅集成，观察缺模块RED。
- [x] 模拟余额字段remaining/baseUsage/expiresAt/actor/reason；占位key/job唯一、batch/budget/recipientHash/reservedAt。迁移无损，非空拒绝回退；旧测试先撤新依赖表再撤旧表。
- [x] 设置余额默认关闭、管理员当前身份和严格输入；占位逐次验证权限/来源/同意，只接受虚构域名。数据库时钟用于余额有效期、自然日及滚动24小时计算。
- [x] 测试未知/0/过期余额、当前角色和跨主管、8路并发、同键/换键幂等、已取消或改变资料排除、非虚构邮箱排除、2,000/2,001和北京午夜/滚动24小时边界、重设余额不绕过、延迟审计COMMIT失败无残留及原邮件队列不增加。
- [x] 20组订阅集成与完整check353通过，lint不超过445，数据库和check串行。

### Task 2: 复核与交接

- [x] 一次新上下文只读复核，重要问题RED→GREEN修复；轻微项列入记录，不追加复核。
- [x] 一页中文指南说明本批无新页面/真实发件、临时库测试命令、真实发送未完成门槛。更新progress/handoff。
- [ ] 单独草稿PR，核对精确提交、远端一致及CI，用户决定合并。
