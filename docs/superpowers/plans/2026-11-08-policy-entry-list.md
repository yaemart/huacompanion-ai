# 政策录入 B1：核实默认值与列表实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 完成政策 P0 第 5、6 条，使运营能直接看到、筛选、排序政策，并减少新建时重复填写。

**Architecture:** 在已授权政策工作稿范围内批量读取关联事实，返回最小列表字段；浏览器使用纯函数筛选和排序。只在读取新建表单时由服务器设置当前用户和中国日期，已有记录不补写。沿用当前事务、权限、引用校验和审核流程。

**Tech Stack:** Node 24.22.1、现有 Next/React、Payload、PostgreSQL 15；不增加依赖。

**Spec:** `docs/tasks/policy-entry-ux.md` 第 5、6 条及 `docs/tasks/2026-11-08-master-plan.md`。

## Global Constraints

- 一个待合并 PR；业务代码新增及删除合计不超过 400 行，超出则继续拆分。
- lint 警告不超过已验证基线 465；提交前通过 `npm run check` 和相关集成测试。
- 审核、禁止自审、管理员例外写原因、板块授权及已发布快照不变。
- 不清空演示数据、不变更数据库结构；原 3000/55438 环境不用于写入测试。
- 不新增依赖、部署、邮件、AI、语音、通话或 worker。
- 本 PR 不实现第 2–4 条，也不提前实现共用事实；B 尚未全部完成。
- 截图留在忽略目录，真人验收与开发自测分开记录。

## Review Focus

1. 旧记录的核实人或核实日为空时，也必须原样保留；不得在打开时改成当前人和今天。
2. 已失效、越板块或未登录账号不能通过新列表获得政策资料；列表不返回事实内部备注。
3. 引用不匹配时列表不显示另一份政策资料；选中编辑继续沿用严格引用校验。
4. 30 天筛选含中国日期的今天和第 30 天，不含已过期、无截止日或非法日期。
5. 日期空值双向排序均在最后；相同值排序稳定；390px 页面不能被表格撑宽。

### Task 1: 默认值、列表投影和排序筛选

**Files:** 新增 `src/lib/immigration-policy-list.ts`、`tests/immigration-policy-list.test.ts`；修改 `src/server/immigration/editor.ts`、`tests/integration/immigration-editor.ts`、`tests/integration/immigration-editor-http.ts`。

**Interfaces:** `policyListRow(draft, record?)` 返回只含 id/title/locale/country/policyType/reviewState/validUntil/lastVerifiedOn 的行；`filterPolicyRows(rows, filter, today)` 和 `sortPolicyRows(rows, key, direction)` 均不修改输入；`policyVerificationDefaults(userId, now)` 返回核实人和中国日期。API 增加 `policyRows`、`today`。

- [x] 写测试：时区跨日、新建默认值可改、已有空值不补；五列双向排序、空值最后、同值按 id 稳定；三种筛选和今天/第30/31天边界；引用不匹配不投影、内部字段不泄漏。
- [x] 运行 `node --experimental-strip-types --test tests/immigration-policy-list.test.ts`，预期新增函数缺失导致失败；集成新增断言先失败。
- [x] 实现纯函数及授权事务内批量关联，避免每条一查询，不变更写入或发布逻辑。
- [x] 同一单测及演示库内 `npm run test:policies:editor`、HTTP 集成通过。确认匿名/越权拒绝和旧字段原样保留。

### Task 2: 可操作的表格及交付

**Files:** 新增 `src/components/content/PolicyList.tsx`；修改 `PolicyWorkbench.tsx`、`content-center.css`；更新 `docs/progress.md`、`docs/handoff.md`、`docs/local-testing-guide.md`，新增一页 B1 小结。

**Interfaces:** `PolicyList({rows, today, selectedId, disabled, onSelect})` 消费 Task 1 API；表头按钮切换升降序，筛选框提供全部/待审核/已退回/30天内到期。

- [x] 增加服务端渲染断言验证五列表头、排序语义、筛选、空列表和选中标记；先失败，再实现组件和替换工作台左侧列表。
- [x] 宽屏并排，窄屏纵向；表格容器可键盘聚焦、独立横向滚动，点击记录沿用现有未保存/忙碌禁用规则。
- [x] `npm run check`、渲染测试和编辑工作流/HTTP 集成通过；演示浏览器检查默认值、已有记录、排序、筛选和390px滚动，保存桌面/手机截图。
- [x] 记录实际验证、真人未验、剩余B第2–4条及不需要重置数据；一次全分支独立复核后提交、推送、建立PR并核对远端提交，不自动合并。
