# 本地待核对任务只读明细实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。主执行自行实施，末尾一次新上下文只读复核，不分派实现。

**Goal:** 获授权主管在本人活动页只读查看待核对原因、尝试时间和安全审计。
**Architecture:** 独立分页查询复用withCampaignDraft；纯规则推导原因，安全投影审计；客户端校验并保留失败前列表。
**Tech Stack:** Node24.22.1、现有Next/React/Payload/pg，无依赖、迁移或环境变量变化。
**Spec:** [设计](../specs/2026-11-23-subscription-review-details-design.md)。用户“下一步”承接已展示范围，沿用原生执行方式。

## Global Constraints

- local/现有本人授权/事务；不修改原尝试状态，不清除或强制重试，不真实发送。
- 每页25项、每项最多20条安全审计；编号升序，原始敏感字段不返出；旧快照与截断明确提示。
- 业务增删≤400行，行≤200，lint≤445；原3100/55442及图片保留，历史文档不覆盖。

## Review Focus

1. completed/failed优先；unknown、五次、23小时、租约到期和不明原因都须真实用例。
2. 本人/主管/主题授权/当前版本/非local/跨域绕过拒绝，暂停取消和来源失效历史可读。
3. 原始审计注入敏感字段不能进入返回；每项20条边界/25项分页与超末页不丢失重复。
4. 查询与刷新全库指纹不变；时钟推导不偷偷持久化review，读取失败保留旧显示与时间。
5. 畸形响应/网络错误不替换有效列表；390视口、键盘按钮与已编辑草稿保持。

### Task 1：只读规则、分页服务与接口

**Files:** Create src/lib/subscription-campaign-review.ts、src/server/subscription-campaign-review.ts；Modify campaigns/route.ts、tests/integration/subscription-campaign-status.ts；Create tests/subscription-campaign-review.test.ts。
**Interfaces:** campaignReviewReason(task,now)返回reason|null；readCampaignReviewDetails(p,actor,input)返回snapshot/asOf/page/total/rows，row含slotId/attemptedAt/lastOutcome/reason/events/hasOlderEvents。

- [ ] 先在既有真实状态夹具请求新action，观察应200实际400的RED；纯规则测试先RED。
- [ ] 实现原因推导、严格输入、分页及安全审计投影，禁止写入；接口接入新action。
- [ ] 随机库覆盖五类原因/终态优先、权限/隐私/只读、分页与历史，完整GREEN后提交。

### Task 2：页面、刷新与交付

**Files:** Create src/lib/subscription-campaign-review-client.ts、src/components/subscriptions/CampaignReviewDetails.tsx、tests/subscription-campaign-review-client.test.ts；Modify CampaignWorkspace.tsx、subscription-campaigns/page.tsx；中文小结与handoff/progress。
**Interfaces:** loadCampaignReviewDetails(draft,page)只发送白名单；组件initial为Task1返回，failed不替换，翻页/刷新有界且无写操作。

- [ ] 客户端响应与渲染行为先RED，再实现SSR初始及独立刷新/翻页，复用现有样式。
- [ ] check、33组订阅、隔离生产桌面/390及失败保留验收，原站点仍200并清理随机库/副本。
- [ ] 一次独立只读复核，重要项RED/GREEN及完整回归，不追加复审；保留中文历史，提交推送。
- [ ] 精确远端SHA与PR触发CI成功，PR可审阅不合并；最终结果以PR实核记录为准。
