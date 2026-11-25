# 签名回执与模拟闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅本地、默认关闭的签名HTTP入口通过私有邮件绑定记录反馈与抑制，完成整链路模拟。

**Architecture:** 纯Svix验签与事件归一化先于数据库操作；受信入口自己验签，事务内解析绑定，复用私有反馈持久化，不引入HTTP鉴权绕过参数。新增绑定表、反馈sourceHash和可空attempt以表示邮箱级抑制。

**Tech Stack:** Node24.22.1 crypto、Next16 Route Handler、Payload3、PostgreSQL15；无新依赖。

**Spec:** docs/superpowers/specs/2026-11-25-subscription-signed-feedback-design.md

## Global Constraints

- 先H后展会日历，APP_ENV=local、example.invalid，真实发送/费用/部署/隧道关闭；不开放清除、恢复拒发、强制重试。
- 新SUBSCRIPTION_FEEDBACK_ENABLED默认false及空SIGNING_SECRET；不改已有.env。16KiB原始正文，签名时间±300秒，多v1候选及恒定时间比较。
- 原权限、锁、只读、同意、预算、重试与已开始结果记录守卫保留；无新依赖；迁移仅随机库，非空保护回退。
- 业务源码目标≤400行，源码最长200字符；完整check/订阅集成、中文小结/交接、一次末尾独立复核、草稿PR不自动合并。

## Review Focus

- 有效签名不授予随意挑选attempt能力；仅查预先绑定的邮件ID+原邮箱摘要，tags/任务号不参与授权。
- 全局无source_id抑制不捏造任务投递；原手工服务仍要求管理员，系统审计actor为空且标注来源。
- 请求签名窗口与事件时间分离；旧事件可重试，未知绑定503且无写入。
- 同svix-id换目标/类型/事件时间409、重放不写；全局抑制/迟到送达/移除都不清除拒发。
- 默认关闭/非local/试运行门禁/超体积/非法UTF-8均无业务副作用，不能日志回显正文或秘密。

### Task 1: 验签及事件契约

**Files:** src/lib/subscription-feedback-webhook.ts；tests/subscription-feedback-webhook.test.ts。
**Interfaces:** verifyFeedbackSignature(body:Buffer,headers:Headers,secret:string,now?:number):string返回svix-id；parseFeedbackEvent(body:Buffer)返回安全归一化事件或null（忽略）。

- [ ] 官方固定向量、正文篡改、错头/错密钥/时间、多签名、UTF-8、语义映射先RED，再以crypto实现；Expected: 全部GREEN，无新包。

### Task 2: 绑定、共享持久化、HTTP及整链路

**Files:** src/server/subscription-campaign-{feedback,mail-binding,signed-feedback}.ts、src/cms/subscriptions/collections.ts、src/app/(frontend)/api/subscriptions/campaign-feedback/route.ts、新迁移及index/payload-types.ts、.env.example；tests/integration/subscription-campaign-{signed-feedback,feedback}.ts及迁移回退用例。
**Interfaces:** bindLocalCampaignMail(p,actor,{emailId,attemptId,email})只新增不可换目标的绑定；recordSignedCampaignFeedback(p,body,headers)自行验签后在事务内查绑定并写反馈。原recordLocalCampaignFeedback接口不扩权。

- [ ] 动态服务/入口缺失先RED；绑定权限/冲突、有效签名错误目标、手工跨真实任务同ID冲突、JSON/体积/默认关闭/nonlocal/GET拒绝均比较指纹。
- [ ] 迁移加入私有绑定，扩反馈kind/拒发reason=provider-suppressed及sourceHash，attempt可空仅限邮箱抑制；更新所有受依赖的逆序回退/正序恢复用例。
- [ ] 实际HTTP→持久回执→营销资格/新活动/续发/worker及已开始结果保留；并发重放、先回调后绑定重试、审计失败回滚、无source_id及移除无清除。Expected: 新组及旧37组全通过。
- [ ] npm run check与npm run test:subscriptions通过，记录真实失败/修正，更新一页说明/交接；一次独立复核，重要项一轮RED→GREEN。
- [ ] 提交推送核对完整SHA、草稿PR及精确CI，声明仅本地模拟、旧演示库未升级及剩余H范围。
