# 服务商标准多选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. Steps use checkbox syntax.

**Goal:** 服务商后台用标准多选整理语言与区域，保留无法识别的旧值。

**Architecture:** 纯解析模块供真实字段组件使用，保持原文本列和既有保存／权限链。

**Tech Stack:** Node24.22.1、Payload3、Next16、React19、PostgreSQL15，无新依赖。

**Spec:** docs/superpowers/specs/2026-11-10-provider-standard-fields-design.md

## Global Constraints

- 从已合并PR41的最新main建分支；本PR合并后再做主管审核。
- 原权限／公开申请／数据／历史保留，不reset，不启动真实服务或worker。
- check通过；lint≤465；源码≤200；业务改动≤400。

## Review Focus

- 未识别语言或地区不能静默丢失、不能误认或假核实。
- 原字段未编辑时不得自动写回或误标dirty。
- 多个实例和窄屏字段无重复id、可用键盘操作。
- 空选保存应有明确字段提示，不丢其他资料。
- 运营保存不能借机改合作状态、公开展示或跨团队数据。

### Task 1: 字段、实际配置与验收

**Files:** 新增src/lib/provider-options.ts、src/cms/ProviderOptions.tsx、
src/cms/ProviderOptionsPanel.tsx；修改src/cms/intake-editor.ts和生成importMap。
测试tests/provider-options.test.ts、tests/integration/provider-options-render.tsx、
tests/integration/provider-options.ts。更新CI、指南、progress、handoff、一页小结。

**Interfaces:** providerOptions(kind,value)返回selected、unresolved；
providerOptionValue(kind,selected,unresolved)输出中文逗号分隔文本。
ProviderOptions为Payload TextFieldClientComponent，原path／useField保持表单保存语义。

- [x] 写纯解析／序列化和真实SSR测试；运行确认缺功能RED。
- [x] 最小实现解析／保留旧值／可访问复选组，再运行GREEN。
- [x] 在providers独有字段配置接入，不改变inquiries的city或公开申请契约。
- [x] 隔离库运行原范围及保存重读测试，生产构建并浏览器实际操作。
- [x] 运行npm run check，记录实际输出，提交推送草稿PR。
- [x] 一次独立全分支复核，无阻断问题；同path双实例辅助ID的Minor列为后续。
- [x] 本地交接自检、配套备份、隔离验收清理及五图PR附件实核；精确HEAD的CI和远端由PR42最终交接核对，不预填成功。
