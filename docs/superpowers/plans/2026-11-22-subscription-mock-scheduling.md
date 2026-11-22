# 本地模拟任务自动选择与领取计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans；主执行自行实施，末尾一次独立只读复核，不分派实现。

**Goal:** 本人当前活动可显式开启本页自动选择并领取已占位任务，开始和结果继续手动。

**Architecture:** 新增受当前确认/冻结门禁的候选读取，返回候选编号/等待时间/服务器时间。
页面每5秒选择，随后调用既有逐任务领取；错误停止，未知只核实原任务，现有内存凭证不改存储。

**Tech Stack:** Node24.22.1、现有Next/React/Payload/PostgreSQL。

**Spec:** [设计](../specs/2026-11-22-subscription-mock-scheduling-design.md)，沿用用户本轮授权及既有B默认规则。

## Global Constraints

- 仅local，当前角色/主题授权/归属/当前版本/来源/确认/冻结/暂停取消/实时资格均检查。
- 不改1小时余额、全站北京日2000、同邮箱24小时1份、单任务5次/23小时及退避，无清除待核对。
- 同源JSON16KB与私有响应头，候选不返回邮箱/正文/凭证，领取仅原成功返回凭证。
- 无新迁移/依赖/产品环境变量；原3100/55442和图片保留，业务≤400行、每行≤200、lint警告≤445。

## Review Focus

1. 已被他页领取的任务、等待及推导待核对不能被自动流程重新开始。
2. 选择后到领取间的撤权/退订/暂停竞争仍由原领取守卫拒绝。
3. 回执丢失不得换任务重试，保留原任务和表单，全局写入锁不被自动模式绕过。
4. 关闭/离页不承诺撤销在途请求；已有凭证不自动覆盖，追加占位仍保留选择与凭证。
5. 没有候选和最早等待时间明确，不把无任务或领取当成成功尝试/真实发送。

### Task 1：候选接口与页面自动领取

**Files:** 新增src/server/subscription-campaign-scheduling.ts、src/lib/subscription-campaign-scheduling-client.ts；修改原route、CampaignTaskPlayground；新增tests/subscription-campaign-scheduling-client.test.ts、tests/integration/subscription-campaign-scheduling.ts及subscriptions.ts。

**Interfaces:** readNextCampaignMockSlot(p,actor,{campaignKey,revision})返回{slotId:number|null,nextAttemptAt:string|null,asOf:string}。
requestNextMockSlot(input)校验回执。选中后生成原TaskCommand，run复用pending和requestMockTask，不产生claim-next重选语义。

- [ ] 新增真实候选接口测试：权限、严格输入、当前冻结/资格、状态和时间筛选、只读指纹，先RED。
- [ ] 实现受原门禁候选读取并接POST；候选仅提示，原claim原样保留最终校验。
- [ ] 新增客户端回执验证、空/等待及错误测试RED，再实现客户端和自动模式。
- [ ] 完整check及30组订阅集成；浏览器开启/关闭、等待到时、已有凭证、未知回执核实、手机。
- [ ] 一次独立只读复核，重要问题一轮RED/GREEN修正，提交。

### Task 2：交付

- [ ] 中文一页小结及progress/handoff，保留全部旧记录；截图/日志本机归档说明未上传。
- [ ] 核对latestmain，推送任务分支及PR，核对精确SHA和CI，不自动合并。
