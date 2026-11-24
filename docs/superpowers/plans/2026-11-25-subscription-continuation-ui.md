# 同活动本地续发后台入口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台可明确确认并提交本版续发，安全核实未知结果，重开后沿用现有准备和演练。

**Architecture:** 同源两动作复用原续发和只读审计收据；严格客户端DTO，独立面板及全局互锁；原冻结版本不改。

**Tech Stack:** Node24.22.1、Next16/Payload3、React、PostgreSQL15，原依赖。

**Spec:** docs/superpowers/specs/2026-11-25-subscription-continuation-ui.md

## Global Constraints

- local/本人现职授权/当前版/新确认/来源/活动控制及原额度预算限速优先重试保持；不发真实邮件、不清除/强重试。
- 无迁移、依赖、环境变量/.env修改；原演示库不升级，隔离随机库验证。
- 业务增删≤400，源码≤200，lint≤445既有警告；旧交接逐字保留，原始证据不Git，用户决定合并。

## Review Focus

- 伪造确认字段、越权/撤权、旧版输入、来源/设置失效均不能绑定（任务1）。
- 安全收据严格对应当前活动和版本；畸形或额外私有字段不能解锁（任务1/2）。
- 响应丢失后只读核实，不自动再次续发，不丢选择，不误把历史收据当执行授权（任务2）。
- 原快照与本版绑定分开，重开后新版未占位项可准备、旧已尝试记录不领取（任务1/2）。
- 未保存、暂停取消和各操作忙碌/未知相互阻断，键盘提交同样受控（任务2）。

### Task 1: 收据接口与严格客户端

**Files:** 新增server/subscription-campaign-continuation-read.ts、lib/subscription-campaign-continuation-client.ts；修改api/subscriptions/campaigns/route.ts；新增tests/subscription-campaign-continuation-client.test.ts及integration/subscription-campaign-continuation-ui.ts。

**Interfaces:** readCampaignContinuation(p,actor,input)→Receipt|null；continuationRequest(draft,readOnly)→Receipt|null；Receipt沿用PR113安全字段。

- [ ] 单元测试先缺模块RED，再实现请求/严格DTO/不确定错误，拒绝4xx、503和未知类型、串活动版本、越界时间和私有字段；Expected:全部通过。
- [ ] 真实POST写动作先400≠200 RED；实现显式确认及只读查询，权限、同源/类型/体积、local、重放/并发、读取全表指纹不变、确认/来源/暂停取消门禁集成；Expected:聚焦通过。
- [ ] 完整check463基线加新增客户端用例、相关随机库聚焦后提交；任务完成命令npm run check。

### Task 2: 后台互锁与验收交付

**Files:** 新增components/subscriptions/CampaignContinuation.tsx；修改CampaignWorkspace、CampaignRevisionPreflight、CampaignMockChecks、CampaignPreparation及page.tsx和quota/scheduling/freeze旧文案。中文summary/handoff/progress。

**Interfaces:** 面板接收draft/receipt/eligible/disabled和onBusy/onUncertain，提交成功重开；工作台用receipt作为绑定事实并继续检查原资格。

- [ ] SSR门禁/新版续发区及恢复行为先RED；实现复用布局、显式确认、ref去重、确定/未知失败及只读核实；Expected:界面/集成通过。
- [ ] 隔离生产副本桌面与390视口真实操作：缺确认禁用、已确认提交、重开占位与领取、畸形/丢失响应只读核实、未保存与Enter保护，截图本机忽略；Expected:无控制台错误/横溢出，不动原站。
- [ ] 完整check及npm run test:subscriptions保留原34组新增第35组；Expected:全部通过；记录实际结果和迁移原库限制。
- [ ] 一次末尾新上下文只读复核，重要项一次RED→GREEN与全套复验，轻微记延期；最终提交推送fetch同SHA，精确CI两作业成功，ready不合并。
