# 本地模拟活动暂停与恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 自行实施，TDD后一次新上下文只读复核。

**Goal:** 获授权主管能停止本人活动；暂停阻止冻结、占位、抢占和完成，恢复不复活旧租约且不绕过当前模拟确认。

**Architecture:** 按稳定活动编号存私有暂停状态，默认未暂停。修改与任务服务共用content→business事务锁；暂停同事务使该活动未完成租约到期，完成记录/历史快照/额度保留。停止不要求有效模拟确认，恢复仍通过withConfirmedCampaign。

**Tech Stack:** Node24.22.1、Payload、PostgreSQL15；无新依赖。

**Spec:** 已批准 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第6节活动暂停规则；PR92合并 `d7a8af9568ac3d7ae4db1a2f0517e19b666889c0`。

## Global Constraints

- 本批只做本地服务层与模拟测试，无后台按钮/API/worker接入、真实发送、购买或部署。永久取消、重试/回执另批。
- 当前本人及独立主题授权不变；默认没有控制记录视为未暂停，保持旧数据行为。私有表通用CRUD/REST拒绝所有角色。
- 暂停/恢复须填写原因（本批审计输入选择）；重复同状态不新增审计或覆盖原原因。变化有操作者、数据库时间和失效租约数，不含名单或凭证。
- 暂停允许模拟确认失效时使用；恢复必须当前有效模拟确认。暂停按活动编号持续，改版不能绕过，旧版本写入仍拒绝。
- 暂停仅让未完成租约到期，不回滚已完成、不删除历史、不归还或重占额度；恢复后须新凭证，旧凭证不能完成。
- 新迁移只在随机库应用，非空回退拒绝。原3100/55442、图片、种子保留，无新环境变量/依赖。完整check和数据库测试串行，lint不超过445，业务改动低于400行。

## Review Focus

1. 模拟确认/来源已失效仍必须能停；停止不能被恢复确认门槛阻塞。
2. 暂停与另一个进程完成争锁：先提交暂停后，后者不能完成；先完成的历史不回滚。
3. 恢复不得复活暂停前未到期凭证，改版/换操作键不能绕过活动暂停。
4. 审计提交失败必须同时回滚暂停状态和租约到期修改；重试同状态不重复写。
5. 普通运营、无授权管理员、他人活动及非本地拒绝，不泄露名单/凭证，不改额度或原邮件队列。

### Task 1：私有控制状态和任务门禁

**Files:** 新 `src/server/subscription-campaign-control.ts`、`src/migrations/20261121_150000_subscription_campaign_control.ts`、`tests/integration/subscription-campaign-control.ts`；集合/类型/迁移注册；freeze/quota/leases各接一处门禁，subscriptions测试入口新增末尾套件。

**Interfaces:** `readCampaignPause(p,actor,{campaignKey,revision})` 返回本人状态；`setCampaignPause(p,actor,{campaignKey,revision,paused,reason})` 返回状态及本次失效租约数；`requireCampaignRunning(p,req,campaignKey)` 服务内部暂停时409。

- [x] 写隔离集成并观察缺模块RED。
- [x] 实现默认状态、严格输入、当前权限/版本及同事务审计/租约到期；三个任务入口均门禁。
- [x] 验证停止无需有效确认、恢复须重新确认、状态幂等/跨版本持续、完成记录保留、旧凭证不复活、份额不重占、私有CRUD和角色/跨主管/非本地拒绝、迁移往返/非空保护、pause/resume延迟COMMIT失败回滚。
- [x] 一个真实子进程与父进程用数据库阻塞关系同步竞争暂停与完成，暂停先提交后完成必须拒绝；已有双子进程租约测试保留。
- [x] 22组订阅集成与完整check353项通过，警告不增加。

### Task 2：复核与交付

- [x] 一次只读复核，重要问题RED→GREEN；轻微项记录后续，不追加复核。
- [x] 一页中文亲测、progress/handoff更新，真实发送及未接界面明确区分，原始证据本机忽略归档。
- [ ] 独立PR，核对精确推送和CI，不自动合并。
