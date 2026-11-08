# 公开网站统一页脚实施计划（D2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所有有效公开语言页面使用一个完整页脚，不显示技术资料链接或未配置公司信息。

**Architecture:** 复用既有完整页脚的品牌语、导航、联系入口与样式，提取PublicFooter并由page级PublicPage统一添加，删除五处旧页脚。导航仍按D1公开路径过滤；联系只指向既有咨询／联系页面，不编造邮箱、电话或所在地。通过显式locale传入，切语言保持正确路径。

**Tech Stack:** Node24.22.1、Next16.4、React19、Payload3、PostgreSQL15，无新增依赖。

**Spec:** docs/tasks/customer-fixes.md第2条；2026-11-08-master-plan.md；PR33合并main d48b6e5。

## Global Constraints

- 本批只做D第2条；D第5–9条后续，不把首页／法律材料／客服和展会整体标为通过。
- 业务新增＋删除不超400行；lint不增465；源码最多200字符，一行一条语句。
- 不改审核／报价／数据权限；无schema／迁移／环境键／种子变化，不reset原数据。
- 继续用户任务分支工作流，复用干净checkout；独立应用缓存验证生产构建，3100保留数据，原55438不写。
- 不购买、不部署、不自动合并；真实外部服务和worker关闭。每次提交check和相关测试，日志／截图只在.local。

## Review Focus

- 首页／指南／目录／展会／机构／生活／咨询／申请／工具／客服／账户应各有且仅有一个完整页脚；管理员、工作台、预览和无效路由不当公开页面验收。
- 不为完整页脚添加无已发布资料的栏目链接；空投影仍可咨询、查隐私和服务边界。
- 中英及保留语言导航路径正确，不复制某语言硬编码联系人。
- 未提供真实主体资料时不输出公司所在地、邮箱、电话或“待核实”的占位文案；新增后台公司配置仍后续。
- 移除人类页面的agent数据入口，不破坏robots／sitemap里的现有llms发现以及公开数据API。

### Task 1: 统一页脚及页面覆盖

**Files:** 新增src/components/PublicFooter.tsx；修改content/PublicPage和四个公开路由page、Site／PublishedSite／CatalogPage／ExhibitionPage／InstitutionPage；新SSR及HTTP测试、CI；一页小结／指南／交接。

**Interfaces:** PublicFooter({locale:Locale})消费PublicNavigationContext；PublicPage新增locale:Locale，输出children和单一PublicFooter；页脚只使用已存在coreText和core样式，无新全局配置。

- [x] RED：真实Footer SSR多语言完整导航、空路径过滤、无技术／公司占位；HTTP覆盖所有有效公开页面的唯一完整footer和现有llms发现。
- [x] GREEN：提取页脚、条件导航；PublicPage统一输出，移除五处旧footer；四个page显式传locale。旧组件独立SSR不冒称完整页面。
- [x] Node24 check、相关SSR／HTTP和隔离生产构建；本地3100普通重启，不reset；1440／390前后截图，链接操作、无横溢；真机／新人未验。
- [x] 一次独立整分支复核：0缺陷，裁定／代价已记；check后提交推送唯一草稿PR34；自建副本已清理，保留备份／日志／截图。

最终文档提交产生的精确head CI在交接前核对，结果记PR描述和交接消息，避免文档自引用再次改变已检SHA。
