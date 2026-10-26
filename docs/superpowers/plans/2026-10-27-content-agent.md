# 华伴内容中心与受控 AI 助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成本地内容审核发布闭环，再完成受控 AI 生成候选草稿闭环，保持真人发布。

**Architecture:** 沿用 Next.js/Payload/PostgreSQL。工作稿、不可编辑公开快照和AI候选结果分离；所有写入与读取在服务端执行权限校验。公开网页按请求读取已发布快照。

**Tech Stack:** 项目已安装的 Next.js 16、Payload 3、PostgreSQL 15、TypeScript。模型供应商尚未选定，不新增外部账户或付费依赖。

**Spec:** docs/superpowers/specs/2026-10-27-content-agent-design.md

## Global Constraints

- AI只能生成候选草稿，管理员独占发布、下架权限。
- 管理员/编辑管理内容，客户运营无内容权限；匿名仅读取公开允许字段。
- en/zh独立记录与发布，不跨语言回退；contentKey＋locale唯一。
- 公开快照与工作稿分离，修改、退回、恢复版本不改变已有公开内容。
- 本地完成验证，不部署、不购买；未配置模型明确显示未配置，不模拟成功。
- 初版输入为粘贴材料＋来源链接，不进行自动URL采集。
- 单次AI输入上限20000字符、输出上限4000令牌、并发1；启用前须有管理员设置的每日额度。
- 图片仅JPEG/PNG/WebP，最多10MB；私有草稿素材不匿名可读。

## Review Focus

1. 通过普通CRUD、版本端点或恢复接口绕过发布权限：Task 1测试所有写入路径。
2. 双人编辑造成审核内容与发布内容不一致：Task 2测试旧版本发布409，Task 5测试旧候选采纳409。
3. 下架后前台用静态内容回退，或新指南被固定路由拒绝：Task 3做真实HTTP验证。
4. 私有图片、草稿元数据、中英文未审核内容泄露：Task 1/2/3做匿名读取与响应字段检查。
5. 模型重试、取消、超时和服务重启导致重复写入或计费误报：Task 4/5用可控假适配器模拟，真实调用单独验收。

## Task 1：工作稿与素材权限

**Files:** Create src/cms/content/collections.ts, src/cms/content/access.ts, src/lib/content-model.ts, tests/content-access.test.ts, tests/integration/content.ts. Modify src/payload.config.ts. Generate payload-types.ts and src/migrations/*.

**Interfaces:** ContentDraft包括id、contentKey、locale、kind、slug、title、summary、blocks、sources、sourceRevision、revision、reviewState；kind枚举service/guide/faq/page/partner。正文块用受限结构，来源含id/url/title/checkedAt。canEditContent(user)仅admin/editor返回true。

- [ ] 写失败单元与真实库测试：匿名/operations不读工作稿；editor可编辑但不能写审核/发布字段；中文英文与kind/locale/slug唯一约束、已发布slug不可改；非法URL及HTML块拒绝。
- [ ] 运行 npm test 和新增 npm run test:content，确认目标断言失败。
- [ ] 实现内容集合、服务端角色访问、修订号、状态保护及版本保留（30版）；来源事实核实字段只允许人工编辑，AI输出不能自我赋权。
- [ ] 实现私有素材集合和受认证文件读取，上传后检查实际文件类型及大小，存储在可迁移的独立媒体目录；拒绝文件名路径穿越及伪造图片类型。
- [ ] 运行权限测试与迁移测试：普通CRUD、版本、文件直链均不得绕过；生成并验证空库迁移。
- [ ] 提交此节点代码与测试，不包含本机媒体及密钥。

## Task 2：预览、审核、公开快照

**Files:** Create src/server/content/publishing.ts, src/server/content/public-read.ts, src/app/(frontend)/api/content/[id]/[action]/route.ts, src/app/(frontend)/content-preview/[id]/page.tsx, src/cms/content/Actions.tsx. Extend tests/integration/content.ts.

**Interfaces:** publishContent({id,expectedRevision,user})、unpublishContent({id,user})和submitForReview({id,expectedRevision,user})；PublicContent只含公开字段。getPublishedContent({kind,locale,slug?})不接受客户端overrideAccess选项。预览通过真实员工cookie验证身份。

- [ ] 写失败测试：editor直接发布403、旧修订号409、工作稿编辑不改变公开版、恢复到草稿不自动发布、未认证预览拒绝。
- [ ] 实现状态转换和后台按钮：保存草稿、预览、提交审核、退回修改、发布、下架、恢复为草稿；退回意见仅后台读取。
- [ ] 实现发布事务：锁定/核对工作稿版本，写不可编辑快照和发布事件；公开素材由已审核引用生成副本，失败不切换快照，孤立文件由受控清理处理；复制先写私有暂存，公开文件端点同时检查有效发布引用，下架且无其他引用停止服务，禁止静态直链绕过。
- [ ] 实现公开读取仅允许快照字段与已发布语言，所有关联只读不可编辑公开版本，测试关联草稿改变不会影响正式版；下架改公开状态，公开接口返回404而非旧快照；发布事件保留操作人和时间。
- [ ] 运行真实库事务与HTTP访问测试，确认匿名不可读快照历史、内部审查意见和私有文件。
- [ ] 提交经验证的发布闭环。

## Task 3：迁移现有内容并接通网站

**Files:** Create scripts/seed-content.ts, src/components/content/ContentBlocks.tsx, src/components/content/ContentProvider.tsx. Modify src/components/Site.tsx, Header.tsx, src/app/(frontend)/[locale]/[[...slug]]/page.tsx, src/lib/routes.ts, scripts/backup-test.mjs, scripts/export-local.ts. Add tests/content-routes.test.ts and scripts/check-content-http.mjs.

**Interfaces:** Site接收序列化PublicSiteContent，内部组件通过props/context读取；源文件只作幂等迁移种子，CMS启用后不能作为下架/数据库失败的内容回退。buildPublicSiteContent(locale)只返回公开内容。

- [ ] 写失败测试：新增指南URL可访问、下架后404和列表消失、英文缺失不显示中文、metadata与正文版本相同。
- [ ] 编写幂等迁移：保留现有contentKey、slug和语言，已有记录不覆盖；原始来源缺失的指南标记待复核，管理员选择审核发布，脚本不伪造审核事实。
- [ ] 将七类服务、指南、FAQ及首页/关于/联系/页脚的运营文案迁入字段；表单校验和固定导航等产品UI文案仍保留代码，不建设任意页面脚本编辑器。
- [ ] 前台正文、列表、精选、SEO改用公开快照；CMS为空显示清楚空态，读取故障显示暂不可用而不是旧静态内容。新增指南路由按数据库存在性判定。
- [ ] 扩展备份覆盖内容、版本、发布事件、媒体文件与引用；CSV/JSON导出注明字段和语言，恢复到独立库与独立媒体目录检查引用完整。
- [ ] 执行浏览器操作：管理员发布测试文章，编辑修改草稿，匿名仍见旧版，管理员重新发布见新版，最后下架404；保存实际证据。
- [ ] 运行 npm test、typecheck、build、现有业务集成回归和新HTTP测试，提交节点A及操作说明。

## Task 4：AI任务、限额与执行器

**Files:** Create src/cms/content/agent-tasks.ts, src/server/content-agent/types.ts, adapter.ts, runner.ts, limits.ts, scripts/content-agent-worker.ts, tests/content-agent.test.ts, tests/integration/content-agent.ts. Modify config and package scripts.

**Interfaces:** ContentAgentAdapter.run(input,{signal,maxOutputTokens})返回CandidateResult＋usage；input只含任务指令、允许的内容字段和材料。claimTask(workerId)、completeAttempt(leaseToken,result)、cancelTask(id,user)使用任务修订和租约校验。默认UnconfiguredAdapter不发网络请求。

- [ ] 写失败测试：配置缺失无网络调用、operations/anonymous不能创建任务、超长输入拒绝、缺少额度不运行、并发两个领取者只有一个成功。
- [ ] 建立任务和尝试记录，服务端保护status/result/usage/lease等字段；UI可创建任务但创建不触发付费调用。
- [ ] 实现单并发工作进程、数据库租约、取消、超时和故障恢复；过期任务变为需人工重试，避免不确定请求自动重发；迟到结果校验失败不写候选。
- [ ] 实现执行前额度预留与执行后已知用量记录；供应商未返回用量则保留未知，预留不直接归零释放以避免重复超额。费用没有匹配价目时显示未知；缺少价目禁止启用货币预算真实调用，可选择明确令牌额度。
- [ ] 用可控假适配器跑取消、超时、重复领取、进程中断、迟到结果测试；假适配器仅在测试使用，不对运营用户伪装AI生成。
- [ ] 写模型供应商适配接入说明：账户、模型、数据范围、预算明确后再实现真实适配器，并在其官方文档核对接口。此处不宣称真实调用完成。
- [ ] 提交任务执行框架及验证记录。

## Task 5：候选草稿采纳与后台体验

**Files:** Create src/server/content-agent/adopt.ts, validation.ts, src/cms/content/AgentTaskActions.tsx, src/app/(frontend)/api/content-agent/[id]/[action]/route.ts. Extend integration/content-agent.ts.

**Interfaces:** adoptCandidate({taskId,expectedRevision,user})返回工作稿ID；成功任务只有一个采纳关联。validateCandidate(result,allowedSources)校验结构、长度和来源编号。

- [ ] 写失败测试：AI生成发布指令不能调用发布服务；来源编号不在输入中拒绝；候选不覆盖被修改的新稿；两次采纳只有一个草稿；取消任务不可采纳。
- [ ] 实现四类任务输入表单、选定内容/材料预览、启动/取消/人工重试操作。记录创建人，来源材料限内容团队读取，不记录密钥和客户资料。
- [ ] 展示结果、引用、待确认项、修改建议、状态、已知用量和费用未知/估算标记；显示“提交网址不代表系统已读取来源”。
- [ ] 实现版本保护的采纳：候选保存为新草稿；已有内容修改以显式采纳和修订比较处理，不隐式覆盖。英文候选记录源中文修订号。
- [ ] 运行端到端任务流程，确认模型未配置页面明确阻断；用测试适配器仅验证程序逻辑，真实模型验收列为待接入项。
- [ ] 提交节点B及中文使用说明。

## Task 6：整体验收与交付

**Files:** Update README.md, docs/progress.md. Create docs/content-agent-verification.md.

- [ ] 检查发布访问面、素材、版本恢复及AI执行权限；进行一次独立整体验收审查，修复实质问题。
- [ ] 运行单元、内容/AI集成、原业务回归、迁移、备份恢复、类型检查和生产构建。
- [ ] 用浏览器验证中文管理流程和中英文前台；记录完整成功/失败行为，不以API测试冒充UI测试。
- [ ] 清单分别记录节点A完成、节点B框架完成、真实模型待配置/已验证，以及未做的自动采集、定时任务和外部部署。
- [ ] 本地提交；保留运行环境、源代码、账户由用户控制，不推送、发布或开通付费服务。
