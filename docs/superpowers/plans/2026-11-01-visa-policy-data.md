# 政策草稿种子与公开投影 1.1d Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans，按下面任务逐项验证。

**Goal:** 提供只创建草稿的幂等导入脚本与供后续SSR使用的已审核政策白名单读取。

**Architecture:** 种子JSON只声明内容标识、语言、标题和待核实字段；默认预览，--apply才调用既有mutateContent保存。跳过已有工作稿或主记录；并发唯一键冲突后重读，绝不更新现有记录。公开读取只消费active正式快照，不依赖当前草稿状态，不增加公网路由。

**Tech Stack:** Node24.22.1、TypeScript、Payload3、PostgreSQL15，复用现有依赖。

**Spec:** docs/traffic-entry-task.md（1.1）；docs/traffic-entry-phase1-plan.md（1.1d）；docs/immigration-policies.md。

## Global Constraints

- 本轮仅本地开发，不部署/购买/接统计；新功能VISA_CHECKER_ENABLED默认关闭，公开仍须B确认。
- 一步一个草稿PR，依赖PR9；业务源码目标400行内，超出先拆分；无新增any、依赖、服务、schema或实际.env修改，源码行<=200。
- 种子不自动核实或发布；示例只有明确未核实的虚构占位，不提供现实国家政策。
- 沿用既有角色/板块/实时授权与审核服务；不改客户、报价和员工权限。
- 每次提交前check及相关DB测试通过；构建/check串行，DB测试期间停worker，结束恢复原进程。

## Review Focus

- 已有/人工修改/已发布的记录，重跑及并发导入均不能被改写；孤立主记录不能被覆盖。
- 非编辑、跨板块、停用或旧缓存身份不能通过导入绕过写权限。
- 草稿/下架/损坏快照不进入公开结果；编辑新草稿不改变旧正式结果。
- 功能关闭或非中英语言不读库；公开返回不能带员工、内部备注、主记录引用或任意额外字段。
- 无截止日期保留null，口岸数组复制，读取无隐式条数截断；错误不能暴露私有输入/数据库连接信息。

### Task 1: 种子解析与只创建草稿

**Files:** src/lib/immigration-policy-seed.ts、immigration-policy-seed-env.ts；src/server/immigration/seed.ts；scripts/seed-policies.ts；scripts/content/policy-seeds.example.json；tests/immigration-policy-seed.test.ts、immigration-policy-seed-env.test.ts；tests/integration/immigration-data.ts；package.json。

**Interfaces:** parsePolicySeeds(value: unknown)返回验证并复制的{body:ContentBody,policy:Record<string,unknown>}数组；seedPolicyDrafts(p,user,input,{apply?:boolean})返回created/skipped/pending身份清单。固定action=save，不接受id/工作流字段，不导入核实人/核实日期。CLI --file FILE [--apply]，仅专用本地数据库。

- [x] 写解析单元：非数组/重复身份/非中英/未知字段/导入核实信息拒绝；输入复制与空事实保留，模板不能通过发布校验；先观察缺模块RED。
- [x] 实现解析、服务及CLI：全批输入先校验，实时政策编辑授权；预览零写入；已有工作稿/主记录跳过，冲突后重新查询；仅save，不submit/publish。复核后补显式字符串标识、拒绝DB URL查询/片段和安全初始化/清理边界。
- [x] DB覆盖预览、创建、重跑、人工修改保留、并发幂等、停用/跨板块/审核拒绝、失败无孤立记录；CLI真实预览和--apply在虚构夹具中运行并清理。Expected 全通过，公开快照始终0。

### Task 2: 正式快照公开投影

**Files:** src/lib/immigration-policy.ts；src/server/immigration/public.ts；tests/immigration-policy.test.ts；tests/integration/immigration-data.ts；.github/workflows/ci.yml。

**Interfaces:** validatePublicPolicy(value,today)验证公开字段；validatePolicyPublication继续额外验证核实人/内部备注。listPublicPolicies(p,locale)返回PublicPolicyData[]，只支持en/zh且开关true；无公网新路由。

- [x] 写公开字段校验单元和DB投影用例，观察缺实现RED；原发布校验全部保留。
- [x] 提取公开校验后实现读取：active快照、完整读取、运行时验证、显式白名单；畸形政策行跳过，DB故障传播，默认关闭不读库。
- [x] DB验收保存/提交不显示、审核后只公开白名单、新草稿隔离、两语隔离、下架消失、空截止保留、额外字段剔除和损坏快照拒绝；旧content/listPublished仍排除政策。Expected 全通过；把新DB套件加入CI。

### Task 3: 整体验证与交接

**Files:** docs/progress.md、handoff.md、immigration-policies.md、feature-inventory.md、traffic-entry-phase1-plan.md、README.md。

- [x] 原content、permissions:content、policies:workflow/editor及新data DB串行通过；既有政策HTTP、trial HTTP通过；check164项、生产build通过；无新any及行长例外。
- [x] 一次独立整轮只读复核，3项Important均补RED→GREEN；纯数据/脚本无新界面，截图不适用，不复用旧截图冒充新结果。
- [x] 虚构夹具清理，原稿116保留/实际flag关闭；网站及两worker恢复。实际记录已更新，提交/推送的完整SHA、草稿PR及本head CI以最终交接核实；下一步1.2查询纯函数。
