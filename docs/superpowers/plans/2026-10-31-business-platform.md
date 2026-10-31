# Business platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or scoped parallel implementation. Track completion with evidence.

**Goal:** Complete approved five-batch business flow, tasks/notifications, content quality, customer portal and trial-readiness locally.
**Architecture:** Existing Payload collections plus private business records, same-origin APIs and scoped staff/customer views. Transactions protect quote versions, confirmations and delivery; workers handle durable queues.
**Tech Stack:** Installed Next.js 16/Payload 3/PostgreSQL/TypeScript.
**Spec:** docs/superpowers/specs/2026-10-31-business-platform.md

## Global Constraints
- Retain all prior uncommitted support work; no real external sends/payments/deployment.
- Shared registration/types/migrations only root; DB integration tests serial.
- Seven client locales, staff Chinese, default deny, reuse existing access.

## Review Focus
- Stale quote accepted concurrently with replacement: reject or one serialized result.
- Revoked staff/client associations immediately remove read/write access.
- Email timeout after provider success: dedupe delivery, no false sent.
- Translation needing review must not silently change public snapshots.
- Customer email authentication must not merge unverified historical email matches.

### 1 Business flow (root)
Files: src/cms/business/collections.ts, src/server/business/service.ts, src/lib/business.ts, src/components/business/BusinessDesk.tsx, api/business routes, tests/business.test.ts, tests/integration/business.ts.
Interfaces: businessCollections; businessRead(p,user,id?), businessAction(p,user,input); customerBusinessRead(p,customer), confirmQuote(p,customer,input).
- [x] RED tests for transitions, currency integer totals, public field whitelist and stale versions.
- [x] Implement private service cases/quote snapshots/audit, scoped workflow and AI draft boundaries (no fabricated adapter output).
- [x] Implement desk and customer confirmation contract; connect inquiry links.
- [x] GREEN unit/real DB tests.

### 2 Notifications/tasks (scoped agent)
Files: cms/workflow, server/workflow, components/workflow, api/workflow, scripts/workflow-worker.ts, tests workflow.
Interfaces: workflowCollections, workflowSettings; enqueueWorkflowEvent(p,event,req?), runWorkflowJobs(p); safe public methods documented by implementer.
- [x] Tests for scope, dedupe, retries, delay reasons and unavailable email.
- [x] Implement tasks/alerts, bounded real HTTPS mail adapter, inbox/worklists, event integration contract.
- [x] Test and document external configuration.

### 3 Content quality (scoped agent)
Files: cms/quality, server/quality, components/quality, api/quality, tests quality.
Interfaces: qualityCollections; contentQualityHook on content-drafts; runQualityReview(p).
- [x] Tests for content scope, revision/translation staleness and no automatic publication.
- [x] Implement per-content owner/check dates/source quality, overview/review tasks and frontend-safe metadata helpers.
- [x] Test and document.

### 4 Customer identity (scoped agent)
Files: cms/customer, server/customer, components/customer, api/customer, localized account page, tests customer.
Interfaces: customerCollections/customerSettings; customerSession(p,headers), email delivery via mail adapter; staff explicit record linking.
- [x] Tests for email verification token expiry/replay, sessions, enumeration and association isolation.
- [x] Implement verified identities + safe portal shell integrating root business read/confirm and customer linked records.
- [x] Test and document.

### 5 Integration, deployment readiness (root)
- [x] Register collections/globals, menus and routes, event hooks, seven-language links.
- [x] Backup first; generate types/additive migration, run isolated migration and serial integration.
- [x] Run regression/tests/build/HTTP/browser review; fresh independent code review and fixes.
- [x] Update README/status/runbook, local processes and exact external blockers; no pretend Replit deployment.

## 验收记录（2026-10-31）

- 单元测试：110/110；类型检查和生产构建通过。
- 实际数据库：business、workflow、quality、customer、content、support、support:voice、support:calls、support:operations:db 通过，均串行运行；邮件与网关测试不调用真实外部服务。
- workflow-customer 测试通过：新报价关闭旧待办、客户通知关联撤销、通知归属校验。
- 空库迁移通过；此前备份恢复演练备份为 `backups/local-1793417422602.dump`。
- HTTP：后台基础 8 项、七语言及公开路由 172 项、内容发布/图片访问隔离通过。
- 独立业务审查发现的未发出撤回草稿泄露、旧权限关联操作、旧安排展示问题已修复；报价替换后安排隐藏有数据库回归断言。
- 浏览器实查客户中心正确显示“邮件验证尚未启用，请联系华伴”。
- 修正旧路由测试对未发布固定示例的错误假设，改测固定入口和真实 sitemap；内容 HTTP 测试补充现行审核规则要求的例外原因。

### 范围决定与限制

本次业务 AI 边界沿用人工审核，不新增未接真实供应商的报价生成器。客服和内容 AI 仍需供应商配置与真实调用验收。客户中心代码与隔离测试完成，但默认关闭，运营启用前需实际邮件验证。第五批完成的是本地联调与部署准备，不包含真实 Replit/AWS 部署；试运行环境、域名、持久化图片存储和外部服务配置仍待落实。详见 `docs/trial-deployment.md`。

数据库测试中的 pg 并发查询弃用提示不影响当前测试结果，后续升级 pg 主版本前应整理测试清理流程。未将本次改动自动合并或提交，保留原有未提交客服工作。

后续补齐（2026-10-31）：业务 AI 服务方案与报价草稿进入本地实现，含强制主管审核、退回修订重审与默认关闭的兼容网关；原“未新增报价生成器”记录为此前阶段状态。当前验收见 `2026-10-31-business-ai.md`。
