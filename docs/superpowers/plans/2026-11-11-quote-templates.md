# 报价模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** 授权运营按咨询类别使用文字模板，并以北京时间处理报价有效期。

**Architecture:** 独立 Payload Global 存储模板，已有业务详情鉴权后投影三项文字。报价原路径保存复制的文字和 UTC 截止时刻。

**Tech Stack:** Payload、Next.js、TypeScript、PostgreSQL 15、Node 24.22.1。

**Spec:** docs/superpowers/specs/2026-11-11-quote-templates-design.md

## Global Constraints

- 无新依赖、环境键、外部调用、历史改写或实际发送；任务 F 的权限、流程和主体规则保持原样。
- 源码≤200字符，变更≤400业务行，lint 不超过465。提交前全量 check 和相关隔离集成。
- 仅一份报价模板 PR；用户合并后才从最新 main 开内容中心 P1。

## Review Focus

- 跨记录／普通员工不能读原始设置或不匹配模板；停用数据也不能被投影。
- 已输入文字不被覆盖，清空字段可重填；模板配置改动不影响已有报价。
- UTC 与带显式偏移的旧值保持时间点；中国日期跨日、非法日和过期边界稳定。
- 空库增量能迁移，已保存模板时回退拒绝；原表和演示数据保留。

### Task 1: 设置、报价填入与时区

- [x] 先写 `tests/quote-templates.test.ts`：`quoteTemplates` 校验／筛选、`fillQuoteTerms` 保留已有文字、`quoteTime` 和 `quoteLocalTime` 跨时区。
- [x] 写 `tests/integration/quote-templates.ts`：原始设置 ACL、重复／非法类别、服务单范围、禁用过滤、保存文本快照和金额边界。
- [x] 运行失败测试；实现 `src/lib/quote-templates.ts`、`src/lib/quote-time.ts` 及原 `validateQuote` 对中国时间的转换。
- [x] `src/cms/business/quote-templates.ts` 注册管理设置；`src/server/business/service.ts` 在已鉴权的详情读取启用模板；增量迁移、生成类型和演示守卫。
- [x] `BusinessDesk` 选择并显式填空，人工／AI 表单和客户报价日期走统一时间助手，不改预约时间。
- [x] CI 注册集成。跑隔离迁移、完整 check、业务／AI／客户回归、浏览器验收；记证据、独立复核并完成修复。
- [ ] 推送草稿 PR，实核截图与精确 HEAD CI，结果记入 PR 和交接。
