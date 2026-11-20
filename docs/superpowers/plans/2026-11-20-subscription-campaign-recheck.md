# 群发 B5a：本地任务资格复核与持久取消

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 先观察失败测试，最终只读复核一次。

**Goal:** 在调度前复核冻结任务，永久取消已不符合原同意或收件资料的任务，不因重新订阅复活旧任务。

**Architecture:** 复用当前本人草稿/来源/配置/授权及模拟确认门槛，在同一事务读取当前规范化资格并更新原暂存任务；冻结名单和人数不变。只增加 cancelled 状态、原因和时间，记录审计，返回汇总而非名单。

**Tech Stack:** Node24.22.1、Payload、PostgreSQL15；无新依赖。

**Spec:** 已批准 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第6–8节；PR88合并 `17dd427677e672a01e1fe2a0d1d759217e20fba7`。

## Global Constraints

- 只做本地服务层，沿用当前授权及本人最新草稿；非local、未确认、来源/配置变化、跨主管和旧身份均拒绝。
- 原快照不可改写，不加入晚订阅者；同意版本、邮箱或语言变化、退订/未确认/隐私失效/被较新同意取代均不能继续使用原任务。
- 取消只追加状态及原因/时间，后续任何重新订阅或资料恢复均不复活已取消任务。状态只有held/cancelled，均不能被现有worker发送。
- 每次显式复核写审计，与所有任务更新同事务；延迟COMMIT失败不能显示成功，失败不残留部分取消。返回仅含编号、时间和原因计数。
- 复核只是一次查询时的资格判断，不是实际发送的原子占用；退订与发送竞争、拒发名单、额度占用、租约/重试、真实发件留后续。现有单封邮件限额和队列不改。
- 新迁移增加默认空字段并保持原held值；保留原库/图片。仅在随机库验证，原库升级需配套备份与重启。
- 单批业务源码低于400行。无新外部服务、环境变量、原种子、公开操作或页面；用户决定PR合并。

## Review Focus

已取消任务因复核而重开；仅按当前邮箱合资格而忽略冻结同意版本/语言/摘要；错误将新订阅加入旧批；审计提交失败残留部分取消；来源失效后仍运行更新。Task1逐项验证。

### Task 1: 模型、迁移及复核服务

**Files:** 订阅集合和生成类型、新迁移 `20261120_170000_subscription_campaign_recheck.ts` 及注册、新 `src/server/subscription-campaign-recheck.ts`；新集成 `tests/integration/subscription-campaign-recheck.ts`，入口及旧迁移往返测试。

**Interfaces:** `recheckCampaignRecipients(p,actor,{campaignKey,revision})` 返回 `{batch,checkedAt,held:{zh,en},cancelled:{ineligible,consentChanged,contactChanged},newlyCancelled}`；取消原因枚举ineligible/consent-changed/contact-changed。

- [x] 写测试并运行订阅集成，观察缺少新模块的RED。
- [x] 增加cancelled状态、cancelReason和cancelledAt可空字段；up不改原任务值，down仅在无取消信息时回退，往返指纹一致。旧测试先撤新迁移再撤旧表，顺序重建。
- [x] 复核服务只遍历已冻结任务；按campaignAudience最新规范化记录和冻结的订阅ID、同意版本、语言及邮箱摘要比较。已取消者跳过，无效者持久取消；不改变原快照。
- [x] 集成：权限/撤权/旧版本/来源配置变化拒绝；真实退订→复核→重订确认仍取消；隐私/同意版本/邮箱/语言变化分类；晚订阅不补、并发不重复取消、无变化重复汇总；真正延迟审计COMMIT失败全回滚；迁移保留旧数据/回退保护，原单封队列不增加。
- [x] 19组订阅集成及 `npm run check`353项通过，lint不超过445；数据库与完整检查串行。

### Task 2: 交接与PR

**Files:** docs/progress.md、docs/handoff.md、一页中文小结。

- [x] 一次独立只读复核，重要项RED→GREEN修复，轻微项留记录，不追加复核。
- [x] 如实说明仅服务层无新按钮/截图、配额和真实投递未完成；提供本地隔离测试命令。
- [ ] 单独草稿PR，核对精确远端提交及CI，通过后供用户审阅合并。
