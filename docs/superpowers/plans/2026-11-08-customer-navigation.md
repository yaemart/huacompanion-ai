# 客户端导航与可达内容修复实施计划（D1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 菜单及服务链接只指向已公开内容，隐藏空知识分类，首页首屏提供免签工具入口。

**Architecture:** 沿用已批准任务D第1、3、4条及现有发布投影，不新建内容库或修改权限。以请求级缓存的listPublished为唯一资料来源；语言layout向客户端提供仅含公开路径的上下文。静态菜单和内部服务链接按路径过滤，公开文案和发布状态均不改。首页工具入口复用现有功能开关。

**Tech Stack:** Node24.22.1、Next16.4、React19、Payload3、PostgreSQL15，无新依赖。

**Spec:** docs/tasks/customer-fixes.md；docs/tasks/2026-11-08-master-plan.md；PR32合并main479d18f。

## Global Constraints

- 本批只做D第1、3、4条；第2、5–9条留后续顺序PR，不宣称D全部完成。
- 业务新增及删除不超400行；lint不增465；源码最长200，一行一条语句。
- 只读公开内容投影，不把草稿、客户、成本或内部配置送到客户端；发布／审核／数据权限不变。
- 3100现有数据保留，不reset；原55438不写。无schema／依赖／环境键变更；真实外部服务及worker关闭，不部署、不购买、不合并。
- 当前干净checkout按用户多电脑任务分支方式继续；生产build另复制隔离应用，避免占用演示.next。

## Review Focus

- 内容只有另一语言时当前语言栏目仍隐藏；既有空分类URL可清除筛选，不凭空显示别类结果。
- 草稿／下架及服务商资格过滤必须来自listPublished，不能直接读所有快照作菜单。
- 同站绝对服务链接带查询／锚点仍受保护；外站同名路径不误删；服务项目目录不当普通服务。
- 功能关闭时首页／菜单均无免签入口；现有语言开关继续生效。
- App Router保留layout时菜单不能长期保留已下架内容；Provider刷新需按Next指南实测，必要时改请求级根布局数据。

### Task 1: 发布内容导航与首屏入口

**Files:** 新增src/lib/public-navigation.ts、src/server/content/published.ts、src/components/PublicNavigation.tsx；修改Header、PublishedSite、PublishedGuides、ContentBlocks、[locale]/layout及catchall读取；新增纯测试和SSR／HTTP回归，CI注册；更新中文小结及交接。

**Interfaces:** publishedContent(locale:string):Promise<ContentBody[]>为请求级cache读取；buildPublicNavigation(contents:ContentBody[],origin:string)只返回公开paths和origin；isPublishedDestination(href:string,availability)决定同站导航／普通服务链接是否可点；PublicNavigationProvider包语言页面，PublishedLink对不可用目标保留文字不输出链接。

- [ ] RED：纯测试覆盖语言隔离／栏目映射、服务项目特殊路径、同站绝对URL及外站、查询锚点／无资料；SSR和HTTP复现首页无工具入口、全页子导航、空分类与菜单。
- [ ] GREEN：按公开投影推导路径；接服务端缓存和layout provider；菜单及内容链接过滤，知识分类计数只看guide，空筛选保留结果0及“全部”；子导航仅服务相关页面；首页开关入口。
- [ ] check＋相关SSR／HTTP和生产构建；浏览器1440／390首页菜单／指南／服务详情对照，新入口跳转／语言切换。后续D页面只记未改；真人验收仍未验。
- [ ] 一次整分支独立复核，发现的Important/Critical按RED→GREEN修正；记录所有裁定及代价，check后提交并推送唯一草稿PR，核对最终head CI。
