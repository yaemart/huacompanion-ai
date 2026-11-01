# 入境工具浏览器查询 1.3b Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans，当前会话TDD实现，最后一次独立整轮复核。

**Goal:** 在既有中英文SSR页增加仅浏览器内的国籍/入境日查询及已发布签证指南，不发送或持久化选择。

**Architecture:** SSR只传正式公开政策、显式核实日期及白名单指南引用；客户端局部state调用既有queryImmigrationPolicies。控件无form/name，水合前disabled；结果卡片保留各自来源/日期/条件，输入改变撤销旧结果。VISA_GUIDE_CONTENT_KEY可选且仅服务端使用，精确选择listPublished中的指南；缺省不造链接。原完整SSR表保留，无JS仍可阅读。

**Tech Stack:** Node24.22.1、Next16.4.3/React19、现有Payload/PostgreSQL；无新依赖。

**Spec:** docs/traffic-entry-task.md1.3；docs/traffic-entry-phase1-plan.md1.3b；docs/immigration-policies.md1.2/1.3a。

## Global Constraints

- 仅本地；默认VISA_CHECKER_ENABLED=false、页面noindex，B前不公开、不部署/购买/接统计。
- 业务改动<=400行；新代码无any，行<=200，无schema/权限边界/实际.env变化；新增可选环境变量只写示例和文档。
- 查询输入不写URL/Cookie/网络/日志/localStorage/sessionStorage；无server action或新公开API。
- 只用正式数据，未知/过期待确认，不猜延期；不合计时长/推算离境日，240小时保留条件。
- 独立草稿PR依赖PR12；提交前check及相关测试；DB夹具停worker并清理、构建停dev且与check串行。
- 保留视觉及SSR表；真实桌面/手机截图。FAQ和完整Lighthouse留1.3c，不宣称≥90。

## Review Focus

- 水合前/无JS/Enter提交/输入修改：不能原生提交或显示过期旧结果，SSR完整表不消失。
- 国籍只来自完整正式数据，未知选项明确；多政策/截止/未来/空截止/240小时结果与纯函数一致。
- 配置指南缺失、未发布、下架、错语言、非guide或非法路径：不造链接或泄露原始内容。
- 浏览器输入只进局部state，输入和查询后网络/URL/日志/存储/Cookie不包含选择；无依赖偷偷写入。
- 手机上结果可读、键盘/错误关联/状态播报可用；flag/语言/noindex及发布下架/私有数据边界保持。

### Task 1: 选项及正式指南引用

**Files:** src/lib/immigration-policy-browser.ts；src/lib/immigration-policy-query.ts（仅导出原safeGuide为safeVisaGuide）；tests/immigration-policy-browser.test.ts。

**Interfaces:** policyCountryOptions(policies:readonly unknown[],asOf:string,locale:"en"|"zh")返回去重ISO/value与本地label数组，复用buildPolicyTable；selectPolicyVisaGuide(published:readonly ContentBody[],locale,key:string|undefined)精确且唯一匹配guide的contentKey/locale，返回safeVisaGuide({href,title})或null。调用方只传listPublished结果，不声称纯对象证明发布。

- [x] 先RED：去重/排序/全时段国家、拒绝私有坏记录、不变性；指南未配置/错类型/错语言/重复/坏链接及白名单克隆。
- [x] 最小实现，不使用模糊标题/首篇回退；原query/table测试及完整单元GREEN。

### Task 2: 客户端控件、结果与服务器接入

**Files:** src/components/immigration/PolicyQuery.tsx；PolicyQueryResult.tsx；policy-query.css；src/lib/immigration-policy-form-copy.ts；src/app/(frontend)/[locale]/tools/china-visa-free-checker/page.tsx；.env.example；tests/integration/immigration-query-render.tsx；tests/integration/immigration-page-http.ts；package.json/.github/workflows/ci.yml。

**Interfaces:** PolicyQuery({locale,policies,verifiedOnOrBefore,visaGuide})使用局部state、hydration readiness、无form/name、type=button，Enter显式处理；选项__unlisted__映射null，空项仍非法。输入改变清除result。PolicyQueryResult({result,locale})可读卡片/条件/来源/日期，aria-live notice，错误字段与输入关联。服务端仅可选精确读取指南，静态后续入口亦可指向同一正式引用。

- [x] 先写静态渲染失败测试：水合前禁用/无form-name、两语标签/提示、matched/unknown/invalid状态、来源日期/过境/空指南/转义。
- [x] 实现控件与卡片，结果复用1.2；配置示例不改实际.env。SSR表不变、两语及默认404保持，check/渲染GREEN。
- [x] 扩真实HTTP指南发布/下架/语言/原始字段拒绝；CI配置同一虚构guide key、静态测试接入。生产build与生产开关HTTP通过，query DB回归。
- [x] CUA生产浏览器实际输入/Enter/改输入撤销/未知/过期/两语/手机；观察网络/URL/日志/存储Cookie前后及无JS表格，保存虚构截图与证据，清理恢复进程。

### Task 3: 复核与交接

**Files:** README.md、docs/progress.md/handoff.md/feature-inventory.md/immigration-policies.md/traffic-entry-phase1-plan.md及截图。

- [x] 一次独立只读复核，重要问题一轮RED→GREEN；记录裁定及实际验证限度。
- [x] check、any/行长、夹具/原稿116/实际flag及进程恢复核实；更新文档。
- [x] 提交推送草稿PR并关联，fetch核对完整SHA，核实当前head的push/PR CI；下一步1.3c，不自动合并/部署。
