# 同一活动改版续发只读预检实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为本人当前活动提供原名单改版续发的安全只读评估与后台说明。

**Architecture:** withCampaignDraft 内共享事务和锁读取；复用资格判断，并在原确认流程增加只读检查模式。
新POST action和独立客户端刷新区域消费同一安全汇总，不改变现有跨版本执行门禁。

**Tech Stack:** Next16.4、React19、Payload3/PostgreSQL、TypeScript、Node24.22.1。

**Spec:** `docs/superpowers/specs/2026-11-24-subscription-revision-preflight.md`

## Global Constraints

- Node24.22.1，复用锁定依赖，无新依赖、环境变量、数据库迁移；业务源码增删合计≤400行，源码行≤200字符。
- 现有权限、额度、共用预算、限速、邮件优先级、重试与跨版本执行门禁保持。
- 全表只读，不开放真实发送、清除、强制重试或实际改版续发。原交接记录保留，精确CI核实，不合并。

## Review Focus

- 确认上下文改变后读取不产生mock-reset，恢复配置不能跨已持久化reset复用旧确认（任务1）。
- 取消与已尝试证据重叠优先保留历史，不把过期处理中任务当作新版候选（任务1）。
- 改版与新订阅、撤销同意并存时只用原名单且重新核实资格（任务1）。
- 旧会话、旧版请求和非法输入均不越权或触发任何副作用（任务1）。
- 刷新失败/畸形回执/未保存选择不替换旧报告、不丢编辑内容（任务2）。

### Task 1: 服务与接口

**Files:** 新增server/subscription-campaign-revision-preflight.ts；修改mock-checks及campaigns/route.ts；
tests/helpers/campaign-revision-preflight.ts、integration/subscription-campaign-status.ts。

**Interfaces:** readCampaignRevisionPreflight(p, actor, input)返回revision、snapshot、asOf、total、counts、blockers。
counts五项为attempted/cancelled/ineligible/leased/candidates，互斥且总和total。blockers使用固定枚举。

- [ ] 写真实POST预检200断言，运行随机库订阅集成。Expected: 新action当前400≠200（RED）。
- [ ] 实现共享确认只读模式、原名单分类与action read-revision-preflight-local；不调用可写状态服务。
- [ ] 扩展既有状态夹具：原10项=6历史/1取消/0失效/1领取/2候选；改版后旧确认不继承；
      新确认有效、配置/来源变化阻断且无写；失效/过期/新订阅/坏尝试证据；原角色和跨主管、旧版本、撤权/local/同源限制。
- [ ] 运行npm run test:subscriptions。Expected: 全部33组通过，读前后全表指纹相同；记录并提交服务/接口/测试。

### Task 2: 后台说明、交付与复核

**Files:** 新增lib/subscription-campaign-revision-preflight-client.ts与CampaignRevisionPreflight.tsx；
修改Workspace及page；新增客户端单元；更新中文小结、handoff、progress。

**Interfaces:** loadCampaignRevisionPreflight({campaignKey,revision})严格校验任务1回执；组件只保存成功报告。

- [ ] 先写客户端失败与回执校验测试，运行node --import tsx --test对应文件。Expected: 模块缺失RED。
- [ ] 加入服务端区域与刷新、查询时间、互斥计数和逐条阻断说明，明确候选不是可执行承诺，保留失败前状态。
- [ ] 运行npm run check和npm run test:subscriptions。Expected: 全绿且业务增删≤400。
- [ ] 官方隔离随机库生产预览：改版/阻断、成功与失败刷新、未保存选择、390视口/键盘/44像素和读前后全表指纹。
- [ ] 提交完整证据，一次新上下文只读复核；重要发现一次RED→GREEN修正，轻微记录延期；更新最终文档。
- [ ] 最终check/相关集成通过，推送、fetch核对同SHA，确认精确PR触发CI两作业成功，转ready；不合并。
