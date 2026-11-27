# 阶段A客户档案与业务关联 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 安全交付个人／企业档案、多联系人与咨询唯一关联，保留原外部授权边界。

**Architecture:** 四私有CRM集合、白名单员工服务、现有业务→客户锁及同事务审计。
咨询为唯一关联锚点，服务单沿咨询派生。A1后端／迁移与A2最小界面分顺序PR。

**Tech Stack:** Node.js 24.22.1、Next.js、Payload、PostgreSQL；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-11-26-crm-phase-a-design.md`

## Global Constraints

- 仅计划，尚未执行任何复选框；用户批准实施设计前不写代码。
- 不切换或提交当前展会任务，不编辑其交接与源码；实施时从最新origin/main建立codex/crm-phase-a-core。
- A1合并后才从最新main建立codex/crm-phase-a-ui，不叠加PR；均早建草稿PR，不自动合并。
- 实施前读AGENTS、handoff、多电脑指南及node_modules/next/dist/docs的路由／缓存／认证相关文档。
- Node.js 24.22.1；Prettier目标100、源码最长200字符；CMS变化后重启进程。
- 无真实客户、邮件、账号购买或部署；随机库串行测试，不reset或自动升级原演示库。
- 提交前npm run check与相关集成；实际结果写docs/progress.md及一页小结；不宣称未核实CI通过。

## Review Focus

- A08旧授权存在时CRM撤销必须阻断并保持旧授权：任务4真实事务及审计失败回滚。
- A09员工停用／咨询转交必须与写事务串行，检查现有写路径锁协定：任务2／4。
- A04/A05通用接口、关系展开与统计旁路：任务2／3／6字段断言。
- A06同键异内容／重复／失权回放不可返回旧敏感数据：任务3／4。
- A11非空迁移回退不可删除客户数据：任务1四类非空保护。

## 文件与接口约定

新增：src/lib/crm.ts（输入校验／DTO）、src/cms/crm/collections.ts（四私有集合）、
src/server/crm/access.ts（角色／范围）、src/server/crm/read.ts（查询投影）、
src/server/crm/service.ts（事务动作）、src/server/crm/links.ts（咨询关联及旧授权阻断）。
A2新增：src/app/(frontend)/crm-center/page.tsx、src/app/(frontend)/api/crm/route.ts、
src/components/crm/ClientDirectory.tsx及本地输入状态模块。
修改：src/payload.config.ts、src/migrations/index.ts、payload-types.ts（根目录唯一生成文件）、
package.json（新测试脚本）。
已核对src/payload.config.ts：生成类型唯一输出为根目录payload-types.ts，不创建第二份。

CrmActor复用Staff非空类型，但各服务必须锁后重新读staff；输入ID均正安全整数。
CrmReadInput与CrmActionInput严格区分联合，字段、可选项及限制以设计第4节为准。
crmRead(p: Payload, actor: NonNullable<Staff>, input: CrmReadInput): Promise<CrmReadResult>。
crmAction(p: Payload, actor: NonNullable<Staff>, input: CrmActionInput): Promise<CrmActionResult>。
assertCrmClientAccess(p, actor, clientID, req): Promise<CrmClient>；只返回当前有范围客户或404。
assertNoLegacyInquiryAccess(p, inquiryID, req): Promise<void>；
调用者必须已持726281→726283及完成权限复核；有活动旧授权返回409，函数只读、不开始／提交事务。

## A1任务1：私有模型、索引与迁移

Files：新增四集合与src/lib/crm.ts；修改Payload配置、迁移索引及唯一生成类型文件；
新增tests/crm.test.ts、tests/integration/crm-migration.ts；迁移文件用实施当日唯一时间戳生成。

- [ ] 核对Payload生成配置、现有迁移和主联系人部分索引语法，记录实际表／列名。
- [ ] 写A02/A03/A10校验失败测试：非法ID、未知字段、个人／企业、联系方式必需、不可变kind。
- [ ] 运行Node24下node --experimental-strip-types --test tests/crm.test.ts，确认因缺规则失败。
- [ ] 实现设计规定的联合输入与四集合；关闭默认CRUD与通用端点，外键RESTRICT。
- [ ] 写A11：旧表克隆up指纹不变、新表为空；空表down/up；分别新表非空时down拒绝且回滚。
- [ ] 在随机库用实际迁移运行器验证A11，生成类型，运行npm run typecheck。
- [ ] 单独提交本任务文件，不提交本地数据库、日志或展会文件。

## A1任务2：固定角色与事务范围

Files：src/server/crm/access.ts、tests/integration/crm-access.ts；必要时最小修改原权限变更守卫。

- [ ] 写A01/A02/A04：admin全范围、主管同团、运营同团本人、纯编辑／外部／停用拒绝。
- [ ] 实证缺服务／错误scope导致失败，记录红测；实现assertCrmClientAccess与创建规则。
- [ ] 检查员工停用／角色／团队与咨询转交写路径是否同锁；补A09实际PG屏障测试。
- [ ] 若有未共享业务锁路径，最小接入锁协议并回归原权限；不新设逆序锁。
- [ ] 测通用REST/GraphQL/Local API/versions拒绝及字段白名单；真实PG正反例通过后提交。

## A1任务3：建档、联系人与只读查询

Files：src/server/crm/service.ts、read.ts；新增tests/integration/crm-records.ts。

- [ ] 写A03/A05/A10：多联系人、跨企业修改隔离、主联系人唯一、子项父ID替换、版本冲突。
- [ ] 写A06操作键同内容一次回执／审计、异内容409、失权回放404；先确认失败。
- [ ] 实现createClient/updateClient/saveContact/setPrimaryContact/archiveContact/archiveClient，
      联系人修改递增clientRevision；归档有活动关联时409。
- [ ] 实现crmRead五种action，分页20默认／50上限、q100上限，授权过滤先于计数／分页。
- [ ] A05 GET四新表及旧业务全指纹不变；A04无成本／审核／凭据；导出与任意where不支持。
- [ ] 执行crm.test、crm-access、crm-records，全部通过后提交。

## A1任务4：咨询关联与旧授权保护

Files：service.ts、links.ts；
新增tests/integration/crm-links.ts、tests/integration/crm-concurrency.ts。

- [ ] A06/A07先红：同咨询并发关联只能一胜、服务单通过咨询派生、原业务和外部授权不变。
- [ ] A08先红：有旧授权默认撤销409无副作用；无旧授权时可撤销；既有授权保持原样。
- [ ] 实现只读assertNoLegacyInquiryAccess，不修改原revokeCustomerInquiry或外部授权流程。
- [ ] 实现linkInquiry/revokeInquiryLink；同团队一致，双记录权限与版本锁后重查。
- [ ] A09真实事务屏障观察锁等待，复现停职／转交／撤权竞争；不用sleep猜竞争发生。
- [ ] A08/A12及总体P23审计故障注入后所有表回滚；旧客户会话行为不受新建档影响；原流程撤销后不能再读／确认的回归保持。
- [ ] 顺序运行test:customer、test:business、test:permissions:business与CRM集成，提交。

## A1任务5：后端阶段交付

- [ ] package.json新增test:crm脚本，串行运行上述集成；每个测试独立随机夹具并清理。
- [ ] Node24运行npm run check、npm run test:crm及相关原回归，日志放.local忽略归档。
- [ ] 迁移克隆演练和生产build使用独立目录／库，禁schema push；不占用原展会服务与端口。
- [ ] 一次独立审阅，修正权限／事务／迁移问题；实际执行结果写progress与阶段小结。
- [ ] 仅提交A1文件、推送、fetch核对SHA与对应CI；保留草稿PR由用户决定合并。

## A2任务6：员工最小界面与真实路由

依赖A1合并。Files：crm-center页面、api/crm路由、ClientDirectory及tests/crm-client.test.ts、
tests/integration/crm-http.ts；按现有后台导航机制添加入口，具体注册文件实施前rg核对。

- [ ] 先写A13真实路由测试：GET/POST、401/403/404、同源校验、16KiB拒绝、字段注入、no-store。
- [ ] 读取本版本Next路由／cookies／认证／缓存文档后接入crmRead/crmAction，不能直接查集合。
- [ ] 建列表、建档、编辑、联系人与关联面板；不加入B总览统计、转交或C待办。
- [ ] 表单保留operationKey至结果明确；失败保留输入；409提示保留输入后重新核对，不能自动覆盖。
- [ ] A08旧授权存在时撤销阻断：保留输入，提示由有权员工到原授权流程核对，不提供一键全部撤销。
- [ ] A04/A05 SSR／水合／HTTP响应字段与隐藏记录计数断言；真实Next服务运行A13。
- [ ] A14桌面／390宽度／键盘、自主建档关联撤销自测；截图仅本地，不冒称真人验收。
- [ ] 运行npm run check、test:crm及customer/business/permissions回归，生产build与A2路由测试。
- [ ] 更新小结与交接、审阅、推送核对CI；原展会环境不动，用户决定合并。

## 测试执行说明与完成判据

新增集成脚本正式名称在任务5注册后方可执行；不能把计划中的npm脚本称作现已存在。
脚本必须自行创建／销毁随机库，拒绝真实或演示数据库目标；迁移测试禁schema push。
A01–A14逐条在progress列实际命令、结果、提交SHA与未执行项；无真实PG／HTTP证据不称完整验收。
A1/A2均无实际.env／外部账号变化；若实施发现必须变化，先更新实施记录和设计，不暗中加入。

## 2026-11-28执行范围修订（优先于原阶段描述）

用户批准A1a→A1b→A2顺序。以2026-11-28-crm-phase-a1a.md为本次实施范围；
A1a不建关联表、不实现咨询关联或HTTP/UI，不操作原演示集群。
负责人沿用validOwner：同团队现职且具operations能力。旧外部授权全程不改。
