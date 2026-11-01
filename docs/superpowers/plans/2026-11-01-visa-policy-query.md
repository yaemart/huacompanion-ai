# 入境政策查询纯函数 1.2 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans，逐项按RED→GREEN实现，最后一次独立整轮复核。

**Goal:** 实现不联网、不读库、不依赖隐式时钟的国籍/入境日查询，供后续中英工具页复用。

**Architecture:** 复用1.1d的公开字段契约与日历日校验；查询只消费正式投影，重新校验字段并拒绝带工作流元数据的误传对象。使用显式核实日期基准，纯字符串比较生效/截止日。签证指引由调用方从现有已发布指南提供；没有配置时不编造链接。保留所有匹配政策，逐条展示时长及未核实条件，不输出入境资格保证或推算离境日期。

**Tech Stack:** Node24.22.1、TypeScript、现有Payload/PostgreSQL集成夹具；无新依赖。

**Spec:** docs/traffic-entry-task.md（1.2）、docs/traffic-entry-phase1-plan.md（1.2边界）、docs/immigration-policies.md。

## Global Constraints

- 当前仅本地开发，工具VISA_CHECKER_ENABLED默认关闭；不部署、不购买、不接统计，公开须B确认。
- 独立草稿PR依赖PR10；业务代码<=400行，新代码无any、行长<=200，不新增schema/权限/实际.env变化。
- 不硬编码现实政策，不累计停留天数；过境保留口岸/行程待核实提示，不把240小时当10个日历日。
- 不向网络/URL/日志/存储发送访客输入，不依赖Date.now或无参数Date；错误不回显输入。
- 提交前check与相关集成通过，DB夹具期间停止worker并清理/恢复；本步无界面截图。

## Review Focus

- 截止含当天、生效含当天；未来生效/已过期、有效与过期并存、空截止和闰日不误判。
- 未知国籍与无适用记录仅为尚未确认，不断言必须办签证；没有已发布指引时不造链接。
- 所有匹配方式分别保留来源/核实日期，排序不受输入顺序/时区影响；不修改输入或合计时长。
- 原始草稿/下架/工作流记录与损坏/未来核实数据不能被当作公开查询事实，输出不带私有字段。
- 过境只表示匹配到有条件记录，时长按命名类型240小时表达，不给离境日期或无条件免签结论。

### Task 1: 日历边界与查询契约

**Files:** src/lib/immigration-policy.ts；src/lib/immigration-policy-query.ts；src/lib/immigration-policy-query-copy.ts；tests/immigration-policy-query.test.ts。

**Interfaces:** 复用导出的isPolicyCalendarDate(value)。queryImmigrationPolicies(input, policies:readonly unknown[], context)；input为nationalityISO/arrivalDate未知输入，null国籍明确表示未列出；context为verifiedOnOrBefore日历日和调用方提供的已发布visaGuide或null。返回status（matched/unconfirmed/invalid-input）、字段错误代码、中英文notice、独立matches及visaGuide/null，不回显查询输入。每项matches保留公开字段（去maxStayDays），以stay区分days或hours，附conditions-unchecked、expiry-not-stated、transit-itinerary-unchecked警示代码。guide只接受中英文站内指南路径及文本标题，调用方负责从listPublished取已发布内容。

- [x] 写失败用例并观察RED：截止前/当/后、生效前/当天、空截止、未知/未列出、非法类型/日期与闰年。
- [x] 实现最小查询与copy；校验数据用显式verifiedOnOrBefore，不读时钟；非公开字段对象拒绝参与。固定排序unilateral→bilateral→other→transit，再核实日降序/公开字段指纹，保留全部记录。
- [x] 用例验证两类免签/过境叠加、分别时长、240h单位/条件、来源/核实日期、不变性及无私有字段；所有新纯测试与完整单元通过。

### Task 2: 隔离验证与正式数据管线

**Files:** tests/helpers/policy-query-fixture.ts；tests/integration/immigration-query.ts；tests/immigration-policy-query.test.ts；package.json；.github/workflows/ci.yml。

**Interfaces:** query只消费listPublicPolicies结果；签证guide从listPublished正式指南解析，仍不新增公开路由或页面。

- [x] 在隔离子进程以UTC、上海、洛杉矶时区运行同一夹具，禁止隐式时钟/网络/存储；结果一致且无额外日志。
- [x] 真实DB验证草稿/待审不参与，审核后可匹配，改稿仍旧快照，下架后尚未确认，私有字段无泄露；真实已发布指南可附加，未发布指南不提供。清理夹具。
- [x] 原policies:data回归、check通过；新query DB套件加入CI。无schema和既有业务权限变化。

### Task 3: 复核与交接

**Files:** docs/progress.md、handoff.md、immigration-policies.md、feature-inventory.md、traffic-entry-phase1-plan.md、README.md。

- [x] 独立只读整轮复核，无Important/Critical/Minor；记录范围与剩余事项。
- [x] 更新实测记录、源码any与行长，原稿116/flag/夹具核实，本地进程恢复。无新界面，截图不适用。
- [x] check后提交推送草稿PR11；完整远端SHA/本head CI按最终交接实核。下一步1.3a中英SSR和无JS表格，不自动合并或部署。
