# 当前开发交接

日期：2026-11-08（Asia/Shanghai）。这是换电脑和继续开发时先读的入口。

## 最新交接：任务A本地测试环境补齐（2026-11-08）

- 分支codex/local-test-demo从PR22合并后main 8ac456c3cc0e032456b2ec3a10a58c4c644fb5a5建立。用户已批准种子范围、虚构国替代和待审报价留F；本轮任务A一个PR，不再单开清单PR。
- local:start/stop/reset及start.command已补；首次专用库跑既有迁移，PG15/16检测及PG_VERSION匹配，旧库不跨版本升级；普通启动保留编辑，旧样例须显式reset才更新。备份数据库及图片在.local/backups/demo-*，账号在.local/test-accounts.txt（0600）。原demo命令仍兼容。
- 5页3服务5指南3展会3政策中英发布共38快照，另政策/指南各1条待审；5咨询3非公开申请2服务单2未发出人工草稿5账号。manager仍无reviewer/admin角色，服务商合作状态权限不扩。运营与新人各看本人2/1条咨询，主管团队5条；成本过滤集成通过。
- 可选local:start -- --lan只绑定私网地址；浏览器实测私网表单发现crypto.randomUUID在HTTP不可用，改为有native则沿用、否则getRandomValues生成UUIDv4；新增两条RED→GREEN，服务端规则不改。私网虚构咨询保存成功并获编号；最终已配套备份重置回初始数据，恢复127.0.0.1:3100监听。
- 本机Node24.22.1 check225/225、lint0错误/465既有警告、类型/源码行长通过；专用五账号集成及迁移/重置/重复启动通过。原.env、5业务表整行摘要及12图SHA与本轮开始一致，原3000/55438保留。PG16仅选择和匹配用例，未安装PG16实跑；干净Mac10分钟、新人/外国朋友真机未验；无新增依赖/schema/产品权限变更。
- 开发浏览器390/1440首页、服务页、免签、表单截图在.local/evidence/task-a，不进Git；私网XY查询2027-02-15显示尚未确认，过境资料含第三国条件。不是真人3分钟/10分钟结果；截图远端附件状态以PR实际说明为准。
- 用户追加决定已写master-plan/editor-ux/customer-fixes：E=P0+P1（含主管服务商审核原因/审计/权限测试）；P2在G后；D回执后台可配中英1工作日承诺，本轮未实现D/E。C10真实移动网络计时部署后；同Wi-Fi操作与安全/关闭方法见指南。
- 德美真实C1/C2仍未验；A“待审核报价”按用户例外未完成，留F；C9真实主体文本待用户/律师。B/C/D/E/F/G等不提前实现。实际提交/PR/CI及独立复核见最终交接，不自动合并或部署。

## 最新交接：开发总指令原文归档（2026-11-08）

- 用户新总指令为当前顺序依据：[总指令](tasks/2026-11-08-master-plan.md)、[其他录入界面](tasks/editor-ux.md)、[员工工作台](tasks/staff-workbench.md)、[客户端修复](tasks/customer-fixes.md)。总指令完整含附录，另三文件分别摘出，仅统一Markdown排版，不修改原文要求或已合并的政策录入、共用事实和报价方案。
- 从最新origin/main `3c419444c0f97caa3ef6937f8c41d01905607bd4`创建`codex/master-plan-docs`。仅文档，不实施A–H、不清理数据、不启用服务。用户选择先自行合并PR21；现已实核合并提交96f644f9f85c28474a5e677cf3a41f2e16b5082d。文档分支正常合并最新origin/main，保留双方记录、不强推；再经check后单独开文档PR，不带入额外实现。
- 顺序：文档 → A本地启动补齐 → B政策P0第2–6条 → C共用事实 → D客户端修复 → E其他录入P0 → F报价分项及全部报价二审 → G工作台 → H订阅。11月30日不再是上线日期；上一步PR合并后才开下一步，业务代码400行上限不计测试/迁移，新依赖须先问。
- PR21已有本地演示只是A的部分成果，不能称为新A全部完成。后续需核对local:start/stop/reset及start.command、PG15/16、自动打开浏览器、.local/backups、5账号及test-accounts.txt、各类已发布内容及数量、演示主体标记和不同政策状态；如修改现有种子脚本，先说明文件/数据/安全范围再实施，不改业务schema以凑演示。
- 当前附件仅引用《华伴本地测试清单》C1–C10/E1–E10，没有各编号原文；进入A场景映射前需要用户提供清单，不能自行编造对应关系。干净Mac10分钟、新人实测与开发自测分别记录；截图附件能力不足时明确未上传，不能用本机路径冒充PR附件。
- 停止点继续有效：A改种子/结构先说明；C列虚构清理清单且遇真实/已部署即停；E状态进度先方案；G投诉/纠错口径先确认；H群发C；所有新增依赖/外部服务/费用先问。外部AI/邮件/语音/通话/群发和代收保持关闭。
- 最新main上完整check217/217、lint 0错误/465条既有警告通过，详细结果见本轮progress；纯文档没有新增可测页面或场景，不需local:reset，不要求截图、迁移或数据库集成。原环境、演示副本和密码文件不进入提交。最终推送head和PR状态以交接实核。

## 最新交接：本地一键演示（2026-11-08）

先看[一页本地测试指南](local-testing-guide.md)。用户批准独立演示方案；先本地做到客户友好、编辑友好，每PR合并后由用户亲测，之后才考虑部署，11月30日不再是上线日期。

- 新分支`codex/local-demo`从PR20合并后的main `3c419444c0f97caa3ef6937f8c41d01905607bd4`创建，原工作区干净，保留旧分支与本机环境。最终head/PR/远端CI见最终交接实核。
- `npm run demo`或双击根目录`华伴演示.command`；`demo:stop`关闭，`demo:reset`输入RESET恢复初始状态。网站3100、专属PG15实例55442；源代码副本、媒体、Next缓存及凭据均在`.local/demo`。每次重新启动同步代码、保留数据库；不复制原.env，不改生产配置。独立hua-demo Cookie避免覆盖原站登录。
- 首次创建4个随机密码测试账号，运营兼内容编辑，权限沿现有逻辑。政策/指南/展会各4份中英工作稿，其中6份由运营提交、审核人发布；3条咨询、2个服务单和2份草稿报价。高级服务/客户中心关闭，不启动worker。人工报价二审仍是后续功能，未在本轮提前实现。
- 实测首次初始化、重复启动、关闭再启动、浏览器保存修改后重启保留、取消重置及确认重置；重置前配套备份，恢复后四账号和权限集成通过。管理员无原因自审拒绝、有原因例外通过。浏览器运营登录、政策保存、报价成本隐藏及公开虚构政策可见。截图仅`.local/evidence/local-demo`，未上传PR附件，不进Git。
- 完整check217/217，lint 0错误/465警告（无增加），407源码行长无例外。原库只读指纹前后相同：411工作稿/217正式、236咨询、51报价、302员工、12图片，原.env哈希不变。未重跑生产build或完整旧DB套件；未改变业务权限、schema、依赖版本或旧政策CLI限制。
- 全分支复核及一轮修复完成：首次建库中断目录只保留不删除，完成标记阻止误重建；独立副本真实中断恢复、取消reset退出0、错误PG_BIN的脱敏control.log通过。已完成库损坏/不明启动记录拒绝自动移动；不要手工删state.json绕过。新增3条回归后check217/217，正常演示重新启动并再验权限；原库及媒体指纹仍一致。
- 最新顺序：本地演示亲测 → 政策P0第2–6条 → 共用事实 → 其他录入界面P0 → 报价分项与所有报价二审 → 员工工作台 → 订阅。其他P0的状态/进度联动仍先方案确认。原日期排期仅历史估算，按实际亲测进度重估。不自动合并、部署、购买。

## 历史交接：政策录入与报价方案文档（2026-11-08）

- PR19已核实合并，main提交为`d49af6e88201498471f115e5e4866bd6a995d840`，包含原任务head `d77450909a841878beffbae45b8aec61e0b07ffa`。已从该最新origin/main创建并切到`codex/policy-entry-docs`，旧本地分支保留、不再用于开发；远端旧分支和PR1–18由用户处理，不代删。
- 本轮仅文档：[政策录入任务](tasks/policy-entry-ux.md)、[共用事实方案](tasks/2026-11-08-policy-shared-facts.md)、[报价方案及用户补充](tasks/2026-11-08-quote-lines.md)。报价已含自营锁定默认值、名单/手填来源、默认关闭的代收及逐项确认、提交校验、主管毛利视图，以及用户新增的所有报价发出前第二人审核规则。
- 用户已审阅PR20，并于2026-11-08明确批准共用事实方案及简化迁移。等文档PR合并后，先从最新main做政策P0第2–6条，合并后紧接第1条单独PR，再做报价和订阅。业务超过400行拆分，逐PR合并，不预开叠加分支。
- 第1条本次仅备份后清空虚构测试政策并在新结构重建，不做人工配对/新旧对照迁移；真实数据无损迁移步骤留作日后使用。当前文档修订未执行任何清理。所有报价含人工报价须在发出前第二人审核，禁止自审、管理员例外须原因，与报价分项一起实施。
- 排期估算：第2–6条2–3个开发日，第1条4–5个开发日，另留1–2天缓冲；若PR20在11月9日前合并、后续评审及时且新人验收可配合，可按11月20日前完成验收合并排期。依赖和里程碑见任务说明，未完成前不录入真实政策。
- 本机Node24.22.1下`npm run check`通过：207/207单元，lint 0错误/465条既有警告，未增加；纯文档未重跑数据库集成、浏览器或构建，不把方案验收项写成已实现。
- 无代码、依赖、迁移、环境变量或数据库变更。未启动worker，未启用真实AI/邮件/语音/通话，未购买、部署或自动合并。实际推送head、PR及远端检查以最终交接实核。

## 最新交接：PR19收敛与手机阅读（2026-11-07）

先看[一页中文小结](project-status-2026-11-07.md)。用户确认PR19唯一整合入口：沿用codex/local-basic-acceptance，不重写已验证43提交，不再新开叠加PR。PR1–18均为当前历史祖先，合并后核对再关闭；不自动合并。最终head/CI以PR19说明及交接消息实核。

一次只读增量复核无Critical/Important；无dotenv/秘密单元207/207、279源码指纹、8截图及完整Lighthouse报告核对通过。延期Minor两项：手动折叠后的无效提交/部分改输入不自动重开（仍可手动展开）；证据包浏览器摘要保留评分前提示，上传前需整理。二者尚未修复，具体裁定及代价见progress本轮复核小节。

- 缺密钥测试206/207已修成专用假配置隔离，原生产校验不变；同条件与完整check均207/207。
- 手机完整资料卡片、查询后可折叠参考、键盘focus-visible跳转通过；四套静态渲染、trial构建、开/关生产HTTP及发布下架通过。中文390/无JS320、英文390/桌面1440实测；两语本机移动Lighthouse100/100，非真实内容/托管/真机认证。
- 50份旧图片/JSON先SHA校验归档，再移出当前版本；固定历史链接见[证据索引](screenshots/README.md)，不重写Git历史。新证据/压缩包在.local/evidence/review-consolidation，仅本机；连接器不支持上传、网页未登录，尚未上传PR附件。
- 无依赖/schema/实际.env/权限或查询结论变化。原库不写测试数据，隔离PG55441/生产预览已停止，原站3000恢复；worker不启动，外部AI/邮件/语音/通话保持关闭。
- [阶段2分步设计](subscription-phase2-design.md)仅文档：PR19合并后先核对已有2.1，再依次2.2a/2.2b/2.3/2.4；每PR合并再开下一步。群发停止点C、部署停止点B不变。

## 历史交接：家里电脑续验（2026-11-07）

- 接手分支codex/local-basic-acceptance，起点3fef2bbdacfd02645bac186a13e425f9f298b1f5；继续草稿[PR19](https://github.com/yaemart/huacompanion-ai/pull/19)，不合并。最终head/CI见PR说明与本次交接消息。
- CLI通过独立PG目录、同受保护端点的副本完成整组；原CLI限制未改。Edge原生退回取消/确认、编辑重提/发布/下架闭环及390手机两表单、后台跟进/统计CSV/人工报价已验证。
- 三项小修：取消退回不提交；合作申请摘要去掉客户默认人数/语言；CMS600px以下元数据/面包屑不挤出页面。check207/207、相关七回归与生产build通过，完整证据见[本地验收](local-basic-acceptance.md)家里续验小节。
- 家里原库66表/12图备份backups/local-1794050284123.dump及.media；隔离目录.local/home-acceptance-20261107/postgres只作测试。原库已恢复，事务应用已有搜索迁移20261102_050750_visa_search，66表原列指纹和12图SHA保持，411工作稿/217正式快照保留，未导入其他电脑内容或临时账号。旧local标记不重放。
- 默认原库网站3000已恢复；客服/客户中心/外发邮件/AI/语音/通话仍关闭，原workflow有319历史open任务，本轮不启动两个常驻worker。无新依赖/迁移文件/实际.env变更；不购买、不部署、不接统计。
- 一次独立增量复核207/207；经营截图证据缺口已补正，两张CDP分屏可读、CSV再次通过，备用隔离库/站已停止。没有遗留阻断项或延期Minor；全部裁定/边界见本地验收记录。
- 未验：真实模型/邮件/语音/通话/客户邮箱验证、真机及全面跨浏览器、Render及真实云端配套恢复/公开B；下一步按实际本地使用发现的问题继续，不误回到已完成1.5任务。

## 最新交接：本地基本操作验收（2026-11-07）

- 用户暂停 Render 购买部署，先本地验收。当前任务分支 `codex/local-basic-acceptance`，从远端 main 建立后快进带入 98e6cf3 的完整现有功能；main 仍落后前置 40 个提交，不自动合并。
- 详情见 [本地验收记录](local-basic-acceptance.md)。check 204 单元、生产构建、29 组数据库集成、3 组 HTTP、70 个七语言页面通过。政策 data 套件的 CLI 因隔离库名称被保护拦截，整组退出 1，未放宽限制。
- 修复旧备份恢复报告漏验 24 张表：改为动态核对全部 public 表。修复前覆盖断言失败，修复后 66 表/8 图一致；新增 `test:backup:coverage`，在 `backup:test` 后执行。
- 原库配套备份 `backups/local-1794032031292.dump` 及 `.media`；业务测试使用独立副本 `hua_companion_acceptance_20261107`，不要把副本数据迁移上线。原库 402 条工作稿、153 条正式内容、8 图保留。
- 无新依赖、迁移、实际 .env 变更；保留原 next-env.d.ts 开发路径，不提交。实际分支提交、PR 与服务状态见最终交接。
- 默认中英文，另外五语只临时进程测试。外部 AI/邮件/语音/通话仍未真实接通；Render、公开发布仍暂停。

## 最新交接：阶段1.7本地准备（2026-11-03）

- 任务分支 `codex/render-trial-preparation` 基于阶段1.6 `69a67d96e41f7ca6269e4b41896ec8268275f704` / PR17；继续依赖草稿PR链，不自动合并。当前head/草稿PR/CI以最终交接核对。
- 新增 [Render准备包](../deploy/render/README.md)：三个Docker服务、PG15、Web独占持久图片盘、手动部署、Web单点迁移、worker默认待命；模板在 `deploy/render/blueprint.json`，不是已创建资源。官方JSON Schema本地校验通过，不等于平台部署验证。
- 受限入口使用独立基础访问口令，员工仍须后台登录；缺失/错误配置拒绝访问，所有页面/API/静态资源受控，只有不含业务数据的存活探针例外。维护模式阻断应用但仍须另停worker/CLI。启动检查阻止收录、真实表单、邮件/模型误开启。
- 无新依赖/数据库迁移，实际.env未修改。新增可选TRIAL_ACCESS_REQUIRED/USER/PASSWORD、TRIAL_MAINTENANCE、TRIAL_WORKERS_ENABLED，Render模板启用门禁并保持业务功能关闭。本机按用户临时预览授权继续开启免签工具，仅本机、不收录；这是进程环境，不是持久默认。
- 本机无Docker，镜像及平台磁盘权限/备份/真实恢复待验证；备份自动化/异地保存/调度与资源费用、实际账号需用户确认。仅受限部署准备，不宣称1.7全部完成；公开前仍须B确认。当前普通图片可用，Next图片优化器受门禁阻断，未来采用时须另行适配。
- 本机原有next-env.d.ts的开发路径改动是预览自动生成，已识别保留，不计入本任务提交。其他电脑按既有迁移链先备份再同步。

## 最新交接：阶段 1.6 搜索基础（2026-11-02）

- 当前任务分支 `codex/visa-search-basics`，基于 `fe5956ec025dac23092b8ee8f42251127a21dd74`。前置 1.5 已推送并建立草稿 [PR16](https://github.com/yaemart/huacompanion-ai/pull/16)，因此下方“未推送”仅为历史记录。本步草稿 [PR17](https://github.com/yaemart/huacompanion-ai/pull/17) 以 `codex/visa-policy-reminders` 为 base；前置合并后改指 main 重验，不自动合并。最新完整提交及远端 CI 见本次交接消息。
- 已实现工具管理员 SEO/分享图/Google 验证码配置，导航、sitemap、hreflang、llms 统一受工具开关和中英范围约束；政策原始记录不生成公开详情 URL。Google 字段只接受验证码文本，不接受 HTML。未连接真实 Google 账户，也未部署或接统计。
- 实际 `.env` 未改，工具默认关闭；local/trial 保持 noindex，正式索引仍要求 production 和显式收录开关。新字段本身不启用收录。默认品牌图片不含政策事实；后台指定工具图片受既有媒体权限及工具开关控制。
- 新迁移 `20261102_050750_visa_search`：增加工具 SEO 枚举及可空验证字段。升级前配套备份 `backups/local-1793596007023.dump` 与 `.media`；空库及备份克隆 up/down/up 通过，本机事务升级保持原 66 表原列数据指纹。已有验证码或工具 SEO 行时 down 明确拒绝，须先人工处理配置，不能静默删数据。其他电脑先备份、核对迁移记录，再升级；不要覆盖本地库或重放已应用旧迁移。
- 无新依赖或环境变量。Node 24.22.1 路径及本机 PG15 配置沿用下文。本机原内容为 399 条，历史另一台电脑 116 条不代表本机；本轮既有权限回归按原脚本保留 3 条非公开测试稿（当前总数 402），相关测试员工已停用。新增搜索测试账号/媒体已清理，SEO 测试配置已恢复，后台使用现有账号验收并退出。
- 本地 check 199 单元、生产构建、迁移、SEO/政策查询/内容权限及开关 HTTP 通过；截图见 [搜索验收](screenshots/visa-search/README.md)。本轮未重跑 Lighthouse，不代表真实内容或托管环境已验收。默认关闭的开发网站及两个 worker 已恢复。
- 下一阶段 1.7 真实托管/恢复验收需外部账户与授权，本次不执行；公开仍须停止点 B 确认。

## 本机接手与阶段 1.5（2026-11-02）

- 已核对家里交接 `d1f2fe8aa3f880d344de2dd61a279851324904c4`；本机原分支干净，保留 `codex/local-backend`，从交接建立 `codex/visa-policy-reminders`。
- 本步仅本地开发；未推送、未建 PR、未合并、未部署、未接统计或购买服务。下方 PR15 是前置交接记录，不是本步 PR。
- 1.5复用正式快照、站内通知/待办和 worker；30/7天版本幂等，补跑历史30天留痕但仅通知最新7天，失效负责人清空，管理员可分配。草稿不影响正式期限；下架/正式新版替代关闭旧任务；从不创建邮件任务。
- `VISA_CHECKER_ENABLED` 默认关闭不扫描；`quality-due` 关闭只阻止新建，已存在的政策任务仍维护状态。无新增依赖、环境变量或迁移。
- 本机 PostgreSQL15 原库已配套备份及恢复验证：`backups/local-1793592275984.dump` 及 `.media`；五项交接迁移先在独立克隆验证，再事务应用本机，原60表原列数据指纹不变。保留原 local 迁移标记，勿重放全迁移。忽略目录 `.local/handoff-upgrade-result.json` 有记录。
- Node24.22.1 在 `.local/node24/bin/node`；本机系统默认仍24.13.0。运行前 `export PATH="$PWD/.local/node24/bin:$PATH"`；其他电脑使用自己的版本管理器。已按锁定依赖 `npm ci`。
- 旧本机客服/客户中心/外发邮件开关经 `trial:configure --apply` 关闭并审计，保留业务内容。真实模型未配置，政策功能仍关闭。不是拷贝家里数据库或图片。
- 后续独立步骤是1.6搜索基础；1.7真实托管验收与公开B仍未完成。阶段1.5的最终本机验证见 progress.md。

## 当前生效任务与停止点

- 最新权威需求为 [流量入口分阶段任务书](traffic-entry-task.md)，已取代旧“收敛与上线准备”和“补充任务”。旧实施记录仅保留为已完成工作的证据。
- 当前分支codex/visa-policy-banner，依赖草稿[PR14](https://github.com/yaemart/huacompanion-ai/pull/14)的5b106e2b2304996f8b8903073dd45685abdbb21e；基准push/PR CI已成功（41317987176、41317991206）。本步草稿[PR15](https://github.com/yaemart/huacompanion-ai/pull/15)，当前head完整SHA/CI见最终交接，不能沿用基准结果。依赖顺序PR2→3→4→5→6→7→8→9→10→11→12→13→14→15，前置合并后改指main重验，不自动合并。
- 阶段1按[开发计划](traffic-entry-phase1-plan.md)渐进交付。1.1政策流程、1.2纯查询及1.3a/b/c SSR/浏览器查询/正式FAQ与本机移动审计已验证。后台入口/content-center?kind=immigration-policy仍需开关和显式授权，通用集合CRUD仍关闭。工具默认404/noindex，无公共原始数据API。1.4正文政策横幅已本地验证；下一步1.5站内复核提醒；现实内容/部署/恢复及公开B仍待完成。
- **停止点A已由用户于2026-11-01确认**：Render，以及Cloudflare Web Analytics加站内每日事件汇总。用户明确当下只继续本地开发测试；不创建账户、不购买、不部署、不接统计代码。无个人标识的有效行为次数口径按已确认方案说明执行，不宣称独立访客人数。

## 既有基础版本与证据

- 基础分支 `codex/trial-readiness`，同一时间只由一台电脑修改；草稿 [PR #2](https://github.com/yaemart/huacompanion-ai/pull/2)，不自动合并或部署。
- 本阶段按用户任务说明完成收敛代码与本机部署准备；真实试运行账户未提供，邮件实发、托管恢复、真实环境权限与网关仍待验收。不要将代码交付解释为正式上线。
- 分支包含尚未合并的 PR #1 协作／CI 基线；任务1 f5ea0e3、任务2 388ea6a（迁移格式7c191cf）、任务3 c1e813b、任务4 01ee97a。纯格式化独立提交为 d24d7b3。
- 最终任务5及补测提交以 `git log`／交接消息核实完整 hash，不在本文件虚构自引用 hash。每个 head 的 CI 需单独核对，不能沿用旧结果。
- 完整需求／计划：`superpowers/specs/2026-11-01-trial-readiness-design.md`、`superpowers/plans/2026-11-01-trial-readiness.md`；实际验证见 `progress.md`。

## 当前行为与剩余事项

1. 可维护性门禁已建立：check 串行 lint、typecheck、单元测试；核心指定文件 any 清零；本轮又清理内容发布服务9处，剩余数量与原因见 progress，无超过200字符的源码行例外。
2. 中文 `/operations-overview` 按员工范围统计／导出，CSV敏感字段仅管理员显式选择，导出先审计；没有改报价规则或客户授权。
3. SEO固定页由管理员在 `/admin/globals/seo-settings` 编辑，内容详情仍走草稿审核发布，图片沿用访问边界。trial默认noindex，正式环境也需显式收录开关。
4. `SITE_LOCALES` 默认 en,zh，其余五语的公网URL/API关闭，后台与代码七语保留；客户中心、全部客服／语音／通话、AI报价、外发邮件默认关闭。已有库运行 `trial:configure` 先预览，`--apply` 才持锁关闭并审计；不是启动时反复重置。
5. 表单客户端60／全站6000每十分钟；未配可信代理只用签名浏览器Cookie，能被清除重置。启用代理要求网关覆盖秘密头与权威IP并实际防绕过；目前没有宣称真实网关验证完成。
6. Docker三应用进程／PG／图片卷已在本机隔离启动、冒烟与两次配套恢复（最终62表、2图）通过；测试容器已停止并保留卷。不得把虚构测试卷复制上线。
7. 推荐 Render，备选 Railway + Neon，仅给方案／预算，未购买。账户、隐私主体、指定收件人及费用决定见 `launch-accounts.md`；真实验收条件到位后继续，不自行开放表单或正式发布。

## 环境与数据

- 1.4无迁移/新依赖/新环境键/实际.env变化。正文policy-banner引用稳定contentKey，不是私有数字ID；只从同语正式快照及前次正式publish审计推导延长，近30天优先到期、无证据正常远期不显示，手动待确认沿文章审核。两语三状态桌面/390手机无JS、后台指南权限账号保存/预览/重载通过，账号已退出，截图见screenshots/policy-banner。多电脑先同步代码，旧版本不能重存新块。194单元/check、四渲染、生产build/开关HTTP、content/permissions:content/policies:workflow/query DB及trial HTTP退出0，清理/恢复和复核见progress。未重跑Lighthouse，不宣称现实政策/托管验收；下一步1.5，不部署/接统计。

- 1.3c无schema/新项目依赖/实际.env修改；新增可选VISA_FAQ_CONTENT_KEYS仅示例，逗号精确选择同语言正式faq；正文纯文本块、每来源HTTPS+核实日，未配置/未发布/下架/不完整不造数据，空FAQ无schema。FAQ仍是既有通用公开内容，不是全站保密开关。用户明确批准临时官方Lighthouse13.6.0，安装在.local/lighthouse-tool，不进入package/锁。生产中英mobile412×823、默认4G模拟/CPU4倍放慢性能/可访问性均100；初始英文100/97的对比度和品牌可见名称问题已实际修复复测。报告/手工键盘/390/320无JS截图见screenshots/visa-checker-accessibility；未实跑VoiceOver/NVDA或所有系统缩放/跨浏览器组合，真实内容和托管后重测。
- 本步check190单元、三套静态渲染、生产build、七语开关HTTP及政策/指南/FAQ发布改稿下架、query DB/trial HTTP退出0；源码any仍290/38，行长无例外。虚构政策/版本/工作稿/快照/FAQ/指南/临时账号/授权0，原稿116保留、flag关闭。默认dev和两worker恢复，support无模型转人工，workflow0提醒/处理。独立复核无Critical/Important/Minor，另跑190单元/三渲染并查看原始报告，未重跑DB/HTTP/build/浏览器/CI。源码提交2d1fb0664cb3bce3267cce14838151be0390492b已与构建源码指纹核对；最终文档提交不冒称重新跑过Lighthouse。当前head远端/CI另核，不能把本地审计当上线验收。

- 1.3b无新迁移/依赖/服务/实际.env变化；.env.example新增可选VISA_GUIDE_CONTENT_KEY，只从listPublished精确匹配同语言guide，未配置/未发布/下架没有特定链接，不能随便选文章。国籍/入境日只在浏览器局部state，水合前禁用且无form/name，输入改变清空旧结果，SSR表保留。check186单元、静态控件/结果渲染、生产build、生产开/关HTTP及真实指南发布/下架、query DB和trial HTTP已通过。实际浏览器中英键盘/未知/过期/无JS及390手机通过，0查询网络/日志/异常，网址及非敏感存储摘要不变；未读取保留完整Cookie/存储值，限制见screenshots/visa-checker-browser。临时政策/版本/草稿/快照/指南/账号/授权0，原稿116保留、实际flag关闭；默认dev及两worker恢复，support转人工，workflow0提醒/处理。AST any仍290/38。独立复核无Critical/Important/Minor，另跑186单元及控件渲染；未代跑DB/HTTP/build/浏览器/CI。页面快照不实时更新，发布/下架后须重新加载。FAQ/Lighthouse未完成，公开B未到，不部署。

- 1.3a无新迁移/依赖/实际.env变化；业务源码369行。check182项单元、静态表格渲染、生产build、生产开/关七语HTTP矩阵和发布/改稿/下架链路、原query DB/trial HTTP回归已通过，源码AST any仍290/38文件。无JS桌面/手机截图均是虚构资料并已清理；页面宽度无溢出，表格可键盘横滚。独立复核无Critical/Important/Minor，另跑表格渲染及纯18/18；未代跑DB/HTTP/build/浏览器/CI。最终串行核实政策/版本/工作稿/快照/临时账号/授权0，原稿116保留，实际flag关闭。默认dev和两个worker已恢复，support转人工、workflow0提醒/处理。当前head远端CI见最终交接及PR12。

- 1.2无新迁移/依赖/环境值变化。check通过177项单元；新增test:policies:query与原test:policies:data两套DB及trial HTTP通过。查询显式日期基准，只消费正式投影；指南必须由调用方从listPublished提供，无真实指南时null。只读核实政策/版本/工作稿/正式快照/临时账号和授权均0，原稿116保留，实际flag关闭。此步无界面，截图不适用。独立复核无Critical/Important/Minor，另跑纯13/13；未代跑DB/HTTP/build/CI。网站及两个worker已恢复，support无模型转人工，workflow为0提醒/0处理。当前head远端/CI证据见最终交接及PR11说明。

- Node24.22.1、PostgreSQL15；本机系统默认Node版本不等于项目版本，先按 `.nvmrc` 配置并确认 `node -v`。本轮验证明确使用Node24。开发网站3000，专用虚构测试库55438。
- `npm run dev` 保留Next Fast Refresh、关闭Payload HMR；CMS配置／集合／字段／权限配置修改后重启。构建与check串行，避免生成Next类型竞争。
- 1.1d无新迁移/依赖/环境值变更，复用既有66表结构。本轮data+content/permissions:content/quality/policies:workflow/policies:editor六套DB及policies/workflow/editor/trial四套HTTP退出0；164项单元、check及生产build通过。独立复核3项CLI连接/错误与输入类型问题均补RED→GREEN，详见progress；复核者未重跑DB/HTTP/build/CI。只读核实政策/版本/工作稿/正式快照/临时授权均0，原稿116保留，实际flag关闭；未把空模板导入用户库。网站与support/workflow两个worker已恢复，仍无模型/外发邮件；当前head CI见最终交接。
- seed:policies须--file JSON，默认预览，--apply仅创建草稿，已有记录不更新。限制本机专用postgresql URL且无查询/片段，避免驱动改连接目标；核实字段只能后台填写。SSR投影只读active快照，默认空，不新增公网接口。1.2纯函数现已验证，仍需实际政策、指南与后续工具/B验收。纯数据/脚本无新截图；screenshots/visa-policy-editor只代表1.1c2旧表单验收。
- 本轮迁移20261101_091015_immigration_policy_workflow只给员工内容类型枚举增加immigration-policy，不自动授权。备份.local/policy-workflow-before/database.dump；空库及隔离克隆up/down/up保留66张原表内容，down遇政策授权先拒绝，不能静默删除授权。本机已备份后事务up、原数据不变，local迁移标记保留。换电脑先备份升级；不要复用62表备份测试这一步。
- 新迁移：此前三项加`20261101_082855_immigration_policies`。本机已停三个进程、备份后事务应用政策up，原62表原列数据指纹一致；升级前备份在忽略目录`.local/visa-collection-before/database.dump`。本机保留原local开发迁移标记，不重放旧迁移；trial/CI空库正常执行全迁移CLI。其他电脑接手前先备份并阅读迁移说明，不能直接覆盖数据或用down切分支。
- `.env.example` 增加`VISA_CHECKER_ENABLED=false`；仅字面true显示本阶段后台导航及中英SSR工具页，权限不随开关放宽；浏览器查询及FAQ/本机移动审计已验证，真实内容/托管验收待后续。实际.env未改，截图临时进程已关闭并恢复默认。既有`SEARCH_ENGINE_INDEXING=false`、`SITE_LOCALES=en,zh`、可信网关和`INTAKE_ENABLED`边界不变。
- Docker使用 `.env.compose`、3001／55439和独立命名卷，命令见 `../docker/README.md`；配套恢复只用随机新目标，不覆盖55438或现有图片目录。
- `.env*`、`.local`凭据／媒体、数据库备份和容器测试备份不入Git。保留原本机内容；不从另一电脑覆盖运行中的目录，数据库和图片配套迁移。

## 下次接手

先检查 `git status`、`git branch -vv`、`git fetch origin`，确认工作区和远程head；同一任务用 `git pull --ff-only` 接手。有分叉先检查双方提交，不强推或清理未提交资料。先读最新任务书、阶段1计划和停止点A选项；A已确认，但当前只做本地；继续下一独立步骤，不据此开通账户、购买、部署或接统计。真实环境阶段另核对账户与授权。

```text
日期与任务：
当前分支／已确认远程提交：
PR／对应head的CI状态：
已完成／未完成或阻塞：
实际测试命令与结果：
环境变量变化（无秘密）：
迁移／备份／媒体要求：
本机服务和worker状态：
下一步及需要用户提供的账户：
```
