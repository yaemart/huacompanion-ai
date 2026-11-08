# 首页公开公司信息实施计划（D第3批）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成D第5条，管理员填写真实公开资料后首页显示；空配置不显示公司区块，不推测主体或所在地。

**Architecture:** 新建仅管理员读写的公开公司信息Global，字段全部可选且无默认值：正式公司名称、中文／英文所在地、公开邮箱、公开电话。服务端白名单投影后传给PublishedSite首页的CompanyTrust；按语言选择所在地，不借另一语补空值；官方名称和联系方式共用。不新增公开配置API，不改内容二审或任何业务权限。

**Tech Stack:** Node24.22.1、Next16.4／React19、Payload3、PostgreSQL15；无新依赖。

**Spec:** docs/tasks/customer-fixes.md第5条及第8条边界；用户批准总计划和PR34合并后继续D；base a441450。

## Global Constraints

- 只做D5及移除首页硬编码上海所在地标识；D6／7／8真实法律材料／9之后逐PR，不能称D整体完成。
- 不编写真实公司材料、不写虚构默认值、不改已发布文章／种子；无配置无区块，字段空白逐项省略。
- 既有isAdmin控制Global读写；匿名及主管／运营／审核人拒绝，Inactive管理员拒绝；仅白名单公开事实进入页面。
- 新表空值增量迁移，不改旧表；现有数据库和图片先备份，在随机克隆验证后才停3100安装本轮单个迁移，不reset，原55438不写。
- 业务新增＋删除不超400，lint≤465，源行≤200；check与权限／隔离DB／SSR／生产HTTP实际验证。
- 外部服务和worker关闭，不购买／部署／自动合并；沿用当前checkout任务分支，不额外创建worktree。

## Review Focus

- 空配置／纯空格／部分配置不生成假主体或“待核实”占位，清空后新请求及时消失。
- 英文首页不借用中文所在地；姓名和联系方式原样作为文本，React转义，不让配置字符串成为HTML／脚本。
- Global API和低权限账户不能读写管理配置；公开首页仅白名单，不暴露id、时间戳、权限或其他数据。
- 首页不再硬编码公司在上海；城市插画是插画，不作为主体地址，文章内容仍走既有人工审核。
- 新表迁移往返与旧表原列行保持；跨语言首页、公开导航／页脚和默认禁收录无回归。

### Task 1: 公开配置与首页区块

**Files:** 新增src/cms/company.ts、src/lib/public-company.ts、src/server/public-company.ts、src/components/CompanyTrust.tsx；改payload.config／payload-types、PublishedSite／catchall page、迁移与index；新增pure／SSR／DB测试及CI；一页小结、交接与指南。

**Interfaces:** publicCompany(settings: Pick<PublicCompanySetting, "companyName" | "locationZh" | "locationEn" | "email" | "phone">, locale: string): PublicCompany | null；PublicCompany为companyName/location/email/phone字符串白名单。readPublicCompany(locale:Locale)服务端读Global后投影。CompanyTrust({company: PublicCompany | null,locale:Locale})空值返回null；PublishedSite可选company属性。

- [x] RED：纯投影空／部分／中英隔离／白名单，真实SSR区块及首页不再含硬编码SHANGHAI失败；Global配置／真实数据库权限、保存清空待补。
- [x] GREEN：上述字段／投影／SSR接入，首页移除固定上海标识；生成Payload类型，增量空表迁移，补CI。
- [x] 备份→随机克隆→迁移往返／旧数据核对／角色权限集成→生产build及HTTP；不写真实公司信息到源。
- [x] 源停站备份核对后仅安装新表迁移，重启3100保留数据；空配置前后1440／390截图，配置示例仅在隔离克隆临时使用后清空；实际浏览器检查，不冒称真人C9通过。
- [x] check后推送唯一草稿PR35；一次独立复核、长字段移动横溢RED→GREEN修复；更新小结，清理自建副本保留备份／证据。

最终文档提交产生的精确headCI交接前核对，结果写PR描述，避免文档自引用再改变SHA。
