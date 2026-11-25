# H 本地回执收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

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

- [x] 补不存在日期/闰日/偏移/24点用例，运行日期测试，确认无效日期先 RED。
- [x] 添加严格时间组成检查，再运行协议/路由用例，预期全通过。
- [x] 用实际 Next 分发表替换适配器 GET 证据；PG 分别构造绑定非空、签名反馈、空 attempt 反馈及 provider-suppressed 拒发，BEGIN→down 拒绝→ROLLBACK，指纹不变。
- [x] 运行聚焦真实 PG/HTTP 测试，预期 PASS；提交。

### Task 2: 独立只读汇总与交付

**Files:** 新 src/server/subscription-campaign-feedback-summary.ts、src/lib/subscription-campaign-feedback-summary-client.ts、src/components/subscriptions/CampaignFeedbackSummary.tsx；修改 campaigns/route.ts、subscription-campaigns/page.tsx、CampaignWorkspace.tsx；新增客户端单测与真实 PG/API、组件测试。

**Interfaces:** readCampaignFeedbackSummary(p,actor,{campaignKey,revision}) 返回 snapshot、total、counts{delivered,hardBounce,complaint,providerSuppressed,suppressed}、asOf；API action read-feedback-summary-local 返回 feedbackSummary；loadCampaignFeedbackSummary 只发送当前 key/revision。

- [x] 先测试服务存在与固定真实 PG 预期、客户端畸形/错误保留旧数据，运行确认 RED。
- [x] 最小 SQL：原冻结名单、邮件回执经 attempt→slot→job 归属，按邮箱摘要/种类去重；全局拒发仅作独立计数。读取不触及订阅人群查询。
- [x] 接入现有同源 API、页面与独立刷新组件；测试零/重叠/跨活动/全局、无冻结/旧版/损坏归属、撤权/停职/他人/非local，并比较全表指纹。
- [x] 实际组件桌面/390宽度与刷新失败检查；完整 npm run check 和 npm run test:subscriptions，预期全部通过。
- [x] 更新中文小结、交接和 progress，提交，唯一末尾独立复核；重要问题一轮修正并重新验证。
- [x] 推送并核对 origin 对应 SHA；建立/更新草稿 PR，核实精确头部 CI，不自动合并。

## 实施记录与判定

- 用户已明确要求执行建议范围并沿用原生实施，本设计/计划记录具体做法，不另增加产品能力；三项轻微事项先单测561/561和真实PG独立验证后，与汇总同一实现提交，代价为较细粒度挑拣需另拆提交。
- 独立汇总仅本人数量，不提供逐人邮箱/明细；代价为个别运营调查仍需后续另定范围。既有整页mock-reset保留，代价为整页重开仍不同于独立刷新。
- 撤权测试放到worker证据后，代价为以后改夹具顺序须留意模拟确认失效；停职使旧会话失效，重新启用后的历史验收需独立登录，不放宽认证。
- 唯一末尾独立复核：0严重/2重要/2轻微。两重要项一轮修正：asOf仅接受UTC毫秒ISO往返一致值（不存在日期及"1"先RED）；有正数回执活动改版确认后真实下架政策，仍读原冻结正数回执且全表指纹不变，恢复来源后确认有效。临时注入新版送达归零变异，新增断言实测0≠1先RED，源码finally恢复后GREEN。
- 轻微延期：邮箱级回退记录同时命中多个谓词，尚无有attempt、空sourceHash的供应商邮件抑制独立谓词用例；现有四种非空情形均已覆盖，代价为该单谓词被误删的覆盖不足。
- 轻微延期：页面矩阵尚未独立断言feedbackSummary读取次数/传值；现有真实API及实际组件预览通过，代价为未来SSR漏传可能只在可视/集成验收发现。
- 范围判定：真实账号、公网投递、供应商真实重投、退订组装留真实试发前门禁，代价为本批不能证明生产就绪；既有整页mock-reset属于原页面行为，本批仅证明独立汇总不触发它，代价为整页导航仍可能重置。
- 最终完整检查/订阅集成及精确远端提交、CI结果由handoff/progress及PR119承载；无第二次独立复核，不自动合并。
