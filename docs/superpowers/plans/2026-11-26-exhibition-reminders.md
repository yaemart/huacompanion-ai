# Exhibition Reminder Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 已登录现职管理员手动预检并原子生成本届30/7天local待发记录，完成独立PG模拟验收。
**Architecture:** 一个隐藏私有集合与安全迁移；纯规则规划候选/失效/摘要；只读一致性预检、封套、同事务锁复读和审计回执；薄CLI复用同一内核，超400行按正式设计顺序拆下一PR。
**Tech Stack:** Node24.22.1、TypeScript/Payload、PostgreSQL15与现有锁定依赖。
**Spec:** docs/superpowers/specs/2026-11-26-exhibition-reminders-design.md

## Global Constraints

- 用户已接受正式设计，沿既有原生/原地分支和推送草稿PR授权继续；不重复申请已给出的执行方式或设计批准。
- 只在北京时间距总体开展日恰好30或7天生成，不补漏日；仅zh/en、原始announced及完整日期，不含其他主题、分期或下一届。
- APP_ENV=local及现职管理员，写入需订阅总开关/有效隐私/语言/维护条件；不要求打开申请、邮件或供应商配置，不改变旧发送门禁。
- 同一事务内容726271→业务726281→权限726272→确定性邮箱锁→主题锁；预检全表只读，状态变化409零写入。
- 一张local-held/local-cancelled私表，历史取消不复活；无邮件/活动/尝试/租约写入，无UI/自动worker/外发。
- 用户已接受本PR手写业务源码增删≤550（原400调整，仅本批）；原运行库不升级/reset，新表只在独立随机虚构库迁移；三份其他任务文档保留。

## Review Focus

- 最新规范邮箱退订压过旧confirmed；其他语言/主题/下一届不能进入（任务1/2）。
- 预检后确认、退订、改期、撤权与拒发不能穿过生成锁；只有真实PG等待证明顺序（任务2）。
- 已提交回执优先于过期/跨日/当前密钥或总开关；当前会话和管理员资格仍需有效（任务2）。
- local-held是历史状态，过日/改版后需显示拟取消而非可发，读不写、应用才取消（任务1/2）。
- 1001人必须整次拒绝；“无外发任务”计数需真实反例，不能因关系展开假通过（任务2）。

### Task 1: 纯规划、私有存储和迁移

**Files:** Create `src/lib/exhibition-reminders.ts`, `src/cms/subscriptions/exhibition-reminders.ts`, `src/migrations/20261126_130000_exhibition_reminders.ts`, `tests/exhibition-reminders.test.ts`; Modify `src/cms/subscriptions/collections.ts`, `src/migrations/index.ts`, generated `payload-types.ts`.
**Interfaces:** Produce `ReminderState` (source公开原body及修订、该主题完整订阅、scope内历史jobs、拒发摘要), `ReminderBody` (local状态、最小公开snapshot、档位/日期、同意版本/邮箱摘要及取消原因), `planExhibitionReminder(state: ReminderState, scope: {key:string;locale:"zh"|"en"}, today:string, privacy:string)` → `{snapshot,offset,create,cancel,counts,fingerprint}`。`exhibition-reminder-jobs` fields `key`唯一、`scope`索引、`subscription`关系、`body`JSON；所有端点与默认权限拒绝，隐藏、无文档锁。

- [x] 写日期/状态、缺翻译、最新规范邮箱/隐私/拒发、终态不复活、改版失效和输出白名单的字面期望；固定2027-03-10/02-08/03-03、29/8/6/0/跨年闰年。运行`node --experimental-strip-types --test tests/exhibition-reminders.test.ts`，Expected RED新规则缺失。
- [x] 实现纯规划与最小snapshot、确定性key/指纹和数量，复用严格日期/邮箱/语言；不引入邮件依赖。
- [x] 增私有集合与只新增一表的up/down，down有历史拒绝；生成Payload类型。独立PG验证空迁移/回退、保留既有表、唯一键和匿名直连拒绝，Expected GREEN。
- [x] 完整check、聚焦规则与迁移GREEN；记录进度并提交。Task完成命令`npm test`，Expected全量通过。

### Task 2: 管理员只读预检、封套和原子生成

**Files:** Create `src/server/exhibition-reminders.ts`, `tests/helpers/exhibition-reminders-lifecycle.ts`; Modify `tests/integration/subscriptions.ts`，接入既有独立随机库/CI驱动及新迁移回退验收。
**Interfaces:** Consume Task1; produce `previewExhibitionReminders(p:Payload, headers:Headers, input:unknown)` and `applyExhibitionReminders(p:Payload, headers:Headers, receipt:unknown)`；输入仅`{key,locale}`或封套，返回无邮箱/订阅ID/摘要的公开资料与counts、blocked、时间，预检另返receipt。当前真实JWT认证后再于同事务复核管理员，读取时REPEATABLE READ READ ONLY，写入按Global Constraints锁序。数据库时钟单独SELECT，验收仅在隔离库测试工具替换此I/O边界，不增加命令/产品日期参数。

- [x] 独立PG真实审核发布、本届确认/退订及营销拒发，先写预检只读/生成local记录/无外发断言；迁移与规则之外服务缺失或未建记录为RED。
- [x] 实现私有状态读取、有效门禁和签名封套（scope/actor/业务日/10分钟/状态指纹）；生成前锁全部匹配主题及历史涉及邮箱、复读和比较。超1000/变更/未提交旧封套拒绝且全表不变。
- [x] 生成原子新建/取消/审计，receipt原值摘要作审计身份、提交后验证落库。已提交历史先查询，只读重放不依赖当前签名时效/开关；未提交验证当前签名和门禁。
- [x] 真实PG验证权限/撤权/会话、全部30/7窗口、公开草稿隔离、source变化、终态历史、全表只读/拒绝回滚、重复/并发、两个锁等待顺序、1001上限、0→真实记录→清理0负对照；受控数据库clock边界覆盖跨日/过期及历史恢复，不改机器时钟。
- [x] 完整check及全部订阅回归、相关展会/content和生产build通过。确认原邮件/活动/尝试/租约/预算表无增量、网络调用0；更新中文小结/交接，提交推送并建草稿PR。Task完成命令`npm test`，Expected全量通过。

### Task 3: 受控本地命令（用户接受后批）

**Files:** Create `scripts/exhibition-reminders.ts`, `tests/exhibition-reminder-command.test.ts`, CLI真实进程验收helper；仅在本PR累计业务增删≤400时纳入，否则完整内核与PG作为首个增量、命令在该PR合并后下一批。
**Interfaces:** Consume Task2服务；`preview --key KEY --locale zh|en --auth-file PATH --receipt-file PATH`、`apply --auth-file PATH --receipt-file PATH`。两文件须当前用户私有0600常规文件，认证仅既有JWT，receipt文件新建不可覆盖。启动前local/参数校验，强制schema push/type自动生成/自动建库/telemetry关闭，静默日志、finally销毁Payload；stdout仅中文脱敏报告，不打印封套。

- [ ] 若预算允许：真实CLI错误模式/权限文件/非local在Payload初始化前拒绝RED，正常预检/生成/重放和秘密不输出RED；实现薄包装GREEN，完整check与PG/CLI通过。
- [ ] 已按用户接受的范围后批：在ledger和交接说明实际行数、内核已完成与CLI未交付，明确设计允许拆分；不压缩代码或放宽样式/测试凑数，不建立叠加PR。

## 末尾交付

所有本PR任务完成后唯一最强独立全分支复核，重要项一轮RED→GREEN及全套绿色，轻微延期；最终HEAD与远端一致、精确提交CI两作业和日志实核，草稿PR不自动合并。原演示库仍保留升级前停服备份门禁，新迁移只在独立测试库实际执行。

## 实施判断

设计已明确允许按实际估算拆分内核与命令，以首PR至少提供PG中可预检/生成的内部服务为下限；不能交付空表后称提醒已完成。原生执行、原地分支及其他草稿保留沿既有选择，任务完成前不重复审批。具体封套编码、最小JSON存储和内部clock I/O验收工具按本文接口实施，不增加公开时间覆盖入口或真实发送路径。

## 执行范围调整记录

用户回复方案1，接受本批上限550行；CLI不纳入本PR，合并后再批次交付。成本：当前只有经真实鉴权的内部预检/生成服务可供集成验收，运营尚无命令入口；不以压缩代码或跳过安全门禁凑400行。完整计划的CLI接口约定仍保留作为后续交接。

## 唯一末尾复核与实施判断

唯一独立全分支复核：0严重、5重要、3轻微；重要项一轮修正，不追加第二次复核。重要项包括PG分数秒按时间点排序、scope属性顺序规范化、原生撤权锁序、当前资格/纯取消上限、事务内鉴权连接池等待；字面/真实PG反例RED后修正GREEN。预检释放只读快照后才做事务外新授权，写事务鉴权复用当前READ COMMITTED连接。当前资格eligible=本档新增+现存held，subscribers单列订阅资格，terminal单列取消终态；非窗口/目标失效可在1001份订阅时明确纯取消，实际生成候选超过1000仍整次拒绝。

实施判断按发生顺序（含成本）：

- 延续用户已接受的原生执行、原地同任务分支及草稿推送授权，不重复设计/计划审批；成本为共享路径需协调，若原执行偏好有误后续需调整。
- 保留三份其他任务未跟踪文档，完整检查用无.env的精确本任务副本；成本为另一个任务仍需自行协调共享文件。
- 初按400行规划，首批至少交付PG中实际可用的预检/生成内核，CLI可能后批；成本为运营命令延后，不能把空表称为交付。
- 时钟仅由受守卫测试库的I/O适配器替换，产品无日期覆盖参数；成本为测试适配器必须随数据库时钟读取边界维护。
- 用户明确选择本批550行上限并将CLI完整留后批；成本为合并下一增量前无运营入口，不压缩安全实现凑数。
- 核对原员工钩子实际先业务726281再权限726272，与设计假设不同。保留旧钩子并将提醒修正为内容726271→业务726281→权限726272；成本为未来新锁必须沿实际顺序维护，无权限扩张。
- 订阅资格与当前可建/held资格分开，1000上限约束实际生成档位而不封死失效历史取消；成本为未来CLI必须准确标注两种人数，始终不截断名单。
- JWT复核使用当前写事务连接；预检释放快照后才外部复核；成本为asOf代表资料快照，授权时点较新，避免占着一个连接等另一个。
- CLI/UI/调度/真实邮件/部署及原库升级按用户范围后批；成本为本批不证明运营可用、生产迁移或投递就绪。
- 精确提交/推送与CI由主代理实核，不声明另一台电脑已同步；成本为新机仍需独立准备环境与fetch。
- 会话在锁等待后的最后授权决策点有效；其后登出不追溯中止已批准的提交，员工权限变更仍锁至提交；成本为登出不是正在提交批次的中止按钮。
- 直接DB、内部overrideAccess、测试辅助startSubscription及极端积压延迟指标无本批外部入口/承诺；正常员工撤权与满池调用已在本批修复；成本为未来暴露或增加性能承诺须补守卫与测量。
- 复核者未独立重跑全部PG或做系统级抓包；主代理实核完整日志、禁止并统计fetch及核对无发送路径，不称真实送达；成本为不能声称捕获了操作系统所有网络通道。

轻微延期（不进入本轮修正）：

- 全站无关邮箱的营销拒发变化仍使本展会预检失效，并增加读取成本，后批按范围约束查询/指纹。
- blocked仅布尔值，缺少固定脱敏门禁原因码；后续CLI需更明确恢复提示。
- 并发生成证据限同进程跨连接，子进程证明密钥轮换历史恢复；未单独证明跨进程竞争、有效配置下的维护专例、旧封套被多个门禁同时拒绝时的独立原因。不扩大证据声称。
