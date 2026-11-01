# 实施记录

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
