# Exhibition Reminder Persistent Recovery Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在1A合并后交付同库持久未决、带原因受控结束，以及原写事务中对旧运行/封套的拒绝；本PR仍不实现定时循环。

**Architecture:** 以既有audit-events追加控制事件，原内容→业务→权限锁串行状态变更和生成；会话级单实例锁仅限定运行/恢复所有权。真正只读查询复用1A，控制动作单独写审计，不生成或替他人重放。

**Tech Stack:** Node24.22.1、PostgreSQL15、锁定依赖及原生CLI/测试。

**Spec:** `docs/superpowers/specs/2026-11-27-exhibition-reminder-scheduler-design.md`；依赖接口见`2026-11-27-exhibition-reminder-recovery-read.md`的两个Task Interfaces。

## Global Constraints

公共参数p:Payload、headers:Headers、req:Partial<PayloadRequest>、user:Staff与1A一致；ReminderReport/SchedulerState/ReminderScope以1A及原库导出为准。

- 已核实用户合并1A；从包含ff3dea1的origin/main40d9910创建本计划分支。原要求：必须用户合并1A后，fetch确认包含1A最终提交，从最新origin/main创建codex/exhibition-reminder-recovery-control；不叠加PR、不自动合并。
- 沿已选原生方式；本PR保守预算≤390业务源码增删，实际≤400。估算不是承诺已实现行数，若超限按已接受设计再切可独立验收增量，不能删锁/鉴权/回执来凑数。
- 只写既有audit-events和经原服务批准的exhibition-reminder-jobs；无新表、迁移、依赖或必需环境变量，原库不变。原5份其他草稿保留。
- local-only、原生现职管理员及7200秒会话、私有文件规则、初始化前拒绝清库、禁schema/建库/types/遥测与普通日志沿1A/PR125；失效凭证不能补写停止审计。
- 全库阻断仅针对本功能自动调度；新合法手工封套、审核、正常订阅/退订和H门禁保持。已作废未提交调度封套任何入口都不得补写。
- 没有匹配生成审计不是“绝对未执行”证明；查询不解除阻断，结束必须显式、带原因/期望状态版本，不自动执行原动作。
- 所有控制状态变更与生成先取内容726271→业务726281→权限726272，事务内复查JWT/当前角色；生成再取原邮箱/主题锁。读状态/历史始终只读。
- 单实例锁726291（当前源码检索未占用），专用连接pg_try_advisory_lock，不等占用者、不踢连接；单条SQL/锁等待10秒，正常/异常finally释放自己的连接。
- 只在随机hua_subscriptions_*库、虚构账号及example.invalid验收，对外HTTP/fetch/SMTP0调用；不是新调度或真实投递验收。

## Review Focus

- 单实例连接失效而旧生成连接仍活着：控制切换与原写事务锁内防护两种先后顺序均安全（Task2真实PG屏障）。
- pending或完成审计吞COMMIT/返回丢失：不能宣称可继续，换目录/新进程仍从数据库读到未决（Task1故障注入）。
- 原账号撤权且凭证文件遗失：另一现职管理员仅能带原因核实结束，不能获得历史数量或替其生成（Task2权限投影）。
- 状态版本过期、已结束run及旧pending封套、伪造scope/owner：不得结束新操作或写入，合法原历史仍可查（Task1/2精确反例）。
- 正常手工调用与控制旁路：普通未关联封套保持原行为；关联调度封套无有效上下文只能查已提交历史（Task2手工入口反例）。

---

## 文件、协议与接口地图

- Modify 1A的`src/server/exhibition-reminder-authority.ts`：增加锁内事务包装器，复用已有原生鉴权，不改只读边界。
- Create `src/server/exhibition-reminder-scheduler-control.ts`：单实例会话、开始/未决/正常完成/停止/受控结束；不导入配置或产生定时器。
- Create `src/server/exhibition-reminder-scheduler-guard.ts`：内部不可序列化的运行许可及原生成事务防护，避免control↔generation循环依赖。
- Modify `src/server/exhibition-reminders.ts`：原历史命中仍先返回；未命中则在原写锁内执行调度关联/作废检查，再走原封套、日期、资格与生成逻辑。
- Modify原CLI两个文件：只新增scheduler-resolve；status/inspect复用1A。不暴露begin/prepare/apply-run等可自行伪造运行身份的命令参数。
- Tests：`tests/helpers/exhibition-reminder-scheduler-control.ts`、`tests/helpers/exhibition-reminder-scheduler-races.ts`、严格测试库守卫的`tests/helpers/exhibition-reminder-control-process.ts`；两个新组接入subscriptions。控制状态纯规则可扩展1A测试文件。
- Delivery：更新一页小结、handoff/progress、最终实际范围与未完成循环；不改真实邮件或公开“提醒尚未启用”文案。

**持久协议：** entity=exhibition-reminder-scheduler。global记录action=state-v1、recordId=global、after为1A SchedulerState，revision为真实审计id。封套关联事件action=pending-v1、recordId=digest、after={version:1,runId,scope}；作废事件action=closed-uncommitted-v1、recordId=digest、after={version:1,runId,originalActor,scope,reason}。actor始终为当次真实授权操作者。所有关联/global事件同事务追加，不更新/删除历史。

上述digest统一为原reminderHash(原始封套字符串)，不另换SHA输入编码；targets使用1A固定字典序，重复拒绝。任何动作都核对seal.actor/范围与数据库owner/pending，不信调用方传入的身份。

最新global按id降序，不按客户端时间。封套关联/作废查询按entity/action/recordId精确查，不从限制1000行的历史列表推断。未来版本或损坏最新行503，不回退到旧状态。正常finish只在原生成审计匹配后清pending；closed-uncommitted事件永久禁止该封套新写。

### Task 1: 持久控制、单实例和可核实提交

**Interfaces:**

- `withLockedReminderAuthority<T>(p,headers,work:(context:{req:Partial<PayloadRequest>;user:Staff})=>Promise<T>):Promise<T>`：READ COMMITTED、原三锁后原生授权；超时10秒，异常rollback，不在事务内另借认证连接。
- `withExhibitionScheduler<T>(p,headers,work:(session:SchedulerSession)=>Promise<T>):Promise<T>`：当前管理员、try单实例锁、活性跟踪和finally关闭；session内部绑定p/headers/专用连接，不能通过JSON/runId或裸staffId构造。
- `session.begin(targets:ReminderScope[]):Promise<{runId:string;revision:number}>`：核实无未决后创建UUID运行；固定1–20范围，写global。无活进程但旧running且无pending时允许新的明确启动，新run替代旧run。
- `session.prepare(runId:string,receipt:string):Promise<{revision:number}>`：当前owner/run、范围、seal.actor匹配，未决为空；持久追加关联＋pending global，并在事务外复查本次审计确实落库后才返回成功。已提交/已关联/已作废封套拒绝重复prepare。
- `session.finish(runId:string,receipt:string):Promise<{revision:number}>`：只在原生成审计已匹配时追加pending=null；不写待发。`session.stop(runId:string):Promise<void>`只在无pending且仍有效授权时追加idle。
- `SchedulerSession`后继还提供Task2的apply/resolve；本任务先实现上述内核，接口不能开放未完成的写路径。

- [x] **1. 编写RED。** 新真实PG组导入API失败明确报错；真实管理员、真实审核/预检封套夹具。断言第二进程拿不到单实例锁；prepare后同库另一连接/新目录读取blocked，第二次begin/prepare拒绝；无生成审计的finish拒绝且pending保留。
- [x] **2. 运行RED并实现最小控制内核。** 全新状态begin→prepare，记录真实审计字段/原actor、无封套/JWT/邮箱；global和关联原子。每个写步骤锁后重新认证并核对状态/owner/run；新目录不参与授权或解除。

  前一步用例`pending cannot finish without its generation audit`的关键断言如下；session来自真实withExhibitionScheduler，scope/receipt来自原生审核/预检夹具：

  ```ts
  const { runId } = await session.begin([scope]);
  await session.prepare(runId, receipt);
  await assert.rejects(session.finish(runId, receipt), { status: 409 });
  assert.equal((await readExhibitionSchedulerStatus(p, headers)).status, "blocked");
  ```

- [x] **3. 故障与反向断言。** 对pending/global/正常完成审计分别注入数据库约束失败及吞COMMIT；assert.rejects且不能进入后继apply。对实际已提交但调用方未收到成功的状态，重开连接仍blocked，原回执保留；测试不能仅靠exit1证明无写。
- [x] **4. 保留实际记录对照。** 记录0→真实pending/global→成功完成或受控结束→私有清理的可检测变化；稳定状态读取全表不变。只清本测试记录ID，验证旧邮件/活动/尝试/租约/预算不变。锁占用由pg_locks/pg_blocking_pids确认，不用sleep猜顺序。
- [x] **5. 检查并提交。** `npm run check`及新控制组GREEN；任务完成命令`npm test`。此时未完成Task2，不提供运营生成入口、不把私有内核提交称1B已交付。

### Task 2: 旧运行拒绝、明确受控结束及真实入口验收

**Interfaces:**

- `SchedulerWritePermit`为guard模块管理的内部不透明对象；`session.apply(runId:string,receipt:string):Promise<ReminderReport>`唯一正常调度应用包装器，在会话活跃时产生许可，许可不打印/落盘/接受CLI输入。
- `assertSchedulerReceiptWritable(p,req,user,receipt:string,permit?:SchedulerWritePermit):Promise<void>`：调用时已有原三锁。有关联封套时要求活许可、当前global run/owner/pending digest/scope全部匹配；作废直接409；无关联且无permit的手工新封套保持原行为。上下文伪造/缺失不能降级为手工。
- `session.resolve(expectedRevision:number,reason:string):Promise<{state:'resolved';outcome:'committed'|'closed-uncommitted';revision:number;scope:ReminderScope}>`：任一现职管理员、单实例锁、原三锁内核对版本及生成审计，reason trim后1–500字符；已有提交只核实，无提交追加作废＋idle。输出不含原历史数量/actor/run/digest/封套，结束不调用apply。
- CLI：`scheduler-resolve --auth-file PATH --revision N --reason TEXT`；N为status实际状态版本，正整数，无pending/版本过期409。原管理员普通inspect的归属限制不改变；无原回执文件也只能控制核实结束，不能代执行。

- [x] **1. 写真实危险路径RED。** 原服务尚无防护时，把已结束但未过期的关联封套经手工apply实际得到held的负对照，期望409/全表不变应失败。旧进程失去单实例连接后被PG屏障延迟在内容锁前，另一进程resolve先提交；旧调用随后必须失败，不能仅由本地stopped标志通过测试。
- [x] **2. 接入锁内防护并GREEN。** 已提交历史分支仍在新写检查之前；所有未命中历史的新应用都经过关联/作废检查，之后才原提醒资格/时间/MAC复核及写入。状态变更同样先原三锁再认证，不能改员工原钩子、加大池或绕过原授权来通过。

  前一步用例`closed uncommitted receipt cannot write through the manual service`在原会话释放单实例锁、新管理员带原因resolve成功、封套仍未过期的夹具中包含：

  ```ts
  const before = await databaseFingerprints(p.db.pool);
  await assert.rejects(applyExhibitionReminders(p, originalHeaders, receipt), { status: 409 });
  assert.deepEqual(await databaseFingerprints(p.db.pool), before);
  ```

- [x] **3. 两个先后顺序。** 生成先持原锁时，resolve等待生成提交/回滚后再核实；resolve先持锁时，旧写拒绝。实际两进程、多连接和锁观察证明；吞COMMIT时pending不能丢，恢复status/inspect前后全表不变。移除guard的隔离反例必须真实检出新增1条held。
- [x] **4. 受控结束与身份。** 相同expectedRevision并发resolve仅一次控制事件成功；过期版本不得结束新的pending。原账号撤权后另一现职管理员带原因可结束，但无历史计数、无待发增量；经理/运营/展会编辑/仅政策授权主管403，空/超长原因400。当前管理员在锁等待中撤权/登出仍拒绝，不能靠最初actor对象。
- [x] **5. CLI反例与资源。** 非local、清库开关、非法revision/未知参数、坏私有JWT在初始化前拒绝；正常help/inspect/status保持。真实scheduler-resolve仅追加预期审计，原回执不改，未提交旧封套不可复活，已提交旧密钥历史原管理员仍可查；EOF/异常/连接丢失finally只清自己资源，HTTP/fetch0。
- [x] **6. 全套交付。** 完整check、`npm run test:subscriptions`完整回归（1A44＋控制/竞争2组=46）、相关content/exhibitions/权限回归与生产build通过；原库不迁移，虚构库清理。更新交接/小结，写明持久门禁已交付但实际循环尚未实现；计实际源码≤400并提交，任务完成命令`npm test`。
- [ ] **7. PR收尾。** 原生方式唯一末尾全PR独立复核，重要项一轮RED→GREEN及完整回归，轻微记录；精确HEAD两CI及关键日志、fetch远端一致，草稿不自动合并。合并前不开始实际循环增量。

## 自检、预算与后继

预算按模块职责估算：控制/会话约190行、guard/原服务接入约65行、权限包装器增量约35行、CLI/协议校验约100行，合计约390行；这是计划预算，不是代码验收。执行中用git diff实际计数，超限先按正式设计切分，不默认沿用PR124的550行例外。

本计划覆盖持久同库阻断、受控结束、撤权恢复、锁内旧进程防写、原普通手工与历史兼容，以及故障/竞争证据。60秒循环、5秒身份等待器、manifest/state-dir落盘、SIGINT/SIGTERM和真正调度多轮均留下一计划，1B不创建隐藏定时器或伪称自动调度可用。

已自检Spec覆盖、步骤可判定性、1A类型/方法一致性、五项Review Focus及长度比例。当前只写计划，用户确认后仍须等待1A实际合并再执行本计划；沿已选原生方式。

## 实施记录

基于main40d9910，分支codex/exhibition-reminder-recovery-control，草稿PR127。业务源码当前385≤400；复用审计追加函数降低重复，保持鉴权/锁/回执/明确恢复。基线822，新增CLI校验单元后完整check823/823、lint0/445、885文件行长通过；真实旧封套RED及guard移除恰好新增1条held的负对照已观察。两进程/连接终止与原锁两先后顺序、跳过本地活性检查仍由DB拒旧写、控制约束/吞COMMIT/响应丢失与当前管理员CLI已验收。完整46组、content/exhibitions与生产build已通过；唯一末尾复核/精确CI仍为分支交付门禁。
