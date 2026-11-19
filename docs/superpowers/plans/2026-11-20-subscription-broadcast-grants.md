# 群发 B1：独立授权基础实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为已确认的政策更新群发建立默认拒绝、可撤销、可审计的独立主管授权；不发送邮件。

**Architecture:** 在现有私有订阅集合中增加一张员工＋主题授权表，不给员工角色隐式增加群发权限。服务器在现有业务事务锁内重新读取员工角色和授权，授权的设置/撤销与审计同事务完成。第一批不做活动编辑器或发件入口，后续活动操作复用这一授权服务。

**Tech Stack:** Node 24.22.1、TypeScript、Payload 3.92、PostgreSQL 15；无新依赖。

**Spec:** [已确认的停止点 C 方案 B，第 6 节](../../tasks/2026-11-19-subscription-broadcast-options.md)。用户于 2026-11-20 回复“接受建议”，选择 B 及默认规则，仅授权先做本地模拟。

## Global Constraints

- PR82 已核实合并，合并提交 `3464e028c17532945c7c302d198df7da1e9fbf0c`；本计划编写过程中收到合并通知，因此随 B1 提交。`codex/subscription-campaign-grants` 从该最新 `origin/main` 创建，不叠加 PR、不自动合并。
- 本批仅授权基础。活动/政策版本预览、模拟测试与确认、逐人发送、限额、退订竞争和回执后续逐批完成，不能声称本批可群发。
- 唯一主题 `policy-updates`；现有员工默认没有群发授权。当前管理员名单/CSV权限和内容、报价二审规则不变。
- 主管需独立授权；管理员属于现有 `isManager` 能力范围，但也不因管理员身份自动获得群发操作权，需有显式授权。管理员保留授权管理权。
- 真实邮件、AI、语音、通话继续关闭；本批不调用邮件适配器、不启动 worker、不加发件开关、不同步外部联系人。
- 不改既有演示种子、不运行 `local:reset`。迁移和集成只用执行器创建的独立临时库；未来原演示库升级前需数据库与图片配套备份。
- 业务改动超过 400 行则进一步拆分；源码每行不超过 200 字符，lint 警告不得超过当前 445 条。

## Review Focus

1. 兼任主管与旧 JWT：按数据库当前角色判断，不能信任提交对象中的角色或过期授权。
2. 撤销又重新授权：授权版本递增，不能让未来旧活动因重新授权自动恢复。
3. 并发设置授权或停用账号：与现有员工修改共享业务锁，不产生两条重复授权或漏审计。
4. 数据入口：匿名、客户、普通运营不能从 REST/GraphQL/Local API 非 override 入口读取或写入授权数据。
5. 迁移及失败：已有订阅、账号、报价不变；审计事务失败不能留下实际授权，适配器吞掉 COMMIT 错误时不能假称成功。

## Task 1：私有授权集合与安全迁移

**Files:** 修改 `src/cms/subscriptions/collections.ts`、`src/migrations/index.ts`、`payload-types.ts`；新增 `src/migrations/20261120_090000_subscription_campaign_grants.ts`、`tests/integration/subscription-campaign-grants.ts`；在 `tests/integration/subscriptions.ts` 接入测试。

**Interfaces:** 生成类型 `SubscriptionCampaignGrant`；集合 `subscription-campaign-grants` 含 `staff`（员工关系）、`topic`（仅 `policy-updates`）、`enabled`（默认 false）、`revision`（正整数）、`changedBy`（可空员工关系）、既有创建/修改时间。`staff＋topic` 唯一，员工删除引用 RESTRICT，变更人删除 SET NULL。集合隐藏、直接 CRUD 拒绝、`endpoints:false`、`lockDocuments:false`，沿用原私有集合模式。

- [x] **Step 1：新增真实数据库断言并观察失败。** 已迁移库能发现新集合及唯一索引；迁移不自动创建授权；匿名和五类员工的非 override CRUD 均拒绝；重复员工＋主题被拒。
- [x] **Step 2：运行 `npm run test:subscriptions`。** 新表/集合尚不存在时应失败，不能把连接或密钥错误当作有效失败。
- [x] **Step 3：实现集合与迁移并重新生成 Payload 类型。** `up` 只增表/约束；`down` 先锁表，只允许空授权表回退，有记录时明确拒绝，不静默删除授权历史。沿用现有订阅集合展开，毋须改 Payload 业务配置行为。
- [x] **Step 4：验证迁移。** 在隔离库对新增表 `down/up`，对原表做指纹比对；有授权时回退拒绝。`npm run test:subscriptions` 应通过原十组和新增断言；类型生成不夹带无关变化。

## Task 2：设置授权、即时撤销与审计

**Files:** 新增 `src/server/subscription-campaign-access.ts`；扩展同一 `tests/integration/subscription-campaign-grants.ts`，不添加公开路由。

**Interfaces:**

- `setCampaignGrant(payload: Payload, actor: Staff, input: { staffId: number; topic: "policy-updates"; enabled: boolean }): Promise<SubscriptionCampaignGrant>`：仅当前有效管理员可设置；授予时目标须是当前有效 `isManager` 员工，撤销时允许目标已停用或降职，避免清理权限被阻塞。运行时验证字段及主题，拒绝未知字段。第一次设置 revision=1，状态变化递增，同值重复设置不递增。
- `requireCampaignGrant(payload: Payload, actor: Staff, topic: "policy-updates", req?: Partial<PayloadRequest>): Promise<{ actorId: number; grantId: number; grantRevision: number; topic: "policy-updates" }>`：重读员工与授权，当前角色不符、停用、未授权或已撤销均 403；不返回邮箱或名单。未来特权写操作必须在同一 `businessTransaction` 的 `req` 内再检查，不能把一次只读检查当长期通行证。
- 复用 `businessTransaction` 与员工修改共享锁；设置和审计使用同一 `req`。审计 entity=`subscription-campaign-grants`，action=`grant`/`revoke`，记录 actor、目标员工 ID、主题、enabled、revision 前后值，不写邮箱或凭证。提交后读回审计以检测既有适配器的 COMMIT 异常，不返回虚假成功。
- 授权版本是未来活动确认的资格版本。活动必须绑定操作者和 grantRevision；撤销、重新授权不自动恢复旧确认。活动行为由后续 PR 实现，本批只提供版本基础。

- [x] **Step 1：先补测试并运行到有效失败。** 无授权的管理员/主管、普通员工、停用用户、伪造角色和撤权后旧对象均拒绝；仅管理员能设置，非法主题及未知字段被拒，未授权目标不得靠 `enabled:true` 提升角色。
- [x] **Step 2：实现最小授权服务。** 沿用现有员工能力函数，不改 Staff 角色或团队边界；授权不使 `/api/subscriptions/manage` 或 `/api/subscriptions/export` 对主管开放。
- [x] **Step 3：补并发与失败断言。** 并发对同一员工/主题设置只有一条授权；同值设置不增版本；撤销再授予版本持续递增。按已知顺序持业务锁并发停用目标后，后续检查拒绝。真实延迟约束触发器使审计在 COMMIT 失败时，授权不生效，服务不报告成功。
- [x] **Step 4：运行相关回归。** `npm run test:subscriptions` 验证新授权及既有名单/CSV权限、订阅确认与退订；`npm run check` 须通过且 lint 不增加。仅注入模拟发送器，真实邮件为零。

## Task 3：本地交付与第一批 PR

**Files:** 更新 `docs/progress.md`、`docs/handoff.md`，新增 `docs/subscription-campaign-grants-summary.md`。

- [x] **Step 1：记录实际结果和边界。** 本批亲测通过 CLI 检查授权与撤销；授权管理界面、活动预览和群发尚未接入。不能把原 C/E 清单或未来群发验收记为通过。保留原 3100 数据，新增迁移未应用原演示库时如实说明。
- [ ] **Step 2：检查差异并提交推送。** 只提交本批文件；核实 `HEAD` 与任务上游一致，草稿 PR 面向 main。无界面时截图不适用，不提交原始报告和密钥。
- [ ] **Step 3：完成独立复核与对应提交 CI。** 修复重要问题后再交用户合并。用户未合并时不开始下一批。

## 后续批次衔接（不在 B1 实施）

1. B2：活动草稿、稳定活动 ID、已发布政策版本和固定中英文预览，复用 B1 授权检查。
2. B3：模拟测试及测试失效、主管手动确认和冻结收件资格快照；不额外新增群发二审。
3. B4：独立逐人任务、共用邮箱预算、全站限速、幂等/暂停/重试，按实际改动拆小 PR。
4. B5：退订竞争、政策改版只续发未尝试者、签名回执与营销拒发状态、整链路模拟验收。

真实账号、费用、部署和任何真实试发/群发仍需用户另行授权。此计划细化已确认 B，不改变已批准的额度与业务规则。B1 的实际验证见 `docs/progress.md`；后续活动与发送仍依顺序 PR 推进。
