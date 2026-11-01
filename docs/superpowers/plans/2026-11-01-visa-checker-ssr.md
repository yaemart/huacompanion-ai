# 入境工具 SSR 与无 JavaScript 表格 1.3a Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans，当前会话逐项实现，TDD及最后一次独立整轮复核。

**Goal:** 中英文工具路径在显式启用时输出完整正式政策表，无JS仍可阅读，关闭时404。

**Architecture:** 新增具体App Router页面，复用现有页眉/公开语言配置及listPublicPolicies；服务端表格模型复用1.2查询生成时长/警示。表格展示全部正式记录及有效期，以中国日历日标注当前日期范围状态，不把它当旅客资格判断。使用现有样式、独立小型表格CSS；无客户端查询输入、搜索收录或新服务。

**Tech Stack:** Node24.22.1、现有Next16.4.3/React19/Payload3.92/PostgreSQL15，无新依赖。

**Spec:** docs/traffic-entry-task.md 1.3；docs/traffic-entry-phase1-plan.md 1.3a及公开页面边界。

## Global Constraints

- 仅本地开发。VISA_CHECKER_ENABLED=false默认关闭；B前不公开、不购买、不部署、不接统计。
- 独立草稿PR依赖PR11，业务代码<=400行（测试另计）；无新any，源码行<=200。
- 仅en/zh具体路由；关闭/其他语言404且无工具导航、sitemap或llms条目。
- 只读正式快照，不泄露草稿/员工/内部备注；有效期不猜延期、空截止不代表永久、过境240小时不转日历天。
- 实际.env及数据库结构不变。DB夹具期间停worker、清理恢复，build与check串行且停dev构建。
- 保留现有视觉；桌面/手机实际截图。Lighthouse及FAQ完整验收留1.3c，不拿开发分数代替。

## Review Focus

- feature关闭或7语配置时，两个具体工具路径仍只允许en/zh，不因catch-all或元数据查询泄露政策。
- 无JS、长条件/来源、多个同国政策与>200条正式记录均完整；页面不横向溢出，表格区域可键盘滚动。
- 过期/未来/空截止不得冒充当前无条件适用；时长/警示与1.2一致，所有行有来源和核实日期。
- 恶意正文/链接、误传私有对象、缺少或损坏数据：文本转义、数据拒绝、空态不编造事实。
- 发布→改稿→下架后SSR立即反映正式状态，初始HTML不含工作稿/员工字段；trial始终noindex。

### Task 1: 表格模型与静态渲染

**Files:** src/lib/immigration-policy-table.ts；src/lib/immigration-policy-page-copy.ts；src/components/immigration/PolicyTable.tsx；tests/immigration-policy-table.test.ts；tests/integration/immigration-table-render.tsx；src/lib/immigration-policy-query.ts（仅导出既有排序）。

**Interfaces:** buildPolicyTable(policies:readonly unknown[], verifiedOnOrBefore:string)返回PolicyTableRow[]（policy:PolicyQueryMatch,dateStatus:within-dates/upcoming/unconfirmed）。用单条政策生效日查询复用时长与警示，日期基准仍显式；国家按ISO代码排序并展示本地名称、同国使用既有comparePublicPolicies。PolicyTable({rows,locale})完整SSR，无分页/JS/网络/输入。

- [ ] 写RED测试：全部日期状态/截止当天、国家排序/同国优先、小时与空截止、私有/损坏排除、201条完整及输入不变。
- [ ] 实现模型/结构化中英文copy和语义表格；导出既有排序不改行为；纯测试及原query回归通过。
- [ ] renderToStaticMarkup验证表头/caption/行数、来源/日期/条件、恶意文本转义、空态及无脚本/表单；纯套件通过。

### Task 2: App Router 与真实 HTTP

**Files:** src/app/(frontend)/[locale]/tools/china-visa-free-checker/page.tsx；src/components/immigration/policy-table.css；tests/integration/immigration-page-http.ts；package.json；.github/workflows/ci.yml（静态表格测试）。

**Interfaces:** 具体页面params为Promise，页面与generateMetadata同一flag/en-zh/site-locale门禁，门禁在政策读取前。force-dynamic、正式投影与中国日期；复用Header，提供无JS中英链接及既有指南/咨询入口。强制noindex直到后续搜索/发布步骤。

- [ ] 默认关闭态HTTP红/绿：en/zh404且无工具入口；开启本机临时进程后空态/两语/其他五语拒绝/noindex断言。
- [ ] 真实虚构工作流HTTP：草稿和待审不显示，发布后初始HTML有来源/核实日期/时长/警示，新草稿隔离，下架消失，私有标记不出现；finally清理夹具。
- [ ] 生产build及check通过；生产本地HTTP开关矩阵；无JS桌面/手机截图，表格可读且body无溢出。原trial HTTP回归，恢复默认进程。

### Task 3: 复核与交接

**Files:** README.md、docs/progress.md、handoff.md、feature-inventory.md、immigration-policies.md、traffic-entry-phase1-plan.md及截图。

- [ ] 一次独立只读整轮复核，重要问题一轮RED→GREEN，记录裁定。
- [ ] check、行长/any及夹具/原稿116/关闭flag核实；记录实测和限制，更新交接。
- [ ] 独立提交/推送草稿PR、关联、完整SHA远端核对和本head CI实际结果。下一步1.3b浏览器查询，不自动合并/部署。
