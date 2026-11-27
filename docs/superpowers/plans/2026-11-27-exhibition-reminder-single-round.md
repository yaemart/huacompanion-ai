# Exhibition Reminder Controlled Single Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前一目录协议PR经用户合并后，交付可实际运行的schedule --once、私有证据与SIGINT/SIGTERM安全收尾；本PR仍不开放连续循环。

**Architecture:** CLI沿原安全初始化，调用目录协议和PR127唯一session串行处理固定清单。信号只修改停止闩，原事务批准与持久门禁继续决定写入和收尾。

**Tech Stack:** Node24.22.1、PostgreSQL15、现有Payload/TypeScript与锁定依赖，无新依赖/表/迁移。

**Spec:** `docs/superpowers/specs/2026-11-27-exhibition-reminder-loop-design.md`；前置契约见run-directory计划Task1/2 Interfaces，必须已合并，不叠加PR。

## Global Constraints

- fetch确认前批实际合并，最新main新建codex/exhibition-reminder-single-round。原生方式，保留5份无关草稿；隔离无.env副本/随机hua_subscriptions_*，不操作原库，不自动合并。
- 保守预算≤380业务源码增删，硬上限400；目录协议必须复用，不为凑数删鉴权、同步、停止或恢复检查。超限按设计再切独立增量，不沿用旧550例外。
- 当前仅命令`schedule --auth-file PATH --manifest-file PATH --state-dir NEW_PATH --once`；**--once本批必需**，无--once在初始化前拒绝，避免冒充连续调度。
- local-only/清库开关前拒绝、schema/建库/types/遥测/普通日志关闭沿原CLI；所有输入先验证，不接受裸staffId/JWT/日期/force/send/retry/复用目录。
- 原审核、日期、锁序、权限钩子、原手工/历史、持久恢复及H试发门禁保持；原账号失效不能补审计/同session.resolve。无对外HTTP/fetch/SMTP。

本PR保守业务源码预算≤350、实际增删硬≤400；超限再切独立增量，不沿用过去550例外。

## Review Focus

- prepare已提交但阶段文件/响应丢失：Task1真实commit/文件故障后不可apply，换目录/进程仍blocked。
- finish已提交而响应或finished保存失败：Task1显示本进程未知退出，DB可能无pending，不假报全库blocked，也不自动续跑。
- 停止与apply最后一刻交错：Task2真实PG锁屏障/进程信号，不能仅用本地布尔或sleep猜顺序。
- 运行中替换auth/manifest/目录：Task2保持原身份/范围，目录替换拒写，不能读新JWT续期。
- 普通角色/撤权发生于锁等待中：Task2现职授权复查403，不能借首次user或增加池绕过。

---

### Task 1: 有证据的受控单轮

**Files:** Create `scripts/lib/exhibition-schedule-runner.ts`; Test `tests/helpers/exhibition-schedule-once.ts`，接入`tests/integration/subscriptions.ts`。

**Interfaces:**

- Consumes：前批ScheduleManifest/RunDirectory/OperationJournal；PR127 `withExhibitionScheduler(p,headers,work)`、`session.begin(targets)`→runId/revision、prepare/finish→revision、apply→ReminderReport、stop→void；原preview、只读status及authenticateReminderAdmin。不可导出或重新签发permit。
- `ScheduleStop={reason:null|'sigint'|'sigterm';request(reason:'sigint'|'sigterm'):void}`：首个信号胜出，重复不重入。Task1 tests可用真实对象请求，监听由Task2提供。
- `ScheduleReport={mode:'preview'|'apply';report:ReminderReport}`；`runScheduleOnce(p:Payload,headers:Headers,manifest:ScheduleManifest,stateDir:string,stop:ScheduleStop,onReport:(r:ScheduleReport)=>void):Promise<{exitCode:0|130|143}>`。所有拒绝/未知抛异常给CLI退出1，不吞错误冒充正常信号退出；不提供生产日期/等待/跳鉴权参数。
- DB非秘密binding：同库查询`current_database(),inet_server_addr(),inet_server_port()`，对固定版本1数组规范编码SHA256；不序列化整份连接对象、密码、JWT或URL。它是证据绑定，不是物理克隆证明/权限。
- 顺序：真实身份/单实例→只读状态无pending→再次确认停止→工厂独占建目录→begin→started→逐范围检查停止/身份→preview。blocked整次错误退出；无新增/取消仅report。
- 有变化：plan(scope,原receipt)全部持久成功→检查停止/身份→prepare确认提交→prepared(revision)→检查停止/身份→applying持久成功→最后检查停止→唯一session.apply→明确成功且当前授权有效时finish→finished(revision,report.asOf)。只处理上一目标完整完成后的下一目标。
- onReport：preview明确是预检；apply成功汇总只在finish和finished文件均成功后发出，不提前宣布完成。
- 返回/清理：明确当前run、当前授权有效、已知无pending时才stop；stop确认后可stopped。没有started成功也不能假装begin未提交，记住已明确返回的run再决定正常stop。任何prepare/apply/finish未知或本地保存失败都停止，不重试/跳目标/自resolve；只有关闭自己的资源。目录close与session/Payload finally幂等。只读核实不隐式清pending。
- finish实际成功但响应/本地文件失败：退出1并留证；DB可为running无pending。不得宣称全库必blocked、不得自动begin或用resolve重试。失效授权仅关资源不补finish/stop。

- [x] **1. 写PG RED。** `valid single round produces exactly one local held with durable receipt`：原生真实审核/确认订阅夹具，调用缺失runScheduleOnce应失败。关键GREEN断言：

  ```ts
  assert.equal(result.exitCode, 0);
  assert.equal(held.length, 1);
  assert.equal((await readExhibitionSchedulerStatus(p, headers)).status, "idle");
  assert.equal(readReminderFile(receiptPath, "receipt"), originalReceipt);
  ```

- [x] **2. 观察RED并实现顺序。** Run `npm run test:subscriptions`（新组先接入）；Expected：目标缺API失败；随后实现接口，不增加隐藏定时器或可写恢复路径。目录路径由测试读取本次新目录中的实际文件，不伪造成功阶段。
- [x] **3. 真正故障验收。** planned保存失败→0pending/0held；prepare约束/吞COMMIT/响应丢失→拒绝并核对实际DB（不是只exit1）；prepared/applying文件失败→blocked/0held；apply未知→留pending并inspect只读；finish回滚→blocked；finish已提交响应丢失/finished保存失败→无pending也仍退出1。新目录begin不绕pending。对receipt/事件/held/旧表作0→实际变化探针，自己的记录清理。
- [x] **4. GREEN与提交。** 完整`npm run check`及新PG组，Expected：全绿、旧46组保留，实际新组/单元计数写交接。提交本任务并task-done `npm test`；此时未接实际CLI/信号不宣称本PR交付完成。

### Task 2: 受控命令与信号生命周期

**Files:** Modify `scripts/exhibition-reminders.ts`, `scripts/lib/exhibition-reminder-command.ts`; Create `scripts/lib/exhibition-schedule-stop.ts`; Tests `tests/exhibition-schedule-command.test.ts`, `tests/helpers/exhibition-schedule-process.ts`, `tests/helpers/exhibition-schedule-signals.ts`，接入subscriptions第二新组。

**Interfaces:**

- `createScheduleStop():ScheduleStop & {dispose():void}`：安装SIGINT/SIGTERM处理，仅首信号置闩；处理器不调DB/退出/重试/发起异步清理，dispose只移除自己的监听。Task1消费同一reason/request接口。
- parser扩展schedule分支：authFile/manifestFile/stateDir及`once:true`；仅一次裸--once，其余三个值参数各一次且非空，未知/重复/缺失拒绝。原四命令及resolve分支输入保持，schedule不索取receipt-file。
- 初始化前完成原JWT文件验证、manifest快照、候选目录只读验证。只在schedule分支，对`resolved.db.init(args)`的适配器poolOptions追加`statement_timeout:10000,lock_timeout:10000`（保留原连接配置/max，不改别的命令或.env）；能力以本地安装的PostgresAdapter/pg类型为准，必须在首次建连接前生效。
- 最早在首次异步初始化前安装stop，停止已请求时不再初始化/开始新工作；已开始的初始化可收尾再检查。Payload销毁、stop.dispose和目录close各自finally；不改别的进程/后端。
- 输出只调用现有formatReminderReport及固定中文停止/核实提示。正常0；SIGINT130、SIGTERM143；身份失效/任何未知1优先。403提示有效现职管理员；未决/提交未知指向status/inspect/独立resolve，不引导重新apply或换目录绕过。--help不初始化。

- [x] **1. 写子进程RED。** `schedule without once refuses before config`、坏JWT/manifest/已存在目录/非local/reset/未知参数均在故意缺配置进程中得到预期边界错误，不泄露参数内容；真正缺schedule实现时断言失败。原help/命令回归保持。
- [x] **2. 实现命令/stop，验证实际初始化。** 用虚构已迁移库运行真实--once；额外列、payload-types内容/mtime不变，无自动建库/schema、无对外调用；私有auth/manifest字节不变。坏输入不能因先读错另一个文件而掩盖，分别用结构正确的JWT/manifest正向对照。
- [x] **3. 实际信号验收。** 每个信号覆盖初始化后未begin、preview后、prepare前/后、apply已持锁和finish/文件收尾；测试IPC仅在测试进程设置屏障，无生产故障开关。信号后无新目标；无pending有效会话可stop；已pending未apply保持blocked；已批准apply可成功且仅正常finish收尾；中途失效不补审计；重复信号只有一次清理/正常停止标记。用实际DB与目录结果断言，关键unsafe反例移除检查必须检出写入。
- [x] **4. 身份/范围/竞争。** 运行中替换输入不换actor/清单；真实会话过期/登出/撤权/停用、主管仅政策授权/编辑等403；锁等待后撤权拒绝；两实际进程单实例拒绝。锁观察与测试终止都以子进程确认PID＋当前DB OID＋锁键限定，另一随机库同名锁不受影响。
- [x] **5. 全套与提交。** 完整check、全订阅（前批46＋本批once/signals2组，期望48；实际输出为准）、content/exhibitions/权限及生产build；random虚构库清理，0HTTP/fetch/SMTP与旧邮件/预算/租约/尝试表指纹不变。更新中文小结/handoff/progress，源码实际≤400，提交并task-done `npm test`。
- [ ] **6. 分支收尾。** 唯一全PR独立复核，重要/严重单轮RED→GREEN及全套复跑、轻微留记录；精确HEAD两CI及关键日志、fetch推送一致，草稿不合并。未完成连续等待，不开放无--once；本PR合并后才执行loop计划。

## 实施核实（2026-11-27）

PR128已合并，基于main351f7ef，草稿PR129，沿原生方式执行。Task1缺API及Task2参数/真实信号先RED再GREEN；文件故障/真实提交未知、锁屏障和输入/目录替换均核对实际DB，不用成功响应代替提交核实。停止检查需要让真实OS信号得到处理；收尾timer turn验证缺失时0而应130，恢复后双信号通过。上游Payload.destroy不结束池且保留初始化连接，沿原独立CLI在finally后process.exit关闭自身连接，不等待会挂起的Pool.end。

完整check901/901，lint0错误/445既有警告、897文件行长；完整订阅48组（原46＋once/signals），24个真实CLI场景＋双进程拒绝，content/exhibitions/内容权限和生产build通过。业务源码实际增删225≤400；保守估算取350，未放宽硬上限。无新依赖/迁移/.env/原库操作；测试独立虚构库已清理。唯一末尾复核/最终CI后更新Step6；连续循环及真实发送尚未实施。
