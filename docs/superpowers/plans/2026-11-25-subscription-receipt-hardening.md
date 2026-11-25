# 本地续发收据只读补强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拒绝冻结版本不符的收据，去掉收据查询的名单扫描，并让预检提示符合当前状态。

**Architecture:** 原事务中共享元数据授权守卫，收据与真实冻结草稿交叉核对；页面按冻结状态查询，预检使用明确状态提示，执行门禁与API DTO不改。

**Tech Stack:** Node24.22.1、Next16、Payload3、PostgreSQL15、现有React/TypeScript测试工具。

**Spec:** docs/superpowers/specs/2026-11-25-subscription-receipt-hardening.md

## Global Constraints

- local/本人现职主题授权/当前版本与只读规则保留；原确认资格额度预算限速优先重试不扩展，不开放真实发送/清除/强制重试。
- 无迁移/依赖/环境变量/.env变化，原库不升级；Node24.22.1、业务≤400、源码行≤200、lint≤445既有警告。
- 先H后展会，旧交接正文保留，原始证据不Git，一次末尾独立复核，重要项一次RED→GREEN、轻微延期，精确CI，用户决定合并。

## Review Focus

- 原冻结1或2、当前3的合法外形错误原版号须503，不向准备面板提供假事实（步骤1）。
- 元数据守卫仍核现职、授权、本人和最新版本，来源变化时历史可读但不写reset（步骤2）。
- 原withCampaignDraft调用不减少内容或名单检查，原执行门禁和名单单次读取不退化（步骤2/4）。
- 页面无快照/原版跳过收据，有旧快照才读；读服务本身不触及subscriptions（步骤2）。
- 已续发、无快照、原版、dirty/blocked/暂停取消提示不提供错误的操作许可（步骤3/4）。

### Task 1: 收据、查询与状态说明补强

**Files:** 修改server/subscription-campaign-{drafts,continuation-read}.ts、app/(frontend)/subscription-campaigns/page.tsx、components/subscriptions/{CampaignWorkspace,CampaignRevisionPreflight}.tsx、lib/subscription-campaign-revision-preflight.ts；新增tests/integration/subscription-campaign-receipt-hardening.ts、tests/subscription-campaign-receipt-page.test.ts及tests/subscription-campaign-preflight-guidance.test.ts；文档summary/handoff/progress。

**Interfaces:** withCampaignRevision(p,actor,key,revision,run(req,row))只取授权当前元数据；原withCampaignDraft接口保持；readCampaignContinuation DTO不变；preflightActionHint(report,{continued,dirty,blocked})生成状态说明，页面passed continued是已校验收据。

- [ ] 原冻结1/2当前3，篡改收据为另一合法原版号；真实POST先200≠503 RED，再最小关联实际冻结版校验；Expected:合法可读、错误503、读全表指纹不变。
- [ ] 驱动观察收据subscriptions读取先1≠0 RED；页面函数无快照/原版调用先1≠0 RED；抽元数据守卫并跳过无效查询；Expected:收据0扫描、页面0/0/1，权限/当前版/只读不变、原报告仍1次。
- [ ] 状态说明单测先缺函数RED；实现取消/暂停、无快照、原版、已续发、dirty/blocked/其他阻断及可提交说明，连接真实工作台SSR；Expected:无错误推进文案，预检DTO不改。
- [ ] 完整npm run check、官方npm run test:subscriptions保留35组新增第36组，隔离生产桌面/390开发自测；Expected:全通过、无未预期控制台错误/横溢出，原站保留。
- [ ] 中文交接记录实际结果与只读边界，提交并运行任务完成命令npm run test:subscriptions；一次末尾复核，重要项一次修复全套复验。
- [ ] 推送fetch核对远端同SHA，精确PR触发CI两作业success后ready，不合并；最终记录由PR承载。
