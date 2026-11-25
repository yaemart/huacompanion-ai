# 续发恢复流程提示补齐实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 明确收据找回后预检说明的同步时机，以及控制结果未知时的预检刷新顺序。

**Architecture:** 只扩充CampaignContinuation与CampaignPauseControls的现有提示文字；保留状态、请求、写锁和禁用条件。

**Tech Stack:** Node24.22.1、Next16、React、TypeScript、PostgreSQL15。

**Spec:** docs/superpowers/specs/2026-11-25-subscription-recovery-guidance-design.md

## Global Constraints

- 先完成H，再做展会日历；不开放真实发送、清除、强制重试。
- 无迁移、依赖或环境变量变化；不重置已有数据库；源码最长200字符。
- 保留权限、现有写锁和独立查询只读边界；旧交接正文保留，原始日志和截图不提交Git。
- 文案属于可逆低影响修改，不新增复述实现的测试；运行已有行为回归及完整检查。

## Review Focus

- 找回收据仍就地展示，只有明确点击才重开。
- 明确重开保持锁到卸载，不能重复写入。
- 控制结果未知仍禁止预检刷新，核实入口可用。
- 收据恢复或控制核实不自动刷新预检，也不修改未保存选择。
- 提示不承诺核实后一定可提交；其他门禁继续生效。

### Task 1: 补齐两处提示并交付

**Files:** src/components/subscriptions/{CampaignContinuation,CampaignPauseControls}.tsx；docs/subscription-recovery-guidance-summary.md、docs/{handoff,progress}.md。

- [x] 在两处现有提示中补充同步时机和操作顺序。Expected: 业务差异仅JSX/字符串，无控制流变化。
- [x] 运行已有续发UI和预检提示回归。Expected: 全部通过，找回无导航、重开持锁仍成立。
- [x] 运行npm run check与npm run test:subscriptions。Expected: 522/522、36组退出0，lint0错误/445既有警告。
- [x] 验证桌面/手机提示与禁用状态，更新中文小结和交接，独立末尾复核。Expected: 无严重/重要遗留。
- [x] 提交推送并fetch比较完整SHA，建立并更新草稿PR，核对对应CI。Expected: 远程一致、草稿未合并；最终SHA和CI实核结果见PR116。

实施记录：21项既有聚焦回归、完整check522/522和36组订阅集成均退出0；桌面/390实际组件隔离预览为模拟响应。
一次独立复核0严重/0重要/0轻微，业务代码仅两处文案，无额外裁决或延期轻微项。
