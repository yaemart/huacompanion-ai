# 实施记录

## 2026-11-01 本地阶段1.1c1：政策审核发布事务与权限

按已批准1.1c及预留拆分规则，本轮先完成事务/权限适配，1.1c2再做后台字段界面；前置PR #6的push/PR CI均已实际成功（41291334908、41291360511）。本分支依赖PR6，不自动合并/部署。

新增immigration-policy板块，既有员工不自动获权。政策事实只在主记录，工作稿JSON保存id/revision引用；policyKey自动绑定contentKey:locale，独立输入policy有字段白名单。保存/历史恢复/提交/退回/发布/下架复用原内容事务、自审例外、贡献人和审计；政策操作按内容→员工顺序持锁并重新读取当前授权。发布须完整校验、有效且获政策授权核实人及policyReviewed明确人工确认；正式快照排除员工、内部备注与主记录引用。现有listPublished始终排除政策，即使临时flag true也没有公开工具。AI直接采纳被工作稿内部事务边界拒绝。

新类型及投影单元先失败再通过；真实DB保存先缺失主记录引用失败再通过。伪造body.policy导致清理前投影报错，已修正保存边界忽略不可信快照字段并复验。真实DB停用账号/缓存对象测试先发现缺少重新授权，补员工锁与读取后通过；授权以DB为准，移除与DB授权不一致的人工缓存断言，真实跨板块/停用测试保留。

迁移仅新增员工内容类型枚举。先停三个writer并备份到忽略目录.local/policy-workflow-before/database.dump（目录0700/文件0600）。空库全迁移通过；随机克隆up/down/up保留66张原表全部原列行数/内容指纹，down遇政策授权先拒绝且不删授权；随后本机事务up同样保留原数据及local迁移标记。迁移测试夹具曾错写_order/_parent_id，依据实际order/parent_id修正后通过，没有修改业务schema迁就测试。

test:policies:workflow与HTTP退出0，覆盖部分草稿、板块/角色/停用拒绝、字段伪造、通用写入保护、保存失败无孤立主记录、待审冻结、核实确认、旧快照隔离、历史恢复、缺失历史拒绝409、归属及旧修订拒绝、并发保存/发布仅一方成功、自审与管理员例外审计、快照失败整笔回滚、旧JWT立即拒绝、跨来源拒绝和公开列表隐藏。虚构政策/员工/工作稿/事件/任务及版本清理。原content、permissions:content、quality、agent、policies五套DB串行退出0；并发路径仍有既有pg客户端query弃用告警，未改原并发机制掩盖。

npm run check通过：155/155单元，lint 0 error/465既有warning，Prettier/typecheck通过，332源码/脚本/测试文件行长不超过200且无例外。生产build在dev停机且APP_ENV=trial时成功。无新增any、依赖、服务、费用或实际.env修改；原any债务沿用1.1a记录。独立只读复核无Critical/Important/Minor，另跑政策纯单元3/3及暂存diff检查通过；仅抽查DB/HTTP/迁移/build日志，未代替主实施者重跑。1.1c2界面、1.1d公开读取、真实政策、远程CI/部署不在复核范围，保留后续验证。网站和两个worker已恢复（workflow为0提醒/0处理，support为AI不可用转人工）；只读核实默认flag关闭、政策记录/版本/临时板块授权均为0。源码AST仍290处any/38文件，本轮未增加。本head云端CI另按实际结果报告。

本轮仅服务/权限步骤，没有新可用字段界面，桌面与手机截图不适用；1.1b只读截图保留，不能作为未来编辑界面验收。下一步1.1c2字段表单和审核确认，再做1.1d种子/专用公开投影。工具、真实政策和云端部署仍未交付；本轮无需用户提供账户或费用。

## 2026-11-01 本地阶段1.1b：政策集合、版本与安全迁移

新增`immigration-policies`（DB名imm_policies、生成类型ImmigrationPolicy），包含稳定唯一policyKey、国家中英名/ISO代码、政策类型、停留天数、日历日期文本、口岸区域数组、来源、核实人关系、公开/内部备注、工作版本状态和修订号；状态默认draft、修订1，最多30个版本。事实可为空，允许部分草稿；没有自动核实或发布。管理员仅可读记录和历史；匿名、普通编辑/审核/运营、停用员工不可读，通用创建/修改/删除/版本恢复对所有人关闭，受信内部overrideAccess除外。未改员工原板块枚举，1.1c再接现有审核服务，不提前放权。

`VISA_CHECKER_ENABLED`仅字面true开启，本步控制后台导航显示，默认false；没有公开工具或公开数据接口。示例配置已补，实际.env未改。发布契约改为从Payload生成字段派生，关系和口岸行规范化为ID/字符串数组；增加Payload内部备注null兼容，先观察用例失败再通过。没有新增包、外部服务或费用。基线151单元通过；新开关和集合测试先缺失失败，实现后通过。

新增迁移`20261101_082855_immigration_policies`，只加政策/版本/子表及锁关联可空列。生成器的down顺序缺陷在隔离克隆复现42704：CASCADE已删外键却再次删除；调整为先撤外键，up/down/up重新通过。另按已有迁移使用静态SQL字符串解决两份Drizzle SQL类的私有类型不兼容，无插值或any逃逸。生成类型/迁移索引和JSON快照均已更新，原迁移不改。

本机迁移前已停止网站和两个worker、pg_dump备份到忽略目录（目录0700、文件0600）。克隆恢复到随机新库，升级/回退/再升级逐表比较62张原表全部原列的行数和内容指纹，一致；同时检查新默认值、唯一键及版本表。空库全迁移也通过。随后仅在本机专用库事务应用本项up，62原表数据完全一致；未清空/覆盖原库，也没有重写其local development迁移标记。原图像目录未改，本轮是schema迁移验证，不冒充云端配套恢复。另机必须自行备份后按约定应用；down会删除新模块数据，不能用来随意切分支。

实际本地验证：`test:policies`退出0，覆盖部分草稿、记录/版本访问、所有通用写入及恢复拒绝、历史保留和唯一键；测试遵循原项目在destroy后正常exit，失败仍传播非零。`test:policies:http`使用真实JWT覆盖匿名/编辑/审核/运营拒绝、管理员只读、单条版本和count路径、通用REST及版本恢复拒绝、停用账号旧JWT立即拒绝；虚构员工/草稿最后清理。原content、permissions:content、quality三套DB回归均退出0。`npm run check`通过：152/152单元，类型、格式、行长检查通过；生产build在停dev且APP_ENV=trial禁自动push时成功。新DB套件加入CI，HTTP需运行本机网站，克隆迁移测试需升级前备份，见[操作说明](immigration-policies.md)。

实际浏览器验证管理员可看只读字段和版本入口，无保存/发布/创建入口；只用明确虚构的部分草稿截图。首次缩放截图异常已丢弃，重新开390×844手机视口得到375×812截图；1440×1000桌面视口得到1425×990截图（图像为实际内容区域）。临时显示进程已关闭、默认开关恢复；验收草稿及其版本已删除，原用户页面未导航改动。

![政策集合桌面只读验收](screenshots/visa-policy-collection/desktop.jpg)

![政策集合手机只读验收](screenshots/visa-policy-collection/mobile.jpg)

本轮无公开页面变更，查询工具/政策编辑审核/种子仍未实现。下一步1.1c按独立PR接入工作流。本分支依赖PR #5，前置合并后改指main重验，不自动合并或部署；最终门禁退出0：lint 0 error/465既有warning、Prettier和typecheck通过，323源码/脚本/测试文件行长全部不超过200且无例外，152/152单元通过。源码any仍为290处/38文件，债务原因沿用1.1a及下方清单，本轮修改模块无any。独立静态复核无P0–P2问题，另核对快照仅新增4表4枚举及旧锁关系表新可空关联；复核者未重跑DB/HTTP/check/build，其单元尝试因未找到nvm停止，不计为通过证据。主实施者上述实测结果不变。trial HTTP通过，网站及两个worker已恢复，默认flag关闭、导航隐藏、GraphQL禁用、政策夹具及版本为0已只读核实。云端CI以本次提交实际结果另行报告。

## 2026-11-01 停止点A确认、本地阶段1.1a

用户明确确认Render，以及Cloudflare Web Analytics加站内每日业务事件汇总，同时要求当下继续本地开发测试。A已通过；这不授权购买、开通账户、云端部署或现在接统计代码。B/C/D仍须确认。前置PR #4提交fe08097的push/PR CI已实际成功（41284725627、41284750114）；main尚未合入这些基础，故本地先行用独立依赖分支/草稿PR，合并时按顺序改指main并重验，不自动合并。此安排的代价是后续重验成本，并不把草稿当已合并版本。

1.1a新增政策完整发布输入与公开白名单契约、日历日期/区间/核实日/字段/来源URL校验，过境口岸条件必填；公开投影排除核实人/内部备注/额外字段并复制数组。校验不访问网络，不确认现实政策事实或ISO代码分配；国家编码当前只校验两位大写格式，仍须人工核实。没有政策集合、迁移、录入界面、公开API或查询页面；函数未接入现有发布流程。后续1.1b/c再实现真实Payload集合与权限，不冒称已验证未来权限。单一主记录→工作流修订引用→正式白名单快照的映射约定见[政策数据契约](immigration-policies.md)。

内容发布服务改用PayloadRequest与生成ContentDraft/ContentPublished类型，输入字段unknown，原有验证后使用正文；去掉9处any并加ESLint错误防回退。保留原角色、板块权限、自审例外、事务锁、修订检查、发布隔离与目录业务规则。未验证输入与已验证正文分开，避免对unknown重新赋值后丢失类型收窄；typecheck先暴露这一编译问题，改为独立const后通过，没有添加类型逃逸或修改业务条件。源码AST复核any从299/39文件降为290/38文件；旧逐文件表作为历史记录，当前内容服务行已清零，其余债务原因不变。

实际验证：契约测试先因模块缺失失败，再5/5通过；原单元基线146项通过，新增后151/151通过；类型检查通过。更改前test:content通过；更改后8个真实本地DB套件串行均退出0：content、permissions:content、catalog、exhibitions、institutions、life、housekeeping、quality。包括编辑/审核分离、跨板块/停用拒绝、自审限制及管理员例外审计、版本与稳定URL、正式快照不被草稿改动、目录关联、内容复核和提醒幂等。quality套件出现既有pg客户端并发query弃用警告，未影响通过，不修改原并发流程来消除告警。测试期间停止本机两个worker；本轮无迁移、无新增依赖、无环境变量变更。

完整npm run check通过：lint 0 error / 465既有warning，Prettier通过，315源码/脚本/测试文件无超过200字符行且无例外，typecheck通过，151/151单元通过。content HTTP通过，覆盖登录、草稿预览保护、元数据、旧正式快照、语言隔离、私有/公开图片、下架和未配置AI拒绝。trial HTTP也通过，确认英文入口、两种公开语言及高级功能/API仍关闭。独立只读复核无Critical/Important/Minor，另行运行政策5项测试通过；后续集合权限/迁移/UI及现实政策事实不在本步可验证范围，须在后续步骤补齐和人工核实，不得据此公开政策。两个本机worker已恢复，workflow记录reminders/processed均为0，网站3000继续运行。

草稿[PR #5](https://github.com/yaemart/huacompanion-ai/pull/5)以PR #4分支为基线，本轮业务源码差异小于400行，未自动合并。本步无界面变化，桌面/手机截图不适用；前一步实际截图保留在screenshots/traffic-entry-phase0。下一步是独立PR的1.1b集合/版本/关闭开关与安全迁移，当前工具尚不可使用。推送后核对远程head，CI按最新提交实际状态单独报告。

## 2026-11-01 流量入口：阶段 0 核对、0.2 补齐与停止点 A

最新[用户任务书](traffic-entry-task.md)替代此前两份说明；旧章节保留为历史验证证据。范围到停止点 A，不开始阶段 1。已有基础在草稿 [PR #2](https://github.com/yaemart/huacompanion-ai/pull/2)，未合并；本轮用独立小 PR 补齐 0.2，暂基于独立 CI 补齐 PR #3 的分支，基础合并后须改指 main 并重验，不自动合并。

- **0.1 复用**：独立仅格式化提交 d24d7b3 已存在，前后测试及 AST 验证见本文件任务 1，不重复格式化。Prettier 100、ESLint/typescript-eslint、check 和 push/PR CI 已有。该要求在旧 PR 中实现；不冒称已追溯拆成三个新 PR。
- **0.2 补齐**：SITE_LOCALES 缺省由 zh,en 改为 en,zh，根路径仍进入 /en；更新配置示例、清单及交接。llms.txt 原来固定宣传七语言，现按实际公开配置列出。七语后台/代码保留，高级功能开关及权限未改。本轮修改文件无新增或保留 any，没有新增依赖、外部服务或迁移。
- **0.3 复核**：在 Node24.22.1 执行 npm audit fix --ignore-scripts，无 --force，结果 up to date，package/lock 均无变更。全树仍 23 项（6 low、17 moderate），omit=dev 仍 11 项（6 low、5 moderate），无 high/critical；**并非全部开发依赖**。运行时 deepmerge、生产树迁移工具 esbuild、开发 lint minimatch 的原因见既有任务 3 / trial-deployment.md。不兼容强制降级未执行。dependencies 无 node，engines/.nvmrc 已有。

实际验证：默认顺序单元测试先失败（旧 zh,en）再通过（3/3）；HTTP 新断言先捕获 llms 的旧七语宣传，再通过。完整 npm run check 退出 0：lint 0 error / 474 个既有 warning，Prettier 通过，313 个源码/脚本/测试文件无超过200字符行、无例外，typecheck 通过，146/146 单元通过。test:trial:http 验证根路径307到/en、两语选项顺序、llms、两页导航无客户/客服入口、全部客服功能关闭及两 API 503。独立只读复核未发现重要问题；阶段0.1提交97404cc的push/PR两次CI已实际成功（41284413080、41284433409）。本轮0.2的云端结果以新head单独核对。源码既有 any 债务仍为 299/39 文件，原因逐项在下方任务 1 清单；本轮没有扩大清理范围。没有修改数据库、客户权限或报价规则。另跑 check-locales-http.mjs 通过：12个页面、10个启用语言API检查、其余语言拒绝及sitemap/hreflang隐藏。

实际浏览器从根路径进入英文首页，仅 English/中文两项；保存了桌面1440×900及手机390×844截图。页面显示本机测试横幅及内容待准备提示，不冒充已发布内容。临时验收标签已关闭并恢复默认视口。

![桌面英文首页](screenshots/traffic-entry-phase0/desktop-en.jpg)

![手机英文首页](screenshots/traffic-entry-phase0/mobile-en.jpg)

[托管比较](hosting-options.md)复用已核实方案并明确境外地域；新增[统计比较](analytics-options.md)，指出 Umami 默认匿名会话标识、Cloudflare 不支持自定义事件，以及无个人标识无法精确去重有效人数。推荐供确认：Render + Cloudflare 访问性能统计 + 阶段4站内每日业务事件汇总，指标以有效行为次数展示。**这只是提案，用户尚未确认；当前已停止在 A，没有接入统计代码、开通账户、购买或部署。**用户随后明确选择先整理阶段1完整任务书和实施顺序，已交付[阶段1开发计划](traffic-entry-phase1-plan.md)：拆分数据/审核/纯函数/SSR/浏览器查询/横幅/提醒/SEO/真实部署及B验收，含每个PR预计行数、权限与日期边界、A/B门禁。仅计划，没有阶段1业务实现。下一步先由用户审阅计划与A选择，确认后再开始1.1。

## 2026-11-01 流量入口 0.1：覆盖所有 PR 的检查触发

最新用户分阶段任务书要求每次 push 和 PR 检查。既有 CI 的 pull_request 仅针对 main；本次去掉 base 分支过滤，使有依赖的阶段小 PR 也触发同一门禁，push 和手动入口保留。只改 CI 配置，不改业务、权限、依赖或数据。本步独立 PR，依赖尚未合并的基础 PR #2，不自动合并。

格式化、Prettier100、ESLint/typescript-eslint、check 复用既有基础；独立仅格式化提交 d24d7b3 及前后测试证据见下方任务1。本轮 check 通过：lint 0 error/474 既有 warning、Prettier通过、313个文件无超过200字符行且无例外、typecheck通过、146/146单元通过。CI配置无界面变化，手机与桌面截图不适用。云端本次 head 的触发和结果以实际 Actions 为准，不沿用旧 head 的绿色结果。

下一步为独立的 0.2 英文优先补齐；到 A 必须等待用户确认托管与统计，不开始阶段1。

## 2026-11-01 任务 4 补测：旧 HTTP 七语假设

最终串行回归在 exhibitions-http 的 /es/exhibitions 复现旧测试仍要求200；新公开配置正确返回404。补修四个HTTP脚本（展会、机构、客服、路线），保留原英文业务／权限／隐私／缺失译文断言，启用语言验证200、lang/dir、API语言与切换器，关闭语言明确验证目录／详情404、公开API400；没有修改生产逻辑或缩小七语代码测试。

相关七入口串行全部通过：exhibitions-http、institutions-http、catalog-http、content-http、support-http、locales-http、check-routes（153项页面／404）。独立只读复核确认没有弱化原断言；typecheck、行长和diff检查通过。提交前完整check在含部署工具测试的工作区运行，146/146单元通过。完整原始结果保存在忽略目录 .local/task4-http-followup-*.log。

## 2026-11-01 收敛与试运行准备：任务 5

部署准备沿用现有技术，不接入新业务服务、不购买、不发布。hosting-options.md 给出一个推荐（Render Pro + 托管 PostgreSQL，按小型配置约 $86/月、建议预留 $100–120）和一个备选（Railway Pro + Neon Launch，按持续轮询假设约 $58/月、建议 $70–100），逐项列网站与两 worker、图片盘、自动备份、HTTPS、自定义域名和维护取舍，并链接当日核对的官方来源。明确 Render Pro 没有 Web 入站 IP 白名单，网关必须实际验收；Neon 因 worker 轮询不能按长期休眠估算。均为预算假设而非采购决定。

新增 Dockerfile、多进程 Compose 和独立恢复 Compose；Node24.22.1／PostgreSQL15，网站 3001、DB仅本机55439，与现有3000／55438分离。镜像以 node 用户运行，运行层 omit=dev（tsx由Payload生产依赖保留）；migrate 成功后才启动三个应用，图片命名卷持久化、worker只读挂载。构建不使用真实秘密；随机本地秘密只写忽略的 .env.compose。

增加受控首管理员 CLI（trial限定、默认dry-run、明确--apply、空staff二次检查与原advisory锁、审计、不输出密码），不开放公网注册或修改已有账户。compose:smoke仅允许隔离本机配置，虚构记录验证两表单入库服务、中文后台／中英网站／noindex、入口关闭、匿名／跨团队／停用访问拒绝、权限CSV/BOM/敏感拒绝与审计、真实私有WebP上传和访问隔离。

配套备份先冻结全部三个 writer，包括 restarting 状态，确认停止后保存 dump／图片／manifest；finally尝试恢复原应运行进程。恢复只用随机隔离项目的新库新卷，无端口、不覆盖原数据；逐表行数和全部行内容指纹、图片字节哈希与引用核对。目录0700、文件0600，忽略不入Git。独立复核发现并修复 restarting遗漏和中断恢复；两项假Docker行为测试先失败再通过。SIGINT／TERM在当前同步命令结束后走恢复，强杀／掉电需要人工命令，文档没有承诺必然自动恢复。

实际本地验证首轮：Docker build成功，migrate退出0，db和web healthy，两个worker均running。Compose冒烟通过；配套恢复通过，62张表、一张实际上传图片与原快照完全一致。验证目标清理后原四个常驻容器恢复运行；原开发库未作为恢复目标。本机一次空闲内存观察web约95MiB，两个worker各311–314MiB，不作为容量SLA。

最终镜像重建后再次冒烟通过，原数据库与第一张图片保留；第二次配套恢复通过（62 张表、2 张图片，verifiedAt 2026-11-01T03:24:57.772Z），仅临时恢复卷被清理。新增工具单元 4 项及全套 146 项通过；源码／脚本／测试行长检查 313 文件、无例外；lint 0 error／474 旧 warning，类型检查通过。最终全量串行复核：原22个npm集成脚本、workflow-customer、reporting/intake/trial/SEO及相关HTTP均通过。旧七语HTTP假设失败已单独在任务4补测提交bac71c1修正并复验；原英文业务／权限断言保留。余下backend/catalog/content/locales/trial HTTP五入口均通过，153项页面／404也通过。最后提交门禁146/146单元、lint／格式／类型／行长均通过；独立复核无阻塞问题。

最终源码any复核仍为299处／39文件，优先核心文件零any。验证后停止隔离Compose并保留卷；恢复原3000开发服务和support/workflow两个本机worker，高级／邮件／模型仍关闭。

launch-accounts.md 明确待你提供托管／数据库／DNS／网关／Resend发件域名与指定邮箱、隐私主体、管理员及备份责任。README已按“已完成／待接入／后续功能”收敛。真实发信、真实托管配套恢复、真实匿名与低权限验收均未执行，不用本机演练冒充。

## 2026-11-01 收敛与试运行准备：任务 4

新增 feature-inventory.md，逐模块列第一版范围、已验证／已实现未验证／未实现、外部依赖、试运行是否开启与开关。已实现的客户中心、语音、通话、AI 报价及内容 AI 等能力保留并明确未启用，真实邮件／模型／托管验收没有冒充本地通过。

SITE_LOCALES 默认 zh,en；显式错误配置拒绝启动，原七语模型、文案与后台预览保留。公网页面／元数据、切换器、所有已有公开内容 API 文档与 sitemap/hreflang 只展示启用语言，其余公开页面 404、公开 API 400。服务商业务“服务语言”筛选仍保留七语。服务端只向 Header 投影语言列表和客户／客服可见布尔值，关闭入口隐藏，已有服务端开关继续阻断请求。

全部客服开关改为默认 false，客户中心、邮件、AI 报价仍关闭；迁移仅改变 text_chat 数据库默认，不擅自改旧值。trial:configure 默认只预览，--apply 才在事务关闭已有高级开关并审计，不删除业务数据或改变员工权限，不在每次启动强制重置。代码复核发现 before 快照并发读取缺口，已先复现失败，再按原锁顺序持锁读取，并真实覆盖 support/customer/workflow 三组管理员未提交事务，审计均记录实际已提交前值。

实际验证：Task4 单元范围 142 项通过；check、生产 build、空库迁移通过，无新增行长例外。11 个串行入口全部退出 0：support、support:agent、support:voice、support:calls、customer、workflow、workflow-customer、七语 DB、SEO、support-http、locales-http。公开语言 HTTP 验证 12 页、10 个启用语言 API、五种关闭语言页面／API 和 sitemap 隐藏；新的 trial HTTP 验证导航隐藏、表单保留、客户／客服 API 503。支持用例显式开启后 finally 还原，没有删除原七语或权限断言。

本机实际运行 trial:configure --apply 成功，已将高级开关收敛为关闭并写审计（首次 ID1313）；后续并发测试也恢复为关闭。CI 加入纯 DB 的 test:trial。并发修复经独立复核无重要剩余发现。期间一次 check/build 并跑导致生成 types 文件被清理的临时 TS6053，已改为构建完成后串行 check 通过，未改配置掩盖。

本任务不需要购买账户。任务4推送01ee97a的两次GitHub Actions 41268617300、41268613738均确认success；任务3 c1e813b对应41267766965、41267763821也均success。此证据不替代后续提交CI。邮件、托管、网关真实验证仍待账户；任务5继续本地隔离容器验证及上线资料。

## 2026-11-01 收敛与试运行准备：任务 3

表单改为每客户端每十分钟 60 次、全站 6000 次的原子双层限流；耗尽客户端不继续扣全站额度。未配置代理时忽略转发头，用签名 HttpOnly Cookie 区分浏览器；清除 Cookie 可重置身份，此限制没有隐藏。受信 Cloudflare/nginx 仅信对应单 IP 头，额外要求网关覆盖的共享密钥证明和源站限制，错误配置 fail closed。部署文档列出真实网关必验项；没有新增外部服务接入。

两表单隐藏 contactFax 在存储、通知及配额前拦截机器人；服务商原 website 字段保留。计数只存密钥哈希。迁移新增 client_key 和复合唯一索引，保留旧 global 计数；回退仅删除临时客户端计数，不删客户记录。

无 --force 执行 npm audit fix，无兼容版本更新。移除 dependencies 的 node 包，保留 .nvmrc 24.22.1、engines >=24.22.1 <25，迁移测试使用 process.execPath。本机系统默认 Node 25，验证明确使用忽略目录保留的 Node 24.22.1；没有宣称已修改系统默认版本。审计最终全树 23 项（6 low、17 moderate），omit=dev 仍 11 项（6 low、5 moderate），均无 high/critical。deepmerge 为运行时依赖，旧 esbuild 位于生产依赖树的迁移工具链，minimatch 属 lint 开发依赖；详见 trial-deployment.md。未接受会破坏版本兼容的强制降级，剩余风险须上线前复核。

npm run dev 固化关闭 Payload HMR，保留 Next Fast Refresh；CMS 配置／schema／权限配置变化后手动重启，AGENTS 和部署文档已说明。保留客服全局锁 726280：现有测试不足以证明会话锁下跨会话额度及任务领取正确。明确容量为一个客服写入事务同时持锁、吞吐约受平均持锁时长倒数限制；文档算例不是实测 SLA。关键词计数检索的分词、同义词、多语、零分结果和截断局限已列后续，本阶段没有改 AI。

实际验证：新增身份／代理／honeypot 单元 7 项通过，全套单元 139/139 通过。真实 PostgreSQL 隔离 schema 四项通过，包括旧全局计数 42 保留、耗尽 A 不影响 B、50 并发请求全局精确 9、down 保留全局计数。HTTP 五项通过，包含两页真实隐藏字段、双表单拦截无存储通知、幂等回执、60 次后 429 且其他客户端可用、技术计数 CRUD 全 403。原 backend 13 项、HTTP 8 项、业务权限 8 项、内容权限和 support 回归通过。独立只读安全复核无重要剩余发现。

空库全迁移检查通过，另外核对 client_key 与复合唯一索引实际创建。生产构建通过；最终 npm run check 通过（lint 0 error、474 个遗留 warning，Prettier／296 个源码文件行长检查、typecheck、139/139 单元均通过）；git diff --check 通过。

网关限制、真实托管容量和真实防绕过验证仍待部署账户，不需要现在购买；本地运行未对外开放。

## 2026-11-01 收敛与试运行准备：任务 2

已增加中文经营概览 `/operations-overview`，从中文后台导航进入；周（北京时间周一）、服务类别、状态、来源和服务商申请状态均按当前员工数据范围统计。多类别咨询在各类别分别计一次；总数和漏斗按咨询去重。漏斗入口为筛选创建批次的全部咨询，已报价包括报价发出历史／quoted 或 won，已成交包括 won 或经客户确认的历史报价。没有改动原咨询状态和报价业务规则。

首次响应取咨询创建后最早的报价发出操作记录 sentAt（不表示邮件实际送达），或权限内关联客服会话中有员工身份的人工公开消息；不使用内部备注、AI 消息、普通状态更新时间推断响应。缺失历史不补零，界面显示中位数与有记录样本数／咨询总数。该指标覆盖系统可核实记录，不代表线下或未接入邮件的完整响应历史。

CSV 支持北京时间日期（首尾日均包含）、状态、类别。查询重新加载员工并沿用 Payload 原 scope，完整分页，十万条以上明确拒绝而不静默截断；统计只返回汇总。默认白名单不含内部备注、成本或原始 details/家政 JSON；仅管理员可显式包含内部备注和咨询关联报价版本／币种／最小货币单位的内部成本，服务商申请没有虚构成本字段。UTF-8 BOM、CRLF、引号/换行转义、公式注入转义均已测试。导出先写审计（员工、createdAt、筛选、字段、实际条数），审计失败不返回 CSV。

内容详情 SEO 标题、摘要、分享图仍通过内容工作台保存草稿并审核发布。新管理员设置 `/admin/globals/seo-settings` 覆盖 15 个固定页面／目录／表单，留空沿用默认内容；界面明确保存生效和所选分享图将公开。此设置仅管理员可读写，没有放宽内容编辑员的原权限。分享图沿用可见草稿的素材范围，草稿改图不影响公开快照；下架和移除固定页选择后立即撤销无其他公开引用的图片访问。

新增 `robots.txt`、canonical、分享元数据，sitemap 用真实内容身份和翻译网址生成 hreflang，不为不存在的译文伪造链接。`SEARCH_ENGINE_INDEXING` 默认 false；只有 `APP_ENV=production` 且显式为 true 才允许收录，私有后台／账号／客服页面即使正式环境也保留 noindex。新迁移 `20261101_022501_page_seo` 只增加 SEO 设置表、子表和两项枚举；已在一次性空库实际应用验证。

实际验证：

- 新 reporting 单元 4 项、SEO 单元 4 项；全套单元 132 项通过。
- `test:reporting` 真实 PostgreSQL：跨负责人／团队、停用及角色撤销、禁止非管理员敏感导出、默认字段不泄露、公式、日期边界、漏斗／响应口径和审计失败均通过；原 permissions:business 8 项及报价套件通过。
- `test:reporting:http`：匿名拒绝、真实 JWT、停用立即生效、Origin、CSV 实际 BOM 字节、默认字段和导出审计通过。
- `test:seo` 六项 PostgreSQL/HTTP 检查通过：管理员设置权限、素材板块权限、实际渲染、草稿隔离、静态页覆盖、noindex/hreflang 和图片访问撤销。夹具按原有正文／来源／管理员自审要求补齐，没有放宽发布规则。
- 最终串行 12 个回归入口全部退出 0：permissions:business、permissions:content、content、reporting、catalog、exhibitions-http、institutions-http、support-http、backend-http、catalog-http、content-http、locales-http。记录在忽略目录 `.local/task2-verification-results.json`。
- 两个独立复核分别覆盖统计导出和 SEO／权限／迁移，没有剩余发现。CI 数据库套件加入 reporting；SEO HTTP 用例需要正在运行的网站，保留为本地/部署验收入口。

已定位任务 1 的开发环境临时错误：实际捕获 TypeError `Symbol(drizzle:Columns)`，Payload HMR 重载期间数据库映射被重建；近期会话数为 0，排除了限流。开发服务临时以 `DISABLE_PAYLOAD_HMR=true` 启动后，完全相同的 12 入口顺序全部通过，未加测试重试或修改断言。临时诊断代码已移除。任务 3 将固化稳定开发启动及 CMS 配置变更后重启说明；生产模式本身不运行该 HMR。

任务 1 推送提交 f5ea0e3 的 GitHub Actions 已确认成功：push/PR 两次运行 41264600055、41264645631。该结论仅针对这个 head，不作为后续任务 CI 结果。

最终 `npm run check` 通过（lint 0 error、474 个遗留 warning，Prettier 与 290 个源码／脚本／测试文件行长检查通过，typecheck 通过，132/132 单元测试通过）；`npm run build` 生产构建通过。统计 HTTP 另验证实际浏览器同源 Cookie 可打开中文概览、页面始终 noindex；保留 Payload 的 Sec-Fetch-Site／Origin CSRF 校验。

生成器 SQL 模板的制表符和行尾空白另作小提交清理；check（132/132 单元测试）、空库迁移及 git diff --check 重新通过，SQL 结构不变。

本任务不需要购买或提供账户。Task 3–5 和真实托管环境验收继续执行。

## 2026-11-01 收敛与试运行准备：任务 1

本阶段分支 `codex/trial-readiness` 从已验证的协作配置 c3607ae 建立，保留尚未合并的 PR #1 修正，不自动合并 main。任务说明见 `superpowers/specs/2026-11-01-trial-readiness-design.md`。

基线扫描（src 下 TS/TSX/JS/MJS，含迁移）：131 个文件有超过 200 字符的行，共 699 行，最长 3358 字符；`any` 文本词元 450 次（后续按 TypeScript AnyKeyword 另报，文字和注释不算显式 any）。

已配置 Prettier 行宽 100、ESLint/typescript-eslint 与 `check` 串行入口，CI 改为每次 push 和 PR 执行。遗留显式 any、未使用变量及少数风格规则暂为 warning，类型/语法和其余推荐错误仍阻止检查；不通过删测或放宽权限消除告警。后续会逐文件清理优先服务类型，并记录剩余原因。

工具配置提交前验证：`npm run check` 通过（lint 0 error、类型检查通过、115/115 单元测试），`git diff --check` 通过。Prettier 3.9.10、ESLint 10.14.0。此提交尚未格式化业务源码。

基线夹具修正：旧 backend 集成用例补齐真实管理员、团队及 owner；support-agent 用例自行建立并清理已发布英文知识夹具，不再依赖本机种子内容。生产权限和业务逻辑不变。`npm run check` 再次通过（115/115 单元测试），22 个已有集成入口全部通过；HTTP 分支在后续单独验证。详细本机日志保留于忽略目录 `.local/`，不包含凭证。

### 任务 1：已完成的独立提交和验证

- `64c9f35`：工具与 check 门禁；提交前 lint/typecheck/115 项单元测试通过。
- `cea3af7`：历史测试夹具隔离；提交前 check、22 个已有集成入口通过。
- `d24d7b3`：**仅格式化**，311 个文件；Prettier debug-check（语法等价验证）、check、22 个集成入口、额外 workflow-customer、7 个 HTTP/语言接口入口、两个 HTTP 文档检查均退出 0。完整本机结果 `.local/format-verification-results.json`。没有修改业务规则。
- 七个旧数组文案文件改为具名字段对象；exhibition/form/public 三个文案文件原本已经结构化，保留。测试用格式化基线的完整七语言输出摘要检查每个原有字词及空格；9 项契约测试通过（含未知字段／语言原型名兜底及语音文案返回对象隔离）。公开函数输出保持兼容。
- 长字符串按段连接、长 URL 查询移出模板表达式；内容中心内联 CSS 移到同目录样式文件，样式规则保持原样。历史迁移 SQL 使用换行续接，TypeScript 解析后的十个文件全部 SQL 字符逐字一致。
- 新增源码行长门禁（200 字符）及每行最多一条语句规则；Prettier 检查加入 lint。Payload 自动生成类型和 importMap 由生成器管理，排除 Prettier 重写，源码行长检查仍覆盖 src。

优先服务已按指定顺序完成，每文件完成后才进入下一文件，类型检查与相关测试均退出 0：

| 文件阶段                   | 实际相关测试                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| intake                     | integration（13 项）、catalog、housekeeping                                                                                                                   |
| customer/service           | customer、workflow-customer（内存 Payload 替身）                                                                                                              |
| support/service            | support、support:agent、support:operations:db、support:voice、support:calls                                                                                   |
| business/service           | business、business:ai；三个 find 结果补 assert.ok，强化旧测试                                                                                                 |
| workflow/service           | workflow（PostgreSQL）、workflow-customer；最终复跑通过                                                                                                       |
| CMS access、各 collections | 每个文件完成后 permissions:business、permissions:content、content、housekeeping；客户／客服／报价／工作流配置还运行对应业务套件，最后再复跑四组权限／内容套件 |

PostgreSQL 事务会话依据实际适配器类型访问。Payload 的 createLocalReq 会修改传入请求，工作流保持原代理每次操作创建全新 transaction request 的隔离方式，未共享已变更的 user/context。没有改变锁顺序或权限表达式。两个独立复核分别覆盖文案排版与类型权限；发现的文案兜底问题已补回归测试并修复，复核无剩余发现。

最终 `npm run check` 通过：lint 0 error（474 个遗留 warning）、Prettier 通过、275 个源码／脚本／测试文件行长通过且无例外、typecheck 通过、124/124 单元测试通过；`npm run build` 生产构建通过。源码 AST 显式 any 清单如下。

最终 HTTP：business-ai、exhibitions、institutions、support、locales、backend、catalog、content、locales-http 各入口均有退出 0 的结果；语言脚本覆盖 42 个页面及 14 个公共 API。开发服务持续热重载期间，第一轮 support 曾 400、第二轮 catalog 图片读取曾 404；两条独立复跑通过，未修改断言或添加重试。保留失败与成功日志，尚未稳定复现或确认根因，Docker 生产模式验收时再次检查，不能把本地结果视为云环境已验收。生产构建通过，浏览器确认内容中心提取后的样式已实际加载。

本任务不需要购买或提供账户。剩余 299 个非优先文件显式 any 属于后续类型债务，清单如下；本阶段不继续扩大为全仓业务重写。任务 2 至任务 5 尚未在本节声明完成。

### 任务 1：剩余显式 any 清单

统计口径为 `src` 下 TS/TSX/JS/MJS 的 TypeScript AST `AnyKeyword`，不计注释、普通文字、测试/脚本及仓库根目录生成类型。基线 **443** 处；本次清理后 **299** 处，分布在 **39** 个文件。任务书指定的五个核心服务、CMS access 和各 collections 文件显式 any 均为 **0**，并以 ESLint error 防止回退。其余文件保留 warning，不伪称全仓清零；剩余原因逐文件如下。

| 文件                                               | 数量 | 剩余原因                                                                      |
| -------------------------------------------------- | ---: | ----------------------------------------------------------------------------- |
| `src/app/(frontend)/[locale]/[[...slug]]/page.tsx` |    1 | 旧路由入口的 JSON/可选对象类型；边界运行时校验保持原样                        |
| `src/app/(frontend)/api/content-center/route.ts`   |    1 | 旧路由入口的 JSON/可选对象类型；边界运行时校验保持原样                        |
| `src/app/(frontend)/api/customer/route.ts`         |    1 | 旧路由入口的 JSON/可选对象类型；边界运行时校验保持原样                        |
| `src/cms/housekeeping-fields.ts`                   |    2 | 非本次优先 collections 权限函数的 hook、字段条件或适配器对象，保留原有校验    |
| `src/cms/quality/hooks.ts`                         |    1 | 非本次优先 collections 权限函数的 hook、字段条件或适配器对象，保留原有校验    |
| `src/cms/staff-guards.ts`                          |    1 | 非本次优先 collections 权限函数的 hook、字段条件或适配器对象，保留原有校验    |
| `src/cms/support/operations.ts`                    |    1 | 非本次优先 collections 权限函数的 hook、字段条件或适配器对象，保留原有校验    |
| `src/cms/support/settings.ts`                      |    1 | 非本次优先 collections 权限函数的 hook、字段条件或适配器对象，保留原有校验    |
| `src/components/business/BusinessAI.tsx`           |   13 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/business/BusinessDesk.tsx`         |   10 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/business/QuoteReview.tsx`          |    3 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/content/CatalogFields.tsx`         |    2 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/content/ContentCenter.tsx`         |   27 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/customer/CustomerPortal.tsx`       |   12 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/quality/QualityCenter.tsx`         |    6 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/support/CallPanel.tsx`             |   11 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/support/SupportChat.tsx`           |    7 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/support/SupportDesk.tsx`           |   14 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/components/support/SupportOperations.tsx`     |   10 | 旧界面状态、表单及 API 返回投影尚未统一；本次保留交互行为，后续逐组件收紧     |
| `src/lib/business-ai.ts`                           |    5 | 运行时输入校验器与兼容投影尚未全面细化，避免把类型清理扩大为业务改动          |
| `src/lib/business.ts`                              |    5 | 运行时输入校验器与兼容投影尚未全面细化，避免把类型清理扩大为业务改动          |
| `src/lib/calls.ts`                                 |    2 | 运行时输入校验器与兼容投影尚未全面细化，避免把类型清理扩大为业务改动          |
| `src/lib/housekeeping.ts`                          |    1 | 运行时输入校验器与兼容投影尚未全面细化，避免把类型清理扩大为业务改动          |
| `src/lib/quality.ts`                               |    8 | 运行时输入校验器与兼容投影尚未全面细化，避免把类型清理扩大为业务改动          |
| `src/lib/support.ts`                               |    2 | 运行时输入校验器与兼容投影尚未全面细化，避免把类型清理扩大为业务改动          |
| `src/server/business/ai.ts`                        |   20 | AI 草稿与旧 hook 的 JSON/事务接口；基础报价服务已清零，扩展能力本阶段保持关闭 |
| `src/server/business/hooks.ts`                     |    3 | AI 草稿与旧 hook 的 JSON/事务接口；基础报价服务已清零，扩展能力本阶段保持关闭 |
| `src/server/catalog/eligibility.ts`                |    7 | 发布快照 JSON 与旧事务适配器类型，保留现有资格核验逻辑                        |
| `src/server/catalog/source.ts`                     |    1 | 发布快照 JSON 与旧事务适配器类型，保留现有资格核验逻辑                        |
| `src/server/content-agent/service.ts`              |   14 | 内容 AI 任务与网关候选 JSON 接口，未启用真实模型，不扩大本阶段重构            |
| `src/server/content/service.ts`                    |    9 | 内容发布/质量复核 JSON 与旧 hook 的动态输入类型，保留原有审核和发布隔离       |
| `src/server/quality/service.ts`                    |   14 | 内容发布/质量复核 JSON 与旧 hook 的动态输入类型，保留原有审核和发布隔离       |
| `src/server/support/agent.ts`                      |   14 | 扩展语音/通话/AI 及运营任务的 JSON、协议和适配器边界，待逐模块测试收紧        |
| `src/server/support/callGateway.ts`                |    1 | 扩展语音/通话/AI 及运营任务的 JSON、协议和适配器边界，待逐模块测试收紧        |
| `src/server/support/callService.ts`                |   25 | 扩展语音/通话/AI 及运营任务的 JSON、协议和适配器边界，待逐模块测试收紧        |
| `src/server/support/features.ts`                   |    3 | 扩展语音/通话/AI 及运营任务的 JSON、协议和适配器边界，待逐模块测试收紧        |
| `src/server/support/operations.ts`                 |   29 | 扩展语音/通话/AI 及运营任务的 JSON、协议和适配器边界，待逐模块测试收紧        |
| `src/server/support/voice-jobs.ts`                 |    7 | 扩展语音/通话/AI 及运营任务的 JSON、协议和适配器边界，待逐模块测试收紧        |
| `src/server/support/voice.ts`                      |    5 | 扩展语音/通话/AI 及运营任务的 JSON、协议和适配器边界，待逐模块测试收紧        |

- 2026-10-26: 用户同意技术与视觉方案；执行完整页面预览阶段。
- 决定：依照用户“分阶段推进”的指示，本轮先交付可审核整站；数据库、后台及外部服务进入后续阶段。
- 决定：空仓库在当前工作区实现，不复制空工作树，不触及任何现有产品代码。
- 本轮不购买、不发布、不收集真实客户数据。
- Task 1: complete — 双语页面与路由、七类服务、六篇指南及公共页面完成。
- Task 2: complete — 两套分步表单、条件字段、校验与明确不保存的预览反馈完成。
- Task 3: complete — 生产构建、11项回归测试、50项页面/404检查通过；桌面及390像素手机浏览器检查完成。
- 独立审查3项问题已修正：隐藏日期校验、取消类别后核对字段、根级404结构。
- 后续待实施：真实数据库、Payload后台、权限、通知、报价、AI、备份恢复及正式发布。

## 2026-10-27 本地后台基础节点

用户批准本地开发→Replit试运行→按需要迁移云平台。已接入真实 PostgreSQL 与 Payload 中文后台，完成员工权限、两类表单保存、咨询分配跟进、服务商申请审核字段、待配置通知、审计与历史版本。密钥与管理员密码仅留在本机忽略目录。

本次完成的是第一批的首个后台节点；上方“后续待实施”中的数据库、基础权限、备份恢复已在本节点实现。内容发布、报价、真实通知、统计、AI和正式部署仍未完成。验证证据及限制见 `local-backend-verification.md`，启动与操作说明见根目录 README。

## 2026-10-27 内容中心与AI任务

用户确认开发实施计划。已建立中文内容工作台、48条历史内容工作稿、审核发布/下架/预览/版本恢复、图片权限、内容化前台、AI任务未配置入口及受控执行器测试。真实模型接入和常驻worker仍待账户与额度明确后实施。独立审查4项问题已修复。详情见 content-agent-verification.md；实现取舍和剩余边界见 content-agent-ledger.md。
