# 预检名单读取复用实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一次只读预检仅查询和归一化一次订阅名单，并验证大名单结果及性能。

**Architecture:** withCampaignDraft创建本调用内的惰性Promise读取器，经服务端回调交给确认检查与预检。
campaignCounts可接收已读取的服务端名单；其他调用默认重读。不增加缓存或对外字段。

**Tech Stack:** Node24.22.1、TypeScript、Payload3/PostgreSQL15、现有Next16。

**Spec:** `docs/superpowers/specs/2026-11-24-subscription-preflight-audience-reuse.md`

## Global Constraints

- Node24.22.1；无依赖、环境变量或迁移变更；业务增删≤400行、源码行≤200、lint警告不增加。
- 保留当前角色/授权/归属/版本与只读投影、确认和重试等原规则；不开放续发、真实发送、清除或强制重试。
- 仅当前调用内复用，不向外返回名单/读取器，不缓存其他写操作的资格读取；原记录、原站、原库和图片保留。
- 先完成H，再做展会日历；本批不扩展到下一功能。原始报告仅忽略归档。

## Review Focus

- 反复调用、隐私版本/退订/同意变化不能命中上一调用名单（任务1）。
- 回调增加私有参数后，read/save草稿与预检API仍只返回安全DTO（任务1）。
- 可执行操作的资格重读不因共享报告读取器而被偷偷缓存（任务1）。
- 大名单的新订阅及重复规范邮箱不能扩充原冻结任务或改变取消/尝试历史（任务2）。
- 性能比较不混淆名单局部耗时与完整预检，异常路径清理夹具和恢复观察器（任务2）。

### Task 1: 调用内复用与直接回归

**Files:** server/subscription-campaign-{preview,drafts,mock-checks,revision-preflight}.ts；
tests/helpers/{observe-pg-queries,campaign-revision-preflight}.ts、integration/subscription-campaign-status.ts。

**Interfaces:** CampaignAudienceReader=()=>Promise<Audience>，仅服务端回调追加参数；DTO不变。

- [ ] 给真实PG观察器增加可选SQL过滤谓词，默认审计观察保持；本人无冻结预检与原名单预检断言1次读取。
- [ ] 运行官方随机库聚焦状态集成。Expected: 当前已冻结预检2≠1 RED。
- [ ] withCampaignDraft内创建局部读取器，report/计数使用同一结果，经Inspection传给预检；其他调用沿用原方式。
- [ ] 复用既有状态夹具全部权限/隐私/变更与全表指纹回归；额外核实另次调用、隐私版本变化新读及安全投影。
- [ ] 完整check和npm run test:subscriptions。Expected: 463单元及33组通过，所有授权预检名单读1次，独立调用仍新读。
- [ ] 提交优化和回归。

### Task 2: 大名单验收与交付

**Files:** tests/helpers/campaign-preflight-audience-performance.ts；campaign-revision-preflight.ts调用；
docs/subscription-preflight-audience-reuse-summary.md、handoff.md、progress.md及前批小结遗留链接。

**Interfaces:** assertPreflightAudiencePerformance(p,db,actor,input,expectedCounts)只在现有随机库夹具运行。

- [ ] 先写100000条五类订阅/6哨兵、独立人数与原任务分类断言、单次SQL/只读及finally清理断言；运行验证。
- [ ] 预热后5轮交错测旧2次/新1次名单读取归一化和当前完整服务；EXPLAIN统计扫描及共享缓冲，保留全部样本。
- [ ] 运行完整check和33组订阅集成。Expected: 全绿；名单SQL1次、独立计数和原分类正确、读前后全表指纹相同、marker清零。
- [ ] 中文小结记录实际数据和比较边界，原handoff/progress保留；不重复无变化UI截图或宣称真人验收。
- [ ] 一次新上下文只读复核，重要项一次RED→GREEN修正、轻微延期；最终推送fetch同SHA、精确PR CI成功后转ready，不合并。
