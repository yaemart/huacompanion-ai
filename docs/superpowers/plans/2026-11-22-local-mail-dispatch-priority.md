# 本地全站调度限速与订阅优先计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans，主执行自行实施，末尾一次独立只读复核，不分派实现。

**Goal:** 本地全部邮件队列共用每秒最多1次调度，营销退让可处理确认/资料，旧规则不放宽。

**Architecture:** 新增私有数据库闸门；营销开始原事务放行，单封/通知70秒在途归属+投递前guard，完成后再隔1秒。
候选读等待，强制最终复核；复用原单封资格/正文/共用预算判断优先。

**Tech Stack:** Node24.22.1、现有Next/React/Payload/PostgreSQL，无新依赖。

**Spec:** [设计](../specs/2026-11-22-local-mail-dispatch-priority-design.md)，用户本轮明确规则和既有B默认。

## Global Constraints

- 本地全站每秒最多1次，数据库时钟+持久状态，多进程共用；生产/trial不打开真实发送。
- 原授权/版本/来源/资格/暂停取消、额度、15m/24h5及5次/23h/退避/review保持，无清除入口。
- 闸门在原内容/业务/邮箱/任务锁之后；transport guard不反向取得这些锁，在途归属不外泄。
- 新迁移仅随机库验证，原3100/55442和图片保留；无新依赖/产品环境变量，业务≤400、行≤200、lint≤445。

## Review Focus

1. 邮件领取提交与实际transport间暂停/崩溃，不能使延迟旧进程挤入另一次放行。
2. 不同邮箱、不同进程、通知与营销仍共用1秒；等待不预占尝试且审计失败回滚闸门。
3. 无效/冷却/未来/过期优先队列不能无限饿死营销，原资格与正文指纹不被复制简化。
4. 开始回执丢失核实仍同次attempt，终态不能被新等待覆盖，lease过期仍按原规则。
5. 私有状态ACL/迁移数据保护、只读候选不改时钟、UI等待0次与原因不泄漏联系人。

### Task 1：持久闸门与全部本地入口

**Files:** 新增server/local-mail-dispatch.ts、subscription-mail-priority.ts；cms/subscriptions/collections.ts与20261122_210000_local_mail_dispatch迁移/registry/types；修改subscription-mail.ts导出原资格构件并接闸门、workflow/service.ts与customer/service.ts验证码接同一闸门；campaign attempt/scheduling与client/Playground/Status接等待。
**Interfaces:** query(statement)返回rows；readDispatchWait(query,priority?)读等待；admitDispatch(query,owner?,holdMs?,priority?)在try-lock下放行或返回等待；guard/release核对hashed owner。hasSubscriptionPriority(p,req)只读原单封资格。

- [x] 新增真实HTTP/DB/多进程限速、优先、跨队列、在途归属/回滚、ACL和迁移测试，先RED。
- [x] 迁移+私有模型+类型；实现闸门和复用原资格的优先查询，保持锁序。
- [x] 接全部入口与等待回执，未知重放/终态优先，候选只读；单测先RED后GREEN。
- [x] 原回归夹具显式推进调度时钟；check、32组订阅和相关workflow集成、生产隔离浏览器。
- [x] 一次独立只读复核，重要问题一轮RED/GREEN修正，不追加复审。

### Task 2：交付

- [x] 一页中文小结及progress/handoff，迁移/重启说明，截图/日志忽略归档，未上传如实说明。
- [ ] latestmain/远端SHA/精确CI核对，独立PR可审阅，不自动合并。
