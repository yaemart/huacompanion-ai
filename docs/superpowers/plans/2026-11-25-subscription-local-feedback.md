# 本地回执与营销拒发实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只在local记录管理员模拟反馈，硬退信/投诉跨活动拒发，重复与乱序不改变历史。

**Architecture:** 两个私有集合保存反馈与邮箱摘要拒发；内容→业务→邮箱锁中校验原任务并原子写审计。campaignAudience统一排除拒发，复用原执行守卫。

**Tech Stack:** Node24.22.1、Payload3、PostgreSQL15、TypeScript。

**Spec:** docs/superpowers/specs/2026-11-25-subscription-local-feedback-design.md

## Global Constraints

- 先H后展会日历，仅local与example.invalid；不新增HTTP/UI/外部服务、依赖或产品环境变量。
- 无清除、恢复或强制重试；不改变同意、任务正文、额度/尝试历史和旧单封邮件规则。
- 业务源码增删≤400行；源码最长200字符。迁移只用独立随机库，不升级或reset既有演示。
- 已接受设计，沿用原生执行；最终一次独立复核，提交推送草稿PR，不自动合并。

## Review Focus

- 反馈带原邮箱，摘要须匹配原任务；当前订阅改邮箱后仍只能抑制原邮箱。
- 同事件ID改目标、类型或时间必须409，不能被去重静默吞掉。
- 管理员实时停职或降权、非local、非虚构地址拒绝且不写记录。
- 反馈与开始尝试按既有内容→业务→邮箱锁串行，已开始证据不能被改写，后续尝试拒绝。
- 旧活动只读预检排除拒发但不取消任务；重订、新活动及续发不复活拒发。

### Task 1: 原子反馈、持久拒发及资格接线

**Files:** src/cms/subscriptions/collections.ts、src/server/subscription-campaign-{feedback,audience}.ts、新迁移20261125_120000_subscription_campaign_feedback.ts及index、payload-types.ts；tests/integration/subscription-campaign-feedback.ts及subscriptions.ts；中文summary/handoff/progress。

**Interfaces:** recordLocalCampaignFeedback(p,actor,input:unknown)返回{eventId,kind,replayed}；input为{eventId(UUID),attemptId(正整数),email,kind(delivered|hard-bounce|complaint),occurredAt(标准ISO)}。拒发按规范化邮箱sha256唯一，记录首条拒发，后续事件保留但不清除。

- [ ] 集成用例先动态加载服务并断言存在，再验证合法反馈、重复/冲突、乱序、实时权限、local/邮箱/原任务及时间校验。Expected: 缺少服务断言RED。
- [ ] 创建私有集合及迁移/生成类型，实现事务守卫、事件幂等与拒发，接入campaignAudience批量读取。Expected: 聚焦真实PG用例GREEN。
- [ ] 验证全表只读指纹、审计失败回滚、并发事件和开始尝试、重订/新活动/续发拒发、旧单封表与历史不变及迁移回退保护。Expected: 新组与既有36组退出0。
- [ ] npm run check、相关迁移与完整订阅集成，更新一页小结和交接并独立复核。Expected: 全部通过，警告≤445，无严重/重要遗留。
- [ ] 提交推送并fetch核对SHA，草稿PR记录精确CI及剩余H边界，不自动合并。
