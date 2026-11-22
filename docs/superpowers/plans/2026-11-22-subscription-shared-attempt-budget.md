# 同邮箱共用尝试与冷却实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。主执行实施，完成后一次独立只读复核，不分派实现。

**Goal:** 本地营销和确认/资料邮件共用15分钟、24小时5次尝试约束，保持重试/终态。

**Architecture:** 统一SQL查询现有两种时间数组；营销开始和邮件预占使用同一邮箱锁及同一查询。
候选批量读取，营销受限返回cooldown-local不计次，界面显示等待；原任务/审计事务保留。

**Tech Stack:** Node24.22.1、现有Payload/PostgreSQL/Next/React。

**Spec:** [设计](../specs/2026-11-22-subscription-shared-attempt-budget-design.md)，用户本轮明确规则及既有B默认。

## Global Constraints

- 15分钟间隔、滚动24小时最多5次；邮件70秒预占、每任务5次/23小时、原退避和review保留。
- 仅local合并模拟营销，既有真实发件门禁不变；无新增外发、权限或清除待核对入口。
- 规范邮箱跨主题锁与计数，旧主题/内容/业务锁顺序不能倒置；领取/等待/幂等不新增尝试。
- 无迁移/依赖/产品环境变量，原3100/55442和图片保留，业务≤400行、每行≤200、lint≤445。

## Review Focus

1. 同邮箱不同主题/大小写与历史改址，不能移走营销已消耗次数或误算其他邮箱。
2. 开始成功的回执丢失必须按原凭证核实，不因新冷却返回另一状态或重复计次。
3. 邮件70秒在途占位和跨进程竞争不能穿透同邮箱最后预算，也不能制造锁顺序死锁。
4. 第六次、恰好15分钟/24小时、超过5条历史及首尝试23小时，下一时间必须真实可用。
5. 受限0次回执和调度等待可读，原终态/审计回滚/权限不被额度判断覆盖。

### Task 1：共用预算与页面接线

**Files:** 新增src/server/subscription-attempt-budget.ts；修改subscription-mail.ts、subscription-campaign-leases.ts、subscription-campaign-attempt-state.ts、subscription-campaign-scheduling.ts及task-client/Playground/Status提示。新增tests/integration/subscription-shared-attempt-budget.ts及unit回执测试，原重试回归夹具仅前进时间。

**Interfaces:** subscriptionAttemptBudgetSQL(emails:string[])返回SQL，rows为{email:string,next:string}；冷却缺席表示当前可用。
新cooldown-local回执沿用AttemptReport字段，attempts0..5、started:false、有效nextAttemptAt；不增加持久attempt行。

- [ ] 新增双向真实计数/HTTP冷却/边界/并发/幂等/回滚回归，先观察RED。
- [ ] 接共享SQL和规范无主题锁，再接营销开始/临时结果和候选；原schema不变。
- [ ] 冷却回执校验单测RED后GREEN，页面中文等待提示，不开放reset。
- [ ] 更新模拟时间夹具、完整check和31组订阅集成；隔离生产预览亲测冷却和原凭证核实。
- [ ] 一次独立复核，重要问题一轮RED/GREEN，不追加复审。

### Task 2：交付

- [ ] 一页中文亲测、progress/handoff保留旧记录；截图日志忽略归档，未上传如实说明。
- [ ] 最新main/远端SHA/CI实核，独立PR可审阅，不自动合并。
