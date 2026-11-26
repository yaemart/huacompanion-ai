# Exhibition Reminder Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 现职管理员通过私有JWT文件手动预检/应用本届30/7天本地待发记录，终端仅脱敏中文报告。
**Architecture:** 原生Node/TypeScript薄命令，严格参数与私有文件边界；Payload延迟初始化并关闭自动schema/建库/类型生成/遥测与日志；完整复用PR124鉴权事务服务，不另建提醒逻辑或发送路径。
**Tech Stack:** Node24.22.1、PostgreSQL15、现有锁定依赖、Node内置fs/test与tsx。
**Spec:** docs/superpowers/specs/2026-11-26-exhibition-reminders-design.md；上一实施计划Task3的已接受CLI接口。

## Global Constraints

- PR124已合并；fetch后从最新origin/main新建codex/exhibition-reminder-command，不叠加PR、不自动合并；原生/原地执行沿既有选择。
- 用户明确继续已接受的CLI设计及测试/交接/推送草稿授权，不重复审批同一接口；其他5份未跟踪草稿保留。
- 本批业务源码增删≤400；无新依赖、字段、迁移、环境变量、公开入口、后台页面、调度或真实发送。
- 操作仅APP_ENV=local；初始化前严格校验命令、私有文件与格式。现职管理员JWT、原审核、内容→业务→权限→邮箱→主题锁、真实试发门禁不变。
- auth/receipt输入须当前uid、0600、常规文件；拒绝链接/特殊文件/超长/无效内容。认证只接受现有JWT，不接受密码/裸staffId/命令行token。
- preview新建0600回执文件，不覆盖任何现有目标；阻止/失败不输出凭证，不产生可用回执。apply只读取并保留原回执，结果未知不删除或强制重试。
- 禁止自动schema push、自动建库、自动类型生成和遥测；日志静默；普通成功/失败路径finally销毁Payload。
- 真实PG验收仅随机hua_subscriptions_*库和虚构账号/邮箱，使用实际数据库日期，原运行库不升级/reset。

## Review Focus

- 伪造参数/日期/发送/强制重试、非local与坏文件必须在Payload配置/连接前拒绝（任务1，真实子进程以缺密钥/坏数据库作反例）。
- 文件符号链接/FIFO/硬链接、模式、限长和目标竞争不能泄漏/覆盖；实际fs读写断言，输出仅新建（任务1）。
- 已提交历史必须标明当时结果/当前资格未检查，不以原计数冒充当前可发；排除邮箱/ID/摘要/封套和终端控制字符（任务1）。
- CLI不能悄悄初始化或升级已有/缺失数据库，错误输出不泄漏数据库URL/密钥；真实进程与结构/库列表指纹（任务2）。
- 两个真实命令进程应用同回执只一次写入，撤权/登出/改版/过期拒绝且回执保留；真实JWT与PG，无产品日期参数（任务2）。

### Task 1: 私有文件、参数、中文报告及薄命令

**Files:** Create `scripts/lib/exhibition-reminder-command.ts`, `scripts/exhibition-reminders.ts`, `tests/exhibition-reminder-command.test.ts`; Modify `package.json`仅增`exhibition:reminders`脚本。
**Interfaces:** `parseReminderCommand(args:string[])`返回preview `{key,locale,authFile,receiptFile}`或apply `{authFile,receiptFile}`；仅preview接受--key/--locale，均接受--auth-file/--receipt-file。`readReminderFile(path, kind)`读取原JWT/封套；`assertNewReminderReceipt(path)`及`saveReminderReceipt(path, receipt)`拒绝覆盖并以0600新建；`formatReminderReport(report, mode)`仅白名单中文汇总。入口`npm run --silent exhibition:reminders -- preview ...`或`apply ...`，独立--help只输出说明，不读文件/连接库。

- [x] 写真实fs参数/隐私文件/不覆盖/限长与报告白名单断言；独立字面报告区分subscribers、eligible、terminal，历史只报当时数量且资格未检查。先运行聚焦测试RED。
- [x] 实现上述边界；文件读取用nofollow/nonblock、fstat并有界读取，创建回执用exclusive/nofollow、0600及落盘，不打印路径内容。终端展示标题去控制符和限长。
- [x] 写真实脚本进程非local/伪造参数/非法文件/已存在回执在缺Payload配置环境中仍准确拒绝，避免泛化catch造成假通过，先RED后接入口GREEN。
- [x] 入口先读受控文件再动态加载Payload配置/服务；沿现有独立worker的local安全配置，preview阻止不写文件，apply保留回执；0成功/帮助、1拒绝/失败；只打印固定安全错误，409提示保留原回执核实。
- [x] 完整check及聚焦测试通过，更新进度并提交；尽早推送并建WIP草稿PR。任务完成命令`npm test`。

### Task 2: 真实CLI与PG全链路、文档及交接

**Files:** Create `tests/helpers/exhibition-reminder-command.ts`, `tests/helpers/exhibition-reminder-command-session.ts`, `docs/exhibition-reminder-command-summary.md`; Modify `tests/integration/subscriptions.ts`, `docs/handoff.md`, `docs/progress.md`及本计划。
**Interfaces:** `testExhibitionReminderCommand(p:Payload)`纳入现有随机订阅库/CI驱动。子进程命令使用真实管理员JWT私有文件；会话辅助进程仅测试库新密钥真实登录并私下写JWT，无产品新登录入口。日期以数据库北京时间today+30/+7构造审核展会，不改变产品/机器时钟。

- [ ] 写真实已审核展会、虚构已确认/待确认/退订、管理员与非管理员夹具。实际preview回执0600/报告脱敏/全表只读、apply生成真实held记录/旧表不变、两进程同凭证仅一次审计/历史结果，先RED。
- [ ] 真实CLI验证30/7档、改版取消/重建、非窗口纯取消、历史重放与当前计数区分；撤权/登出、source/名单/配置变化拒绝，全表不变且原回执字节保留。新密钥/新JWT查询已提交历史；未提交旧封套单独密钥变化拒绝。
- [ ] 缺失库不能自动创建、已有库结构不变；错误日志不含URL/密钥/凭证；断言旧邮件/活动/尝试/租约/预算无增量及子进程外发禁止。真实0→held→清理0探针。
- [ ] 完整check、全部订阅回归（预期原41＋CLI一组）、生产build通过。无新UI，不虚构浏览器或真实送达验收；相关HTTP由最终CI沿原脚本核实。
- [ ] 中文说明给出安全准备JWT文件的方法、preview/apply示例、只读历史标签、过期/未知结果先原回执核实，以及已有库备份迁移门禁。更新交接/进度/小结，提交推送；任务完成命令`npm test`。

## 实施判断

既有正式设计和用户本次明确实施请求已授权CLI接口及原生执行，不重复设计/计划批准；成本为实施者常规文件/报告选择需在交接透明列明。维持原地分支与无.env任务副本检查，保留其他任务文件；成本为共享路径仍需协调。
--help仅说明，不属于本地数据库操作；其他操作非local全部拒绝。输入文件为原始JWT/封套加可选末尾空白；不新增登录密码入口。普通失败输出固定安全提示，回执保留用于核实，不自动改配置/升级数据库。

## 最终交付

全部任务完成后唯一最强独立全分支复核，重要项一轮RED→GREEN及全套绿色，轻微延期；精确HEAD与origin任务分支一致，两CI作业和关键日志实核；草稿不自动合并。本计划scratch独立归档后只清理自身目录。
