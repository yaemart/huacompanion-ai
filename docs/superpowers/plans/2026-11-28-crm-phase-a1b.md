# CRM A1b：咨询唯一关联与撤销保护

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** 在A1a基础上交付咨询唯一关联、撤销保护及派生服务单的白名单读取，不开放界面／HTTP。
**Spec:** 阶段A设计，用户确认A1a合并后继续；基线main fe449d5包含最终8ac2855。

## 固定规则

复用独立CRM worktree/PG15.20集群55443；原演示集群、原稿及私有备份不操作。
新增crm-inquiry-links私有表：inquiry唯一、client、active、revision、linkedBy/At、reason、revokedBy/At/Reason。
无自动回填，无新的客户账号关系，无身份推断；旧customer-inquiry-links全程只读。
新增动作linkInquiry与revokeInquiryLink；严格clientID/expectedClientRevision及原因10–2000。
linkInquiry另需inquiryID/expectedLinkRevision，首次0；revoke需linkID/expectedRevision。
业务726281→客户726283锁内重读现职及客户/咨询双重范围，必须同团队；管理员也不绕同团一致性。
幂等回放先验当前客户、咨询与link归属，再核对原键，不先检查已递增的版本；旧回执仅表示历史操作。
关联时咨询只能占一个link行，已活动不能覆盖；撤销后允许重新关联，保留审计，不泄露前客户。
撤销必须当前关联归属、active及两个revision一致；任一活动旧外部授权存在则409、整次零写。
关联／撤销只增加本次客户revision；原客户在撤销时已递增，重新关联到新客户不再改原客户。
所有新变更、审计与原幂等操作回执同事务；理由/归属证据仅管理员审计与私有link字段，不进DTO。
archiveClient在同一锁内检查所有活动link，不只检查当前员工可见咨询，有活动link拒绝。
咨询后续被转交或改团队不扩权，双范围过滤；新关联必须同团队。现有关联仅在当前双方范围内展示，不因转交扩大访问。
管理员可以在仍有双方权限时明确撤销团队失配关联以纠错，但不得关联跨团队业务；不自动解关联。
只读新增linkedInquiries与inquiryCandidates：父客户先验权，过滤在计数/分页前，不用固定200/1000条截断。
linkedInquiries只含活动且当前有权咨询、linkID/revision、clientRevision及其唯一服务单id/title/stage。
候选只含授权同团队咨询与expectedLinkRevision；排除所有已活动占用，不返回占用客户或原因。
A1a的主管／无负责人建档与转团队重放两轻微覆盖在本批相关权限夹具补齐。

## Task 1: 基线、规则和模型

- [ ] 校验合并/分支、Node24.22.1、独立集群；原本锁定依赖无变化不重装。
- [ ] 新动作严格字段单元测试先RED后GREEN；本版本Next文档复核，无新路由。
- [ ] 新私有集合、类型与增量迁移；inquiry唯一、RESTRICT、非空down保护。

## Task 2: 事务写入

- [ ] 真实PG红测关联／撤销／存档阻断；实现准备验权、版本、原键回放、旧授权保护。
- [ ] 并发争抢、审计失败、提交后响应丢失、撤销与旧授权新增竞争、转交撤权屏障。
- [ ] 不改变原咨询、服务单、报价、外部授权、通知或邮件任务；指纹验证。

## Task 3: 只读派生与迁移回归

- [ ] 真实PG红测候选／关联投影，客户及咨询双范围、同团与先过滤再分页。
- [ ] 撤销重关联不泄露前客户；唯一服务单派生、草稿/成本不进入DTO；全表只读指纹。
- [ ] 旧虚构数据升级指纹、空表down/up、非空link及A1a回退依赖顺序；原CRM/客户/报价权限回归。

## Task 4: 交付

- [ ] check、CRM集成及生产build；一次独立整分支复核，重要问题一轮修正。
- [ ] 中文小结、progress/交接、提交推送、草稿PR与精确CI实核；不合并。
