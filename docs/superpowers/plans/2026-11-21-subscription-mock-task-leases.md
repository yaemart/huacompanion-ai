# 本地模拟任务抢占与租约实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 自行实施，TDD后一次新上下文只读复核。

**Goal:** 两个真实本地进程竞争同一模拟任务时，仅一个取得有效租约；中断过期可恢复，旧持有者不能提交，模拟完成只记录一次。

**Architecture:** 私有租约表按已占位份额唯一，不改原冻结任务或只追加额度账本。沿用当前草稿/授权/来源/同意及事务锁；数据库时钟、随机凭证和60秒期限控制抢占，完成在同一事务核验凭证和期限，审计一起提交。完成仅是数据库模拟标记，不执行外部副作用。

**Tech Stack:** Node24.22.1、Payload、PostgreSQL15、Node子进程IPC；无新依赖。

**Spec:** 用户本轮明确请求；已批准 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第6节。基于PR91合并 `d2bbd1dfbc8c3b6c15c2652f0fd9357cd435e30b`。

## Global Constraints

- 只允许APP_ENV=local及@example.invalid虚构任务；无公开API/页面、传输、worker接入或真实邮件。
- 只处理原已占位任务，租约恢复不新占份额、不换任务或正文、不退款；不授予真实发送许可。
- 本批实现选择：租约60秒，沿用现有单封任务时长，不提供客户端改期限；期满由新抢占更换随机凭证，不延长旧凭证。代价是慢的模拟处理须重新取得租约；真实外发仍需独立解决幂等及未知结果。
- “不重复”仅指有效租约唯一、最终模拟完成标记及其审计唯一；不能用数据库租约承诺外部副作用绝对只发生一次。
- 每次抢占及完成均复核当前本人草稿、授权/来源/同意和虚构邮箱。旧凭证、过期和完成后再次抢占均不能处理；同凭证重试完成幂等。
- 随机凭证只返取得者，不写审计或用户可见日志；私有集合通用CRUD/REST关闭。
- 新迁移仅随机库应用，非空回退拒绝；旧迁移测试先卸新表。原3100/55442、图片、种子、配置保留，无新依赖或环境变量。
- 完整check和数据库测试串行，lint不超过445；业务改动小于400行。

## Review Focus

1. 多进程竞态：同一份额不能产生两个有效租约，忙碌响应不泄露凭证。
2. 旧进程在过期或新抢占后返回：旧凭证拒绝，不覆盖新结果。
3. 提交结果未知：审计失败时租约/完成标记整体回滚，重试不产生重复完成。
4. 租约持有期间退订、撤权、改语言/同意或来源配置失效：不得提交完成，也不得据恢复绕过当前资格。
5. 已完成或过期数据：不能新建占位或返还额度，原邮件队列不增加，历史回退不丢记录。

### Task 1：私有租约服务及隔离测试

**Files:** 新 `src/server/subscription-campaign-leases.ts`、`src/migrations/20261121_130000_subscription_campaign_mock_leases.ts`、`tests/integration/subscription-campaign-leases.ts`、`tests/helpers/subscription-mock-worker.ts`；集合/生成类型/迁移注册及旧迁移测试依赖调整。

**Interfaces:** `claimMockCampaignTask(p,actor,{campaignKey,revision,slotId})` 返回本地已抢占凭证/到期或busy/completed-local/ineligible；`completeMockCampaignTask(p,actor,{campaignKey,revision,slotId,token})` 同凭证幂等完成，过期或不同凭证409；两者均不返回邮箱/名单。

- [x] 先写测试及入口，观察缺模块RED。
- [x] 新表slot唯一、token、expiresAt、可空completedAt；完成后不再抢占。60秒时间均由数据库计算，任务状态仍held/cancelled。
- [x] 两个真实子进程同步竞争，杀掉获租者、验证未过期不能抢占；测试库将到期时间推进后恢复，旧凭证拒绝；子进程和父进程并发完成只一条完成审计。
- [x] 补角色/跨主管/当前撤权与非本地拒绝、严格输入、退订失效、只读私有字段、迁移非空保护、延迟COMMIT失败回滚、旧份额/单封队列不变。
- [x] 21组订阅集成与完整check通过；顺带修复PR91千人测试准备跨午夜时的时间基准待办，独立跨日测试保留。

### Task 2：复核、中文亲测指南与交付

- [x] 一次只读复核，重要问题RED→GREEN；轻微项记录后续。
- [x] 更新progress/handoff及一页中文亲测，说明如何一条命令看双进程结果，不直接操作原库；原始日志仅本机忽略目录。
- [ ] 单独PR，核对精确提交/远端一致/云端CI，不自动合并。
