# 群发 B4a：本地收件资格快照与暂存任务

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 先观察失败测试，整体只读复核一次。

**Goal:** 有效本地模拟确认后，原子冻结当时合资格的订阅版本并生成不可发送的暂存任务，同一活动重复操作不扩充名单。

**Architecture:** 在已有模拟检查的同一内容→业务事务锁内执行受控回调，重用版本、配置、语言和授权失效判断。新增私有快照/暂存任务集合，不复制邮箱，稳定活动编号与规范化邮箱摘要共同唯一；原单封队列、worker 和公开接口不接入。

**Tech Stack:** Node 24.22.1、Payload、PostgreSQL 15，沿用锁定依赖。

**Spec:** 已批准 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第 6–8 节；PR86 合并 `b5dc650b2a171d98a15cd552b8fa315ecc18d5b1`。

## Global Constraints

- 只在 APP_ENV=local；管理员也须显式授权，主管只操作本人最新草稿，只返回人数和快照编号，不能返回邮箱名单。
- 当前有效模拟测试与逐语言确认必须同时成立；来源、草稿、授权、配置变化后禁止冻结，观察到的失效仍持久记录。
- 首次冻结只收政策更新、已确认、confirmedAt 非空、有效同意版本、当前非空隐私版本且语言资料齐全者；同一规范化邮箱只一人，最多 1,000 人，超限全批拒绝。
- 快照和暂存任务及审计同事务。任务只有 held 状态，绝非可运行队列；没有发送资格、worker、供应商、退订凭证、限额占用或真实邮件。
- 同一活动重复冻结返回原人数、原时间、原编号，不加入晚订阅者。同活动改版续发暂未实现，明确 409 拒绝，不默默覆盖旧快照或绕过唯一键。
- 撤订后的现状不修改历史资格快照；后续发送必须另实现实时复核，不能据本批快照发送。拒发名单/额度/租约/重试留后续批次。
- 新迁移仅在随机临时库验证；原 3100/55442、图片和种子保留，无新环境变量或依赖。

## Review Focus

同意版本或语言漂移；配置改变时回调仍执行；重复冻结加入新订阅；规范化邮箱重复及 1,001 人截断冒充完成；审计延迟 COMMIT 失败虚报成功。Task 1 逐项覆盖。

### Task 1: 服务与私有快照

**Files:** 新 `src/server/subscription-campaign-freeze.ts`、`src/migrations/20261120_150000_subscription_campaign_freeze.ts`、`tests/integration/subscription-campaign-freeze.ts`；修改订阅集合、迁移注册、生成类型、mock-checks 服务和集成入口/迁移依赖测试。

**Interfaces:** `freezeCampaignRecipients(payload, actor, {campaignKey,revision})` 返回快照编号、冻结时间及 zh/en 人数，不返回任务或邮箱；`withConfirmedCampaign<T>(p,actor,input,run(req,draft,confirmation))` 仅在现有模拟确认有效时调用，仍保持失效记录和审计失败处理。

- [x] 写测试并运行 `npm run test:subscriptions`，观察缺少新模块的 RED。
- [x] 新私有 batches/jobs：快照绑定 draft/confirmation、活动编号、时间与 counts；暂存任务绑定 snapshot/subscription/consentVersion/locale，活动+邮箱摘要唯一，只有 held 状态。迁移有数据拒绝回退，空表往返指纹一致。
- [x] 扩展模拟服务的内部同事务回调，不增加公开 action；冻结操作只接收两个白名单字段，不从客户端接收邮箱或人数。
- [x] 集成验证：未确认/旧版本/无权/跨主管/非 local 拒绝；有效快照、并发幂等、不补新订阅、改版拒绝、规范化去重/语言/隐私/状态/确认时间/同意版本筛选、1,000 接受与1,001全拒绝、审计真正延迟失败不残留、原单封队列不增加。
- [x] `npm run test:subscriptions` 全部通过后，串行运行 `npm run check`，警告不超过 445。

### Task 2: 复核和交付

**Files:** 更新 `docs/progress.md`、`docs/handoff.md`，新增一页中文小结。

- [ ] 一次新上下文只读复核；重要问题 RED→GREEN 修复，轻微项记录，不重开复核轮次。
- [x] 记录真实结果和未实现范围；本批服务层无新按钮，亲测先运行独立集成命令，页面验收待下一批。
- [ ] 提交并推送单独 PR，核对 HEAD/远端 SHA 及确切 CI；用户决定合并，之后再开下一批。
