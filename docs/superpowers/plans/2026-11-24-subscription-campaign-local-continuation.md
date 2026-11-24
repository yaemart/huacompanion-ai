# 同活动改版本地续发实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本地服务将合资格、从未尝试的原任务绑定到已重新确认的新版，保留历史并复用原执行守卫。

**Architecture:** 原batch保持不变，job新增可空版本/确认/时间；新事务服务选择并审计绑定，按目标版本幂等。
现有占位/调度/领取链核有效job版本，既有worker使用这些服务，不改worker启动或界面。

**Tech Stack:** Node24.22.1、TypeScript、Payload3/PostgreSQL15、现有Next16。

**Spec:** `docs/superpowers/specs/2026-11-24-subscription-campaign-local-continuation.md`

## Global Constraints

- local、本人现职/主题授权/当前版本/来源/新版模拟确认/活动控制，所有原额度/共用预算/限速/优先/重试保持。
- 不更新原batch，不补新人，不恢复任何已尝试/取消/待核对；不开放真实发送、清除、强制重试、新HTTP动作或页面按钮。
- 无新依赖、环境变量或.env变更；新迁移仅随机库验证，原库不升级。业务≤400行，源码≤200，lint警告不增。
- 原记录/原站/图片保留，先H后展会；一次末尾只读复核、精确CI、用户决定合并。

## Review Focus

- 任何尝试或完成证据均排除，过期未开始凭证不因新版本重新有效（任务1）。
- 续发不是复制slot/消耗预算；新的未占位任务仍通过原配额及共用预算/调度规则（任务2）。
- 同版重放/并发和连续改版不补新人，不覆盖已尝试的绑定、正文或唯一键（任务2）。
- 伪造字段、越权/撤权、来源/确认失效、暂停/取消及延迟提交均不产生错误成功（任务1/2）。
- 单任务版本过滤在占位、列表、挑选、领取各入口一致，旧版重试不能被新版worker捡起（任务2）。

### Task 1: 绑定模型与续发事务

**Files:** 新增server/subscription-campaign-continuation.ts、server/subscription-campaign-job-version.ts；
修改cms/subscriptions/collections.ts、migrations/index.ts，新增20261124_090000_subscription_campaign_continuation.ts及生成类型。
测试integration/subscription-campaign-continuation.ts，修订旧冻结表迁移依赖测试。

**Interfaces:** resumeMockCampaignRevision(p,actor,{campaignKey,revision})返回安全版本/数量/时间/重放收据；
campaignJobDraft(job,batch)、campaignBatchMatches(p,req,batch,draft)供任务2守卫使用。

- [ ] 新增真实随机库schema断言三列，运行聚焦集成。Expected: 0≠3 RED。
- [ ] 实现迁移/私有字段和生成类型，验证原表down/up保留数据；有绑定拒绝down，非授权通用CRUD/REST拒绝。
- [ ] 写服务缺确认/无候选/有效租约/权限、仅选择合资格未尝试、重放/原表列保留及提交回滚回归，再实现最小事务服务。
- [ ] 修订四个旧schema回滚/恢复夹具，把新增迁移按依赖顺序纳入；真实随机库验证。
- [ ] 相关集成和check通过后提交本批后端模型与服务。

### Task 2: 原执行链版本适配与交付

**Files:** server/subscription-campaign-{quota,scheduling,task-options,leases}.ts；新增integration测试/CLI夹具；
docs/subscription-campaign-local-continuation-summary.md、handoff.md、progress.md。

**Interfaces:** 单任务有效draft=continuationDraft或原batch.draft；仅目标版本匹配者可占位/列表/领取/开始结果。

- [ ] 写新版绑定后原slot可挑选/领取、首次正文是新版、旧已尝试slot不可领取的失败回归，运行看RED。
- [ ] 最小适配既有守卫与SQL过滤，不改限额、等待、优先级、重试或worker流程。
- [ ] 增加多版本、两进程/并发、旧token、预算零/占位幂等、冷却/限速/邮件优先及真实指定版本CLI回归。
- [ ] 完整npm run check与npm run test:subscriptions。Expected: 全部通过；保留前批463单元/33组，再新增续发组。
- [ ] 中文交接记录真实结果/迁移说明，旧原文保留；一次独立复核，重要项一次RED→GREEN修正，轻微记录延期。
- [ ] 最终推送fetch同SHA、确认该提交PR触发CI两作业success，转ready，不合并。
