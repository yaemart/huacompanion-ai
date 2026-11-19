# 群发 B2a：草稿版本和固定预览实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 按任务测试先行，逐项完成。

**Goal:** 已单独授权的主管可保存自己的政策更新草稿版本，读取固定中英文预览和人数估计，不创建发件任务。

**Architecture:** 私有、只追加的草稿版本表，以稳定 UUID 和版本号定位；公开政策内容摘要作为来源版本标识。一个事务先持有内容锁、再持有业务锁，复用 B1 的当前角色和授权检查。只返回白名单字段及聚合人数。

**Tech Stack:** Node 24.22.1、Payload、PostgreSQL 15、TypeScript；不增加依赖。

**Spec:** `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第 6–8 节，用户已批准 B 和默认规则。超过 400 行继续拆批；本批是服务层，后台 UI、测试发送、确认冻结、逐人队列在后续 PR。

## Global Constraints

- 管理员也须独立授权；主管只能操作自己的活动，不能因此读取订阅邮箱。
- 固定模板引用已发布政策，不接受自填正文或内部备注；双语同一项必须对应同一事实。
- 每次保存追加版本，不覆盖历史；并发修改返回冲突。草稿人数是估计，不是收件资格快照。
- 政策改版、下架或过期，旧预览标为过期，不静默替换内容；保存须重新选择当前版本。
- 真实邮件、群发、费用、部署关闭；不修改原演示库、图片或种子。迁移仅独立临时库验证。
- 沿用现有独立任务分支，锁文件未变化不重装依赖；不另建工作树。

## Review Focus

跨主管活动编号枚举、撤权及伪造旧身份、内容与授权并发、语言资料不配对、提交失败却显示保存成功。均由下面的集成测试覆盖；模板语言自然度仍待用户亲测。

### Task 1: 私有草稿版本与迁移

**Files:** `src/cms/subscriptions/collections.ts`、新迁移及注册、生成的 `payload-types.ts`；`tests/integration/subscription-campaign-drafts.ts`。

**Interfaces:** 新私有集合 `subscription-campaign-drafts`，字段 `campaignKey/owner/topic/revision/selections/preview`，唯一 `(campaignKey,revision)`。只由服务追加，不开放通用 CRUD 或 REST；有记录时回滚拒绝。

- [x] 写测试：迁移无损往返，默认无活动，所有角色和匿名通用 CRUD 拒绝，重复版本和有数据回滚拒绝。
- [x] 运行 `npm run test:subscriptions`；Expected: 新迁移尚不存在而失败。
- [x] 实现集合、迁移，生成类型；重跑；Expected: 新迁移测试通过，既有测试不变。

### Task 2: 保存、读取、固定预览和人数

**Files:** `src/server/subscription-campaign-drafts.ts`、`src/server/subscription-campaign-preview.ts`、上述集成测试；现有订阅集成入口。

**Interfaces:** `saveCampaignDraft(payload, actor, {campaignKey?, revision?, policies})` 与 `readCampaignDraft(payload, actor, campaignKey)`；每个 policy 包含 `zh?/en?` 公开摘要标识。返回活动 UUID、版本、主题、双语预览、`current`、有效订阅按语言人数和缺语言排除数、统计时刻；不返回原始库记录或邮箱。选项最多 10 项，每项至少一个语言；这是本批实现上限，后续可调整，不是获批发件额度。

- [x] 先写测试：未授权、跨主管拒绝，固定双语正文/来源/核实日、内部字段不泄露；同事实配对、未知/重复/空标识拒绝；仅已确认且隐私版本有效计数、缺语言排除；改版/下架/过期标记；并发保存仅一份成功、历史不变、审计失败不保存、不入邮件队列。
- [x] 运行 `npm run test:subscriptions`；Expected: 新服务不存在而失败。
- [x] 实现最小服务；重跑；Expected: 全部订阅集成通过。

### Task 3: 交接、复核和 PR

- [x] `npm run check` 和订阅集成通过，lint 警告不超过 445；源文件最长 200 字符。
- [x] 更新 `docs/progress.md`、`docs/handoff.md` 和一页亲测小结，明确当前没有后台入口。
- [x] 一次独立只读复核；重要问题补失败测试后修复。
- [ ] 单独 PR，核对推送提交及该提交 CI；不自动合并，不声称原演示站已升级。
