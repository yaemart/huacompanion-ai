# 独立 worker 信号同步测试计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。主执行自行实施，末尾一次新上下文只读复核，不分派实现。

**Goal:** 实际结果事务内同步发SIGKILL/TERM，证明不重记、review保留和当前轮完成后不领下一项。

**Architecture:** 测试专用PostgreSQL屏障和唯一application_name证明结果事务阻塞；preload仅观察信号监听器执行完成，生产worker原样运行。

**Tech Stack:** Node24.22.1、现有pg/tsx/Payload，无依赖/迁移/环境变量变更。

**Spec:** [设计](../specs/2026-11-23-worker-signal-sync-design.md)。用户本轮明确范围及验收，直接执行。

## Global Constraints

- 仅严格随机测试库使用触发器/屏障，副作用finally清理，子进程原网络/日志护栏保持。
- 原权限/额度/预算/限速/优先/重试不变，不清除review、不真实发送；业务源码目标0行。
- 行≤200、lint≤445；原3100/55442/图片保留，不升级原库，无UI验收声明。

## Review Focus

1. 屏障属于本次slot结果审计，明确观察父连接阻塞，不能从begin或时间猜测。
2. observer仅观察、不代替生产stop；信号回执后仍在处理中，再释放当前轮。
3. KILL后释放屏障并等待全部相关PG会话结束，再核对回滚。
4. TERM前第二项已可领取，退出后其lease/attempt/audit均无领取，随后新进程可处理。
5. 失败路径杀子进程、释放唯一锁、清理本次DDL，故障注入逐字恢复，不混入PR。

### Task 1：同步屏障与两类信号

**Files:** Create tests/helpers/worker-result-barrier.ts、tests/helpers/mock-worker-signal-observer.mjs、tests/helpers/worker-completion.ts、tests/worker-completion.test.ts；Modify tests/integration/subscription-campaign-worker.ts。
**Interfaces:** createWorkerResultBarrier(db,slotId)返回waitForBlocked(applicationName,child)、release()、close()；waitForWorkerCondition(check,label,child?,timeout?)有界轮询；waitForWorkerSessionsGone(db,name)等待回滚结束。launch的可选observer仅用于TERM。

- [x] 实现仅测试屏障/observer，替换旧pg_sleep及回执后发信号。
- [x] KILL事务内终止后等DB消失，核对attempt/audit、两次重启只读及review。
- [x] TERM处理中收信号后释放，核对当前完成、退出0/单回执、下一项未领取；新进程可处理下一项。
- [x] 三种错误控制观察预期RED并逐字恢复；正常check397/33组GREEN，提交实现。
- [x] 一次独立只读复核，1项P2提前拒绝清理问题一轮RED/GREEN修正，不追加复审。

### Task 2：中文交接与PR

**Files:** docs/worker-signal-sync-summary.md、docs/subscription-mock-worker-summary.md、docs/handoff.md、docs/progress.md。
**Interfaces:** 引用真实事务阶段、信号与审计证明，补上旧轻微缺口，历史记录保留。

- [x] 一页小结与交接；原阶段当前说明注明补强，不声称UI/真实发送验收。
- [ ] 最新main/fetch/完整远端SHA核对，PR可审阅及精确CI通过，不自动合并。
