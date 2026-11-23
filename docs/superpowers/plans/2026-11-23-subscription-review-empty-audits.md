# 第二页空审计回归计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。主执行完成一个小任务，末尾一次新上下文只读复核。

**Goal:** 直接锁定第二页无审计任务的空历史和无截断标志。
**Architecture:** 只给既有真实分页夹具补逐项断言，两个受控错误证明覆盖；最终业务源码无diff。
**Tech Stack:** Node24.22.1和现有pg/Payload测试，无依赖或迁移。
**Spec:** [范围](../specs/2026-11-23-subscription-review-empty-audits-design.md)。用户已明确继续本项。

## Global Constraints

- 仅tests与docs；源码行≤200、lint≤445，原3100/55442及图片保留，不真实发送/清除/强制重试。
- 受控变体串行在随机库运行，finally逐字还原；最终src/scripts/package/锁文件/类型无diff。

## Review Focus

- 第二页确有5项，分别断言空数组和false，不能用every空集合漏检。
- 两种错误各自命中对应新断言；变体已恢复，原清理/只读检查保留。

### Task 1：补断言并交付

**Files:** tests/helpers/campaign-review-details.ts；中文小结与handoff/progress。
**Interfaces:** 服务和夹具签名保持，second.rows逐项新增两个独立断言。

- [x] 加逐项断言，保留5项数量与编号检查。
- [x] 两个错误控制分别指定RED且恢复；正常check432及33组GREEN。
- [ ] 一次只读复核，中文记录保留历史；最终推送SHA及CI实核，PR可审阅不合并。
