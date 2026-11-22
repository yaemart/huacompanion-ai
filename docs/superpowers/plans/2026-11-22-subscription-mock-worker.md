# 本地模拟营销独立 worker 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。主执行自行TDD实施，末尾一次新上下文只读复核，不分派实现。

**Goal:** 独立本地进程自动执行原候选、领取、尝试、固定模拟结果，保留全部规则。

**Architecture:** 严格CLI参数先于Payload初始化；服务闭包保留未开始凭证，用数据库时间回收过期内存状态；每轮原服务串接，不新增授权或传输。

**Tech Stack:** Node24.22.1、现有tsx/Payload/PostgreSQL，无新依赖或迁移。

**Spec:** [设计](../specs/2026-11-22-subscription-mock-worker-design.md)。按用户明确的继续开发/测试/PR指令执行；CLI作用域为执行者推荐的最窄范围。

## Global Constraints

- 只在local；只消费已占位@example.invalid任务，不准备额度、不代确认，不扫描所有活动、不消费优先单封邮件、不真实发送。
- 原权限/版本/资格/暂停取消、余额/北京日2000/同邮箱24h一份、共用15m/24h5、全站1001ms、优先及5次23h/退避/review保持。
- 无清除入口；异常停止，不补造结果，不改变已开始任务；原租约恢复规则继续生效。
- 业务≤400行、行长≤200、lint≤445；随机库验证，原3100/55442和图片保留。

## Review Focus

1. 同进程短时等待保留原凭证但不续期，70秒其他队列占用超过60秒租约时能恢复未开始任务。
2. 权限/暂停/来源在阶段间变化，不能越权记录结果；结果审计提交失败不能自动补成功。
3. 多worker及页面竞争，唯一领取和同次计数；重启不接管attempting/review，保留历史预算。
4. CLI严格输入/nonlocal须在连接DB前拒绝，日志不能泄露token/邮箱/正文，退出信号不留下一轮。
5. 候选空闲/限速/优先/冷却不计次；不能用默认accepted覆盖已有终态或把错误当结果。

### Task 1：独立worker接线

**Files:** Create src/lib/subscription-mock-worker-options.ts、src/server/subscription-campaign-worker.ts、scripts/subscription-mock-worker.ts；Modify package.json；Test tests/subscription-mock-worker-options.test.ts、tests/integration/subscription-campaign-worker.ts、tests/integration/subscriptions.ts。
**Interfaces:** parseMockWorkerArgs(args:string[])返回严格规范化Options；createMockCampaignWorker(p,options)返回单轮async tick，只输出安全WorkerReport（state/slotId/attempts/nextAttemptAt）。原readNextCampaignMockSlot/claimMockCampaignTask/beginMockCampaignAttempt/recordMockCampaignOutcome不改授权语义。

- [ ] 写参数/环境边界及真实worker完整路径测试；运行观察缺少新导出/功能RED。
- [ ] 实现输入校验、闭包与本地CLI，保留短等待凭证和DB时钟过期恢复，纯模拟结果，不调用邮件。
- [ ] CLI真实进程断言完成/重试/429/review/永久失败、无凭证输出，非local/坏参数在无DB时拒绝。
- [ ] 真实双进程竞争、冷却/全局/优先等待0次、旧版本/撤权/暂停/资格拒绝；结果COMMIT失败非0退出后重启不改review。
- [ ] npm run check、33组随机库全部GREEN，diff和业务行数检查；提交实现。
- [ ] 一次独立只读复核，主执行裁定并在一轮内TDD修正重要项，不追加复审。

### Task 2：中文交接与PR

**Files:** docs/subscription-mock-worker-summary.md、docs/handoff.md、docs/progress.md、README.md。
**Interfaces:** 记录Task1实际命令、结果、作用域和局限；用户已指定推送并提交PR，不重复询问集成方式。

- [ ] 一页中文小结/启动命令/退出说明；保留历史；记录实际测试/复核、无新增迁移和已有迁移要求，不声称浏览器/真实投递验收。
- [ ] 核对最新main、推送、fetch核对任务分支完整SHA，PR可审阅、最终提交CI实际通过，不合并。
