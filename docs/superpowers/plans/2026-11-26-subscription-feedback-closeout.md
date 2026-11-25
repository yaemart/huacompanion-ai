# H 本地回执收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关闭三个已知轻微项，并在本人活动工作台展示独立只读回执汇总。

**Architecture:** 严格日期解析保留签名原时间；实际 Next 方法表证明非 POST 拒绝。汇总服务复用 withCampaignRevision 与既有 campaigns API，SQL 按原名单和原尝试关联，组件独立刷新。

**Tech Stack:** Node24.22.1、Next.js（安装锁定版本）、Payload、PostgreSQL15、React、TypeScript。

**Spec:** docs/superpowers/specs/2026-11-26-subscription-feedback-closeout-design.md

## Global Constraints

- 沿用原生实施，业务源码增删目标≤400行；保留本人/现职/主题授权、写锁和只读边界。
- 无新依赖/迁移/开关；既有库不升级不 reset；仅独立虚构测试数据库。
- 真实发送、清除拒发、强制重试、公网、费用、部署均关闭；退订组装是真实试发前门禁。
- 提交推送后核对远端 SHA，草稿 PR 不自动合并；本 PR 合并后再从最新 main 开日历任务。

## Review Focus

- 跨活动、迟到送达和全局邮箱抑制不得污染邮件级统计：任务2真实 PG 断言。
- 撤权/停职的旧会话不得读历史：任务2重新读取当前员工/授权与全表指纹。
- 旧版页面、来源失效、未保存选择不得触发 reset：任务2元数据守卫/组件独立刷新验证。
- UTC 日跨界、闰年及带偏移不存在日期不得混淆：任务1固定输入日期表。
- 回退失败不能留下事务锁或部分改表：任务1 独立事务回滚和全表指纹。

### Task 1: 三项轻微事项

**Files:** src/lib/subscription-feedback-webhook.ts；tests/subscription-feedback-{webhook,route}.test.ts；tests/integration/subscription-campaign-signed-feedback.ts

**Interfaces:** parseFeedbackEvent(Buffer) 返回契约不变；Next autoImplementMethods 使用实际路由导出；迁移 down 通过 PG 客户端事务调用。

- [ ] 补不存在日期/闰日/偏移/24点用例，运行日期测试，确认无效日期先 RED。
- [ ] 添加严格时间组成检查，再运行协议/路由用例，预期全通过。
- [ ] 用实际 Next 分发表替换适配器 GET 证据；PG 分别构造绑定非空、签名反馈、空 attempt 反馈及 provider-suppressed 拒发，BEGIN→down 拒绝→ROLLBACK，指纹不变。
- [ ] 运行聚焦真实 PG/HTTP 测试，预期 PASS；提交。

### Task 2: 独立只读汇总与交付

**Files:** 新 src/server/subscription-campaign-feedback-summary.ts、src/lib/subscription-campaign-feedback-summary-client.ts、src/components/subscriptions/CampaignFeedbackSummary.tsx；修改 campaigns/route.ts、subscription-campaigns/page.tsx、CampaignWorkspace.tsx；新增客户端单测与真实 PG/API、组件测试。

**Interfaces:** readCampaignFeedbackSummary(p,actor,{campaignKey,revision}) 返回 snapshot、total、counts{delivered,hardBounce,complaint,providerSuppressed,suppressed}、asOf；API action read-feedback-summary-local 返回 feedbackSummary；loadCampaignFeedbackSummary 只发送当前 key/revision。

- [ ] 先测试服务存在与固定真实 PG 预期、客户端畸形/错误保留旧数据，运行确认 RED。
- [ ] 最小 SQL：原冻结名单、邮件回执经 attempt→slot→job 归属，按邮箱摘要/种类去重；全局拒发仅作独立计数。读取不触及订阅人群查询。
- [ ] 接入现有同源 API、页面与独立刷新组件；测试零/重叠/跨活动/全局、无冻结/旧版/损坏归属、撤权/停职/他人/非local，并比较全表指纹。
- [ ] 实际组件桌面/390宽度与刷新失败检查；完整 npm run check 和 npm run test:subscriptions，预期全部通过。
- [ ] 更新中文小结、交接和 progress，提交，唯一末尾独立复核；重要问题一轮修正并重新验证。
- [ ] 推送并核对 origin 对应 SHA；建立/更新草稿 PR，核实精确头部 CI，不自动合并。
