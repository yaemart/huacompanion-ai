# 展会分期与到访资料 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原展会内容中增加结构化分期及四项到访资料，保留旧快照和原发布/咨询边界。

**Architecture:** 扩展Exhibition可选JSON字段，通过现有校验、白名单投影、内容版本流程传递；独立分期编辑组件与详情展示复用既有表单和七语言文案。

**Tech Stack:** Node24.22.1、Next/React安装锁定版本、Payload、PostgreSQL15、TypeScript。

**Spec:** docs/superpowers/specs/2026-11-26-exhibition-visitor-details-design.md（用户已接受方案2并明确授权原生实施及交付，无新增待决定产品范围）。

## Global Constraints

- 最多12期、name200字符、theme2000字符、transport/buyerRegistration/stayAreas/firstVisitTips各5000字符。
- 旧字段缺省仍可读、编辑、重新发布；不后台补写旧记录；已新增分期发布需非空name/theme，日期同时空或完整有效，已知总体日期下须在总体区间内，允许重叠，保留录入顺序。
- 分期只展示，不改变总体日期、筛选、JSON-LD、状态、咨询身份或提醒；不新增依赖、集合、迁移、环境变量。
- 现有编辑/管理员审核、来源匹配、人工核验、修订冲突/审计与公开读边界不变；七语言不串内容。
- 不升级/reset原演示库；只用独立虚构随机库。业务源码增删≤400行为目标；.ics、下一届、订阅及提醒后续分批。
- 最终完整check、相关展会/内容集成、实际组件与桌面/390验收，更新交接/小结，推送核对SHA、草稿PR、不自动合并。

## Review Focus

- 旧JSON直接加载不出现undefined控件或发布失败：任务1固定不含新键的旧样本，任务2实际旧表单/详情。
- 改总体日期后分期越界以及待公布整体无日期：任务1日期组合和完整发布校验，任务2保存/显示。
- 深层额外字段或伪HTML不能公开泄漏/执行：任务1嵌套白名单和非别名复制，任务2真实页面/API转义。
- 未经核验的新版不能覆盖旧公开快照，旧修订不能保存：任务2真实PG内容版本/发布/撤下及API。
- 添加/删除分期和到访字段后原核验复选框必须失效且输入保留：任务2实际ContentCenter编辑流、失败/冲突场景。

### Task 1: 数据契约与旧内容兼容

**Files:** 修改src/lib/exhibitions.ts；新src/lib/exhibition-visitor-details.ts（如需独立校验/投影）；新tests/exhibition-visitor-details.test.ts。

**Interfaces:** 导出ExhibitionPhase={name,startDate,endDate,theme:string}；Exhibition新增可选phases、transport、buyerRegistration、stayAreas、firstVisitTips。emptyExhibition提供空值；validateExhibition(e,publishing)调用同一新增校验；publicExhibition(e)白名单深复制。

- [ ] 写旧样本省略所有新键、公开保留新字段、未知深层属性剔除、克隆不别名的用例；新能力断言先RED。
- [ ] 写12/13期、格式/长度边界、草稿空行/发布拒绝、严格闰日/非法/反序/单边日期、未知总体日期与越界/重叠/输入顺序；Run: node --experimental-strip-types --test tests/exhibition-visitor-details.test.ts；Expected: 新字段校验/投影用例FAIL。
- [ ] 最小实现数据类型、默认值、校验和白名单；不改变原总体日期/状态或源审核；Run相同单测；Expected: 全PASS。
- [ ] Run: npm test；Expected: 全PASS；提交该任务并记录实际计数。

### Task 2: 编辑、公开详情与真实流程交付

**Files:** 新src/components/content/ExhibitionPhaseFields.tsx；修改ExhibitionFields.tsx、ContentCenter.tsx审核提示、content-field-examples-copy.ts、exhibition-copy.ts、ExhibitionPage.tsx及必要样式；扩展tests/integration/exhibitions.ts、exhibitions-http.ts、exhibition-filters-render.tsx（或独立可复用渲染用例）；新增测试接入CI必要入口；交接/小结。

**Interfaces:** ExhibitionPhaseFields接收value:ExhibitionPhase[]、onChange、locale，经ExhibitionFields→ContentCenter现有updateBody回调使dirty/人工核验失效。公众详情只显示本语言非空文本与分期，沿用既有公开API投影。

- [ ] 在真实渲染/PG夹具加完整新资料与旧记录，先断言编辑控件/详情/公开API数据；Expected: 缺新界面先FAIL。
- [ ] 最小接入分期添加删除、四项文本及虚构示例；用新英文键约束七语言标签，纯文本换行/长词换行；详情基础信息→分期→到访资料，不改筛选/JSON-LD。
- [ ] 真实独立随机库运行旧展会集成和新增编辑/发布/权限/修订/预览/撤下用例；缺核验/来源、编辑者发布及匿名写入仍拒绝；Expected: PASS、原演示库不变。
- [ ] 实际组件桌面/390验证旧资料和新增资料、添加/删除、核验失效、保存恢复与冲突输入保留；Expected: 无横向溢出及无新增console错误，不冒称真实资料验收。
- [ ] Run: npm run check 及相关展会/内容集成；Expected: 全PASS；更新handoff/progress/一页小结，建立早期草稿PR，提交推送并核对远端SHA。
- [ ] 唯一末尾独立整批复核；重要项一轮RED→GREEN修正并复测，轻微项记明；最终核实精确头CI，PR保持草稿、不合并。
