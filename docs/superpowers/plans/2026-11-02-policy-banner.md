# 阶段1.4 政策状态横幅 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans，当前会话直接实施，最后一次独立整轮只读复核。沿用用户已批准阶段计划。

**Goal:** 现有内容正文可引用正式政策并SSR展示即将到期/已延长/尚未确认，保持默认关闭与审核边界。

**Architecture:** 新policy-banner正文块的text存稳定政策内容标识contentKey（政策身份ID，非数据库主键），policyUnconfirmed可强制待确认；仍保存于现有JSON正文，经原保存/审核/发布/恢复流程。可信SSR读取active正式快照，上一版本只从同draftId且早于当前revision的publish审计取，绝不读草稿/主记录补事实；纯推导与显示分离，ContentBlocks插槽复用所有内容页。无迁移/新依赖/新API。

**Tech Stack:** Node24.22.1/Next16.4.3/React19/Payload/PostgreSQL；已读当前Next服务端组件文档。

**Spec:** docs/traffic-entry-task.md1.4；docs/traffic-entry-phase1-plan.md1.4。只本地，下一步1.5提醒。

## Global Constraints

- VISA_CHECKER_ENABLED默认false；关闭时无横幅/工具链接且不读政策，en/zh与SITE_LOCALES双重限制，B前不公开/部署/接统计。
- 业务源码<=400行，新/改代码无any，行<=200；不改实际.env/schema/权限/报价，不增加AI能力。
- 日期为显式中国日历日。截止当天仍有效；距截止0至30天优先即将到期；已过期/未来未生效/空截止/手动待确认/缺正式数据为尚未确认。
- 远于30天且无延长证据时不显示。延长需同身份/国家/政策类型/生效日、两次正式publish、新旧有限截止日严格增加，核实日不倒退；来源均验证HTTPS。未知不能推测。
- 所有来源/核实日可见，延长同时显示新旧正式记录依据；不保证入境/不计算离境日。无用户输入统计或外部请求。
- 构建停dev，与check串行；DB夹具停worker/finally清理，保留用户原稿116。独立草稿PR依赖PR14，不自动合并。

## Review Focus

- 仅改工作稿/提交/退回/下架与错误身份/语言/重复正式记录时，不从草稿产生延长结论或泄露私有字段。
- 截止前30/31天、当天/次日、跨时区/闰日、空截止和未来生效须保守一致；延长与快到期重叠优先到期。
- 上一次事件必须是同记录早于当前正式revision的发布，不能用save/unpublish或新草稿；身份/类型/生效日变化不声称延长。
- 正文块保存/发布/还原保留引用和待确认标记，AI不得新建横幅，现有角色和客户数据边界保持。
- 关闭开关/其他语言/损坏或恶意引用无死链接或注入；无JS与手机能读来源和新旧日期，数据库失败不得假装未确认成功。

### Task 1: 引用契约、状态纯函数与正式读取

**Files:** src/lib/immigration-policy-banner.ts；src/lib/immigration-policy-query.ts（只导出原cleanPolicy为cleanPublicPolicy）；src/server/immigration/banner.ts；src/lib/content-model.ts；tests/immigration-policy-banner.test.ts；tests/integration/immigration-banner.ts。

**Interfaces:** parsePolicyBannerBlock(unknown):{key:string,unconfirmed:boolean}|null；derivePolicyBanner(current:unknown,previous:unknown,asOf:string,forced=false):PolicyBannerState|null；PolicyBannerState={status:expiring|extended|unconfirmed,policy:PublicPolicyData|null,previous:PublicPolicyData|null}。readPolicyBanner(p:Payload,block:unknown,locale:string,asOf:string)只返回该投影或null。有效期远于30且无证明返回null。

- [x] 先RED纯函数与正文验证：边界/延长证明条件/原始私有对象拒绝/不可变、引用键及布尔验证、publicBody保留白名单、AI拒绝横幅。最小实现，单元GREEN。
- [x] 真实DB+HTTP夹具先RED：草稿/待审/改稿不影响、两次审核才延长、手动待确认、错语/下架/未知相同保守投影；关闭不读库、DB异常传播、未授权普通内容编辑不能读政策私有主表或发布政策。实现正式读取，后续Task2接HTTP。

### Task 2: 正文编辑与SSR显示

**Files:** src/components/immigration/PolicyBannerView.tsx/PolicyBanner.tsx/policy-banner.css；src/components/content/PolicyBannerFields.tsx/ContentBlocks.tsx/ContentCenter.tsx/PublishedSite.tsx；content-center/page.tsx/content-preview/[id]/page.tsx；tests/integration/immigration-banner-render.tsx；package.json/CI。

**Interfaces:** PolicyBannerView({model,locale,href?})纯展示；PolicyBanner({block,locale})服务端且开关/站点语言先拦截、请求级cache读取；PolicyBannerFields({value:Block,onChange:(Partial<Block>)=>void})只编辑引用/待确认，ContentCenter服务器props控制新增类型选项，不读取私有政策给普通内容编辑。

- [x] 先RED静态渲染：两语三状态、新旧来源/日期、危险文本转义、空模型与无href不造链接；实现组件及正文插槽，未配置不显示，不新增页面。
- [x] 接原编辑保存/审核与预览locale，原正文类型行为不变，CI加入渲染/生产HTTP横幅开关测试；三种真实状态及文章修改/政策修改/下架/语言隔离通过。

### Task 3: 本地验证、复核和交接

**Files:** docs/screenshots/policy-banner及README/progress/handoff/feature-inventory/政策说明/阶段计划。

- [x] check、相关content/permissions:content/policies:workflow DB及policy/query/trial HTTP回归；生产build与开/关HTTP通过，源码行长/any核对。
- [x] CUA虚构数据桌面/手机/无JS横幅截图及后台引用编辑检查；夹具清理/原稿116/实际flagfalse核对，恢复默认dev和两个worker。
- [x] 代码与证据提交后一次独立只读整轮复核；重要问题一轮RED→GREEN，不重派复核；所有裁定和验证限制记录。
- [ ] 最终提交推送草稿PR并关联，fetch完整SHA/clean tree/当前head push与PR CI实核；仅本地，下一步1.5，不自动合并/部署。
