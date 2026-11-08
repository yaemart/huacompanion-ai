# 政策 B3：停留单位与类型默认值

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成已批准政策P0第4条，编辑与公开查询按相同单位显示。

**Architecture:** 新增可空maxStayHours，不改旧maxStayDays含义。旧过境快照没有小时值时沿用既有240小时查询契约；新小时值经审核发布后用于查询。默认值只在明确选择不同政策类型时应用，打开旧稿不补写。复用原授权、二审、快照和事务。

**Tech Stack:** Node24.22.1、PostgreSQL15、Payload、Next/React。

**Spec:** docs/tasks/policy-entry-ux.md 第4条（用户已批准直接实施）；顺序及限制见docs/tasks/2026-11-08-master-plan.md。

## Global Constraints

- 独立codex分支，基于PR25合并main c5fe6df；一个PR，不自动合并/部署。
- 业务改动不超过400行；不新增依赖、外部服务、真实政策或演示种子。不提前做共用事实C。
- 新增可空小时列及历史列；备份后迁移，只操作55442演示库；原3000/55438与.env保留。
- npm run check和相关集成通过；lint不高于465；截图本机忽略存放，未上传明确说明。
- 新人/真机验收不能以开发自测替代；真实AI/邮件/语音/通话/worker关闭。

## Review Focus

- 旧过境maxStayDays=3不能被解释成72小时，打开/局部保存不得写回默认值。
- 从单方面切到互免必须清空默认停留，不能误把30天当成核实结果。
- 过境空口岸草稿可以保存，但提交审核必须拒绝且有中文提示。
- 显式小时值必须为正整数，不能被负数/小数/字符串绕过；公开结果不硬编码240。
- 迁移只加空列不改现有事实/正式JSON；回滚有新小时数据时拒绝，避免静默丢失。

### Task 1: 单位、默认值和可逆安全迁移

**Files:** src/lib/immigration-policy{,-draft,-editor,-query}.ts；新src/lib/immigration-policy-stay.ts；src/cms/immigration/collections.ts；src/migrations/20261108_120000_policy_stay_hours.ts及index；payload-types.ts；PolicyFields.tsx；tests/immigration-policy-stay.test.ts；tests/integration/immigration-stay{,-render}.tsx/ts；相关CI/指南/小结。

**Interfaces:** changePolicyType(value: PolicyForm, type: PolicyForm['policyType']): PolicyForm；policyStay(policy: Pick<PublicPolicyData,'policyType'|'maxStayDays'|'maxStayHours'>): {unit:'days'|'hours';maximum:number}。policyFields增加maxStayHours；publicPolicy仅在有显式小时值时增加该字段，旧JSON投影保留相同形状。

- [ ] 写并观察单元RED：三类型默认值、同类型不重置、手填口岸保留、互免空值、旧过境240兼容、显式小时及非法值、公开结果一致。
- [ ] 写迁移/工作流集成RED：克隆演示备份up/down/up旧列摘要一致、小时回滚拒绝；旧稿局部保存及历史恢复、新小时发布/公开查询、自审与空口岸提交拒绝。
- [ ] 实现最小修改；生成Payload类型；SSR检查小时标签/required和旧值只读提示，无默默写回。
- [ ] 隔离备份和迁移；运行check及编辑/国家/工作流/公开查询/新迁移集成，记录实际结果。
- [ ] 桌面和390浏览器检查三种类型、新值/手改及旧稿无变化；截图本机；新人时限仍待验。
- [ ] 更新progress、handoff、一页中文小结；一次独立全分支复核；修复后提交推送一个草稿PR、核对远端和CI。
