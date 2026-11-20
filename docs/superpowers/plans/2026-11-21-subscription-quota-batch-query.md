# 群发模拟限额批量查询实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 本批自行实施，结束后一次新上下文只读复核。

**Goal:** 解决PR90轻微性能待办，1,000个候选邮箱全部受限时不再逐个执行计数查询。

**Architecture:** 在原有额度统计SQL中一次聚合滚动24小时内已占用邮箱摘要，以集合判断候选；共用数据库时钟、事务和锁保持原样。只优化查询，不改权限、限额或占位语义。

**Tech Stack:** Node24.22.1、Payload、PostgreSQL15；无新依赖或迁移。

**Spec:** 已批准 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第6节限额和并发约束，PR90合并 `cc167bcf5dc90163c9cb055a364144a89cf16278`，以及其明确留下的逐邮箱查询性能待办。

## Global Constraints

- APP_ENV=local及@example.invalid限制不变；不接worker/API/页面，不发真实邮件。
- 北京时间每日2,000、同邮箱滚动24小时1份、数据库时钟和共享事务锁、历史占位不退款、预算更新不绕过均不变。
- 不增加缓存或跨事务复用摘要；只在本次持锁统计时取快照，不能因优化放宽权限或暴露摘要。
- 无环境变量、数据库结构、原种子或依赖变更；原3100/55442及图片不重置。仅随机库验收。

## Review Focus

1. 最近窗口无占位时聚合为空：应正常占位而非异常。
2. 午夜之前的占位仍在24小时内：跨日不能绕过邮箱限额。
3. 千名候选全部受限：不逐个计数，返回email-limit且不增加账本。
4. 千名中仅最后一名解除限额：应找到这名候选，不能把整批一概拒绝。
5. 并发占位：集合只在当前事务取值，不复用旧统计。

### Task 1：聚合窗口摘要并保留原行为

**Files:** 修改 `src/server/subscription-campaign-quota.ts` 和 `tests/integration/subscription-campaign-quota.ts`。

**Interfaces:** 原setMockCampaignBudget与reserveMockCampaignSlot签名/返回不变；内部usage新增recentHashes，循环查集合不调用逐人count。

- [x] 扩展隔离集成测试：复用真实冻结千人历史，另冻1,000候选；全部受限时不新增占位且逐人count次数为0；只解除最后一名时仅占该名。
- [x] 跑订阅集成并观察旧实现逐人count为1,000的RED，再实现聚合。
- [x] 重跑20组订阅集成，覆盖空窗口、跨午夜、24小时、并发和审计失败；完整check353项、lint不超过445。

### Task 2：复核与独立交付

- [x] 一次新上下文只读复核，重要问题以RED→GREEN修复；轻微项记后续。
- [x] 更新一页验证指南、progress及handoff，区分查询优化和真实发送能力；记录测试的实际查询计数，不冒充吞吐量或实机计时。
- [ ] 独立PR，核对精确SHA、远端一致和CI；用户决定合并。
