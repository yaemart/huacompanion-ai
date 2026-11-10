# 服务商主管审核 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, checkbox tracking.

**Goal:** 主管在原范围用明确按钮、有原因、可审计地审核服务商。

**Architecture:** 纯输入校验、服务器事务命令及防绕过hook、Payload虚拟UI字段；沿用原表和版本。

**Tech Stack:** Node24.22.1、Next16、Payload3、PostgreSQL15，无新依赖。

**Spec:** docs/superpowers/specs/2026-11-10-provider-review-design.md

## Global Constraints

- 已批准主管审核授权，除本项不扩权；同团队数据范围，运营拒绝，不自动公开。
- 原数据、列和种子保留；暂停撤销公开许可，恢复核实不自动上架。
- 目录锁726271先于业务锁726281；当前员工／范围锁内重读。
- check通过，lint≤465，源码≤200，业务≤400，独立PR，不部署／自动合并。

## Review Focus

- 排队时撤权／转交／转团队不能用旧JWT／员工对象越权。
- 网络失败的同键重试不重复审核，同键改原因拒绝，过期资料不能批准。
- 暂停后恢复核实不能让主管重新公开；家政及指定项目原保护不被绕过。
- 审核后继续保存资料不误报本人冲突，未提交跟进保留；他人修改仍冲突。
- 普通API和伪造context不能绕开原因审计；审计失败不得已改状态。

### Task 1: 服务商受控审核、原回归与交接

**Files:** src/lib/provider-review.ts；src/server/provider-review.ts；src/cms/provider-review.ts；
src/cms/ProviderReview.tsx／ProviderReviewPanel.tsx；api/provider-review/route.ts；collections／intake-editor及importMap。
测试纯、SSR、DB和HTTP；旧catalog／catalog-http／housekeeping夹具用真实命令。

**Interfaces:** providerReviewInput(unknown)返回id、status、reason、key、updatedAt；
reviewProvider(Payload,Staff,unknown)返回status、publicApproved、updatedAt、duplicate；
guardProviderReview只认服务端Symbol，普通status update只读。

- [ ] 输入和Panel、helpID双实例测试先RED，再实现GREEN。
- [ ] 隔离库写真实允许／越权／审计回滚／并发／排队转交测试先RED，最小事务与hook实现GREEN。
- [ ] 接入专用API和Payload面板；旧夹具走真实命令；map及生产build通过。
- [ ] 真实HTTP、主管和运营桌面／手机操作，保存基准／跟进保留／他人冲突验收。
- [ ] check、相关集成通过，推送草稿PR；一次独立复核，阻断修复RED→GREEN。
- [ ] 配套备份、普通重启、指南／一页小结／交接，截图、最终HEAD CI及远端实核。
