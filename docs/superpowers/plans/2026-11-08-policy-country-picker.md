# 政策录入 B2：国家选择与自动标识实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成政策P0第2、3条，运营搜索国家后自动填名称及标识，服务端拒绝无效国家和重复标识。

**Architecture:** 随代码打包249个ISO代码，服务器用固定Node24.22.1内置Intl.DisplayNames生成中英文选项，通过现有授权编辑接口返回；浏览器不再生成名称或调用外部国家服务。搜索框过滤原生下拉框，选择时一起更新三项国家事实；新建时按国家、类型和当前语言更新自动标识，手动值和旧记录保留。保存、恢复和发布复用同一服务端国家校验及现有事务、审核规则。

**Tech Stack:** 现有Node24.22.1/Next/React/Payload/PG15，无新依赖。

**Spec:** `docs/tasks/policy-entry-ux.md`第2、3条；`2026-11-08-master-plan.md`。

## Global Constraints

- 分支基于PR24合并后的main `6493311cd0d4970d8e5a159172b661dc3943a1e0`；上一PR合并后才开本PR。
- 业务增删合计不超过400行；lint不超过465。第4条停留单位下一PR，第1条共用事实在完整B后。
- 无新依赖、结构迁移、种子修改、清理数据、部署、购买或真实服务/worker。
- 保留现有内容标识/语言保存后不可改、已发布网址不可改的规则；标题和未发布网址可手改。
- 虚构XY/XZ/XW/XQ仅APP_ENV=local且NODE_ENV非production时可选；请求不能开启例外；trial/production/ci不允许例外。已有快照/版本不重写，旧非法国家须重选后才能新保存/发布；空国家仍可存未完成草稿。
- ISO代码来源IANA tzdb iso3166.tab（公有领域，与本机2025-07-01版本逐项核对），显示名来自Node内置CLDR。说明国家/地区标签不构成已核实出行政策。
- 相关集成仅独立演示库，先配套备份；截图本机忽略目录，真人未验与开发自测分开。

## Review Focus

1. 手改标题/标识和已有记录在换国家、类型、语言时不被覆盖；搜索文字本身不改变已选国家。
2. NODE_ENV=production即使APP_ENV=local也拒绝虚构国家；非法国家不可通过恢复历史或发布旧稿绕过。
3. 不因名称生成引入浏览器ICU差异/外部请求；249个代码完整、去重、名称非空。
4. 重复身份、重复网址及孤立政策标识均提示且不覆盖；两语言同contentKey仍合法，既有事务保障竞争创建。
5. 当前国家被搜索隐藏、旧代码不在名单、空搜索结果和手机表单仍可理解，未保存值不丢失。

### Task 1: 国家目录、自动标识与服务端边界

**Files:** 新增`src/lib/immigration-policy-entry.ts`；修改`src/server/immigration/editor.ts`、`workflow.ts`、`seed.ts`；新增单元与`tests/integration/immigration-entry.ts`。

**Interfaces:** `policyCountryOptions(allowFictional)`、`searchPolicyCountries(options,query)`；`policyTestCountriesAllowed(env)`、`assertPolicyCountry(code,allowed)`；`autoPolicyIdentity(body,previous,next,previousLocale?)`。编辑接口新增`countries`；已授权事务内保存/恢复校验合并后国家，发布再校验；种子在预览和应用前整批校验，保留CLI目标库限制。创建/改未发布网址前检查identity/routeKey及孤立policyKey重复，返回中文409。

- [ ] 新单元先RED：249代码、德/Ger/DE搜索、非法/伪造例外拒绝、生产local拒绝、4个显式假国；自动/手改/语言切换保留。
- [ ] 集成先RED：ZZ保存失败且无写入，严格环境XY保存/历史恢复/发布失败，DE正常保存；重复身份/网址及孤立标识拒绝且旧记录/历史不变。
- [ ] 实现上述接口和服务器接入，运行新单元、相关集成、编辑和审核工作流回归至GREEN。

### Task 2: 搜索选择和高级输入

**Files:** 新增`src/components/content/PolicyCountryField.tsx`；修改`PolicyFields.tsx`、`PolicyWorkbench.tsx`；渲染集成及交接、指南和一页小结。

**Interfaces:** 国家组件接收`PolicyForm/countries/onChange`；搜索框+原生下拉，选择填code/nameEn/nameZh，保留未选中的旧值。高级折叠区包裹标题/内容标识/网址/语言；只新建联动自动值，手改值不重置。

- [ ] 渲染测试先RED：搜索/下拉、当前已选值、无效旧码提示、禁用、无外部资源、默认折叠。
- [ ] 实现并验证，不修改现有权限及审核；重复保存错误在工作台显示。
- [ ] `npm run check`、新渲染及授权/审核相关集成GREEN；浏览器1440/390搜索德/Ger/DE、名称/标识自动、手改保留、重复拒绝、旧XY正常读取。
- [ ] 记录范围、实际验证和新人未验；全分支一次独立复核、提交推送草稿PR、核对远端，不自动合并。
