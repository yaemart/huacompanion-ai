# Exhibition Reminder Recovery Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付真正只读的原回执核实及数据库调度状态查询，作为第一批基础的1A；本PR不生成调度控制事件或启动循环。

**Architecture:** 独立的现职管理员只读事务包装器，复用原封套解析、生成审计身份及PR125私有文件/安全初始化；严格读取原审计表中的控制协议，CLI只输出白名单中文结果。后继1B复用这些接口补持久控制写入和原服务防护。

**Tech Stack:** Node24.22.1、PostgreSQL15、现有锁定依赖、原生Node测试及tsx。

**Spec:** `docs/superpowers/specs/2026-11-27-exhibition-reminder-scheduler-design.md`（用户2026-11-27接受）；后继计划`2026-11-27-exhibition-reminder-recovery-control.md`。

## Global Constraints

公共参数类型统一为p:Payload、headers:Headers、req:Partial<PayloadRequest>、user:Staff（src/cms/access）；其余参数/返回值逐项列明。

- 当前PR126为设计草稿，继续`codex/exhibition-reminder-scheduler-design`，基础main为80f14bfae60c47bcfa56524cddee72ceea6bc84d；不叠加PR、不自动合并。
- 用户已接受正式设计及进入第一批计划；原生执行方式沿用。本计划须先经用户审阅，再实施；不重复选择执行方式。
- 原设计允许为≤400行再切可独立验收增量。第一批基础分1A只读查询、1B持久控制；1A合并后才能从最新main开1B，实际循环继续后批。
- 每PR手写业务源码增删≤400；1A保守预算≤270（不是已实现行数），执行时按相对合并基线的实际新增＋删除计，不为限额压缩语句或删安全检查。
- 无新依赖、集合、字段、迁移、必需环境变量、公开API、运营UI、定时器、系统任务、真实发送或原库变更；其他5份草稿保留。
- 实际操作仅APP_ENV=local；初始化前拒绝PAYLOAD_DROP_DATABASE=true及坏参数/私有文件，关闭schema push、自动建库、类型生成、遥测和普通日志。
- JWT/回执文件当前uid、0600、常规单链接、有界；既有preview/apply语义保持。新查询不能调用apply冒充只读，不新建回执文件或审计。
- 原审核、内容726271→业务726281→权限726272→邮箱→主题锁、会话7200秒及H真实试发门禁不变；本PR不改变既有生成锁顺序。
- 只读操作先释放REPEATABLE READ READ ONLY事务，再以新视图复查原管理员会话/角色；事务内认证复用req连接，不占着快照再另借连接。
- 仅独立随机hua_subscriptions_*库和虚构账号/邮箱；原始日志留本任务.local，截图/报告不入Git。不声称新调度已运行。

## Review Focus

- 仍有效但从未提交的封套：inspect只能返回not-found，全表不变（Task1 PG反例）。
- 旧密钥/过期/跨日的已提交回执：只在当前有效原管理员授权下返回旧结果；不能返回当前资格（Task1新进程测试）。
- 最新控制行损坏/未来版本或只有孤立操作事件：拒绝，不能回退到旧行或空闲（Task2严格读模型测试）。
- 等锁/快照与撤权、池容量：只读回复前使用新授权视图，不能耗尽池（Task1并发/原生登出测试）。
- 新命令缺少receiptFile、恶意文件/额外参数：仍须在配置加载前拒绝，不能泄漏凭证或触发清库（Task2真实子进程测试）。

---

## 文件与接口地图

- Create `src/server/exhibition-reminder-authority.ts`：原生鉴权与只读事务边界；不导入Payload配置/自动初始化。
- Create `src/server/exhibition-reminder-history.ts`：生成审计匹配、白名单历史投影及只读inspect。
- Create `src/lib/exhibition-reminder-scheduler-state.ts`：严格控制协议类型/解析，不含IO。
- Create `src/server/exhibition-reminder-scheduler-state.ts`：原审计表最新状态读取与脱敏投影。
- Modify `src/server/exhibition-reminders.ts`：export type ReminderReport=Report，历史模块只import type，避免运行时循环依赖；仅复用历史匹配函数，不改日期、规划器、写事务或权限语义。
- Modify `scripts/lib/exhibition-reminder-command.ts`、`scripts/exhibition-reminders.ts`：新增inspect和scheduler-status；沿原启动安全配置，不另造初始化器。
- Tests：`tests/exhibition-reminder-recovery.test.ts`、`tests/helpers/exhibition-reminder-inspection.ts`、`tests/helpers/exhibition-reminder-scheduler-state.ts`；接入`tests/integration/subscriptions.ts`。
- Delivery：更新handoff/progress和一页中文`docs/exhibition-reminder-recovery-summary.md`；正式设计只改“已接受”状态，不再改已接受的产品要求。

### Task 1: 真正只读的回执核实

**Interfaces:**

- `authenticateReminderAdmin(p:Payload,headers:Headers,req?:Partial<PayloadRequest>):Promise<Staff>`：local、原生p.auth、staff集合、当前有效管理员；req有事务时认证/员工复读用同一连接。
- `withReminderReadOnly<T>(p,headers,work:(context:{req:Partial<PayloadRequest>;user:Staff})=>Promise<T>):Promise<T>`：在任何事务内查询前SET REPEATABLE READ READ ONLY，完成后rollback释放，再复查同一账号有效授权；所有错误清理。
- `findExhibitionReminderAudit(p,req,actor:number,digest:string,scope:ReminderScope):Promise<ReminderReport|null>`：按entity=exhibition-reminder-jobs、action=generate-local、recordId=reminderHash(原封套字符串)、actor匹配，核对after.scope=JSON.stringify([key,locale])；损坏/不匹配报503，不冒称无提交。
- `inspectExhibitionReminder(p,headers,receipt:unknown):Promise<{state:'committed';report:ReminderReport}|{state:'not-found';scope:ReminderScope;currentEligibility:'not-checked'}>`；Report为原报告的公开白名单，replayed=true/currentEligibility=not-checked，不含原封套。

- [x] **1. 写失败断言。** 在`tests/helpers/exhibition-reminder-inspection.ts`导入新API失败时明确assert；构造真实登录、审核展会及实际生成审计。断言`inspect(有效未提交封套).state==='not-found'`且全表不变；已提交返回原asOf/create/cancel和not-checked；另一个管理员、主管、JWT会话过期/原生登出/撤权均拒绝且不返回历史；已提交封套自身过期不妨碍原管理员用有效会话只读核实。
- [x] **2. 运行RED。** 运行`npm run test:subscriptions`（原驱动创建、迁移并清理随机库）验证新组，Expected：缺少inspect模块/函数断言失败，不接受数据库/夹具配置错误代替RED。

  前一步用例名`valid uncommitted receipt inspection never applies`的关键断言如下；p/headers、receipt/scope均来自前一步真实登录和原生预检夹具：

  ```ts
  const before = await databaseFingerprints(p.db.pool);
  assert.deepEqual(await inspectExhibitionReminder(p, headers, receipt), {
    state: "not-found",
    scope,
    currentEligibility: "not-checked",
  });
  assert.deepEqual(await databaseFingerprints(p.db.pool), before);
  ```

- [x] **3. 实现上述接口。** 用原parseReminderEnvelope作结构解析；要求seal.actor为当前账号。查询已提交历史不验证当前MAC/十分钟/当天/总开关，不命中不尝试应用。投影只含原Report已定义的scope/snapshot/today/asOf/offset/counts/blocked及历史标签；excluded仅invalid/duplicate/unconfirmed/language/privacy/suppressed数值，未知私有字段不透传。原apply历史分支改用返回的Report本身，不再访问saved.after；其历史优先级、锁内授权与释放事务行为保持。
- [x] **4. 写并运行新进程及授权反例。** 同一账号新会话＋轮换密钥＋过期旧封套可查原提交；未提交旧封套仍not-found不写。真实PG只读事务中的写探针应拒绝；p.auth事务连接与快照释放后原生登出复核必须有效。沿用原池容量并发验收，不能加大池来通过。
- [x] **5. 运行GREEN和检查。** `npm run check`、`npm run test:subscriptions`；Expected：0失败，原42组及新inspection组PASS；原生成历史回归不变，旧表指纹不变。记录实际测试数量。
- [x] **6. 提交本任务。** 精确暂存本任务文件，`git diff --cached --check`后提交；执行task-done命令`npm test`。不提前声称1A交付完成。

### Task 2: 严格状态读模型与受控只读命令

**Interfaces:**

- `SchedulerState={version:1;runId:string|null;owner:number|null;targets:ReminderScope[];pending:null|{digest:string;scope:ReminderScope}}`；idle仅runId/owner=null、targets=[]、pending=null；active为UUID runId、正整数owner、1–20个规范排序不重复范围，pending.scope必须在targets内且digest为64位小写hex。
- `SchedulerLedger={revision:number;state:SchedulerState}`；revision为真实审计行id。无任何控制事件时为revision=0的idle，不表示调度已启用。
- `parseSchedulerLedger(value:unknown):SchedulerLedger`：精确字段/版本/数值/范围校验；不修复、不截断、不回退。

  revision=0仅允许空控制流的idle；targets以JSON.stringify([key,locale])的字符串直接字典序规范排序，不用操作系统locale排序。原生成模块接入findExhibitionReminderAudit后直接使用其Report，不再访问旧审计行.after。

- `readSchedulerLedger(p,req):Promise<SchedulerLedger>`：entity=exhibition-reminder-scheduler、recordId=global按id DESC取最新；要求action=state-v1。没有global行但存在该entity其他事件则503。不能按createdAt文本排序或用1000条列表推断末尾。
- `readExhibitionSchedulerStatus(p,headers):Promise<{status:'unregistered'|'idle'|'running'|'blocked';revision:number;scope?:ReminderScope}>`：使用Task1只读包装器，输出不含runId/owner/digest/封套/原因原文；不写控制状态。
- CLI：`exhibition:reminders -- inspect --auth-file PATH --receipt-file PATH`；`scheduler-status --auth-file PATH`。前者found复用formatReminderReport的历史路径；not-found固定中文“未找到可确认提交；当前资格未检查；未生成或取消记录”。后者打印状态、状态版本及必要范围，不把idle称可发。

- [x] **1. 写纯规则/真实进程RED。** `tests/exhibition-reminder-recovery.test.ts`覆盖idle/active/pending合法值；未来版本、额外字段、坏UUID/owner、0/21/重复范围、pending越界、非hex、未知最新action均拒绝。idle只允许runId/owner=null、targets=[]、pending=null；active必须有UUID、正整数owner、1–20个合法唯一范围，pending.scope必须在targets内。真实缺配置进程的inspect坏文件/status额外参数必须返回边界错误，不得落入初始化错误。
- [x] **2. 运行RED。** `node --import tsx --test tests/exhibition-reminder-recovery.test.ts`；Expected：新解析/查询命令未实现，目标断言失败。

  前一步用例`unsupported control version never becomes idle`至少含以下字面断言；最新坏global行的PG用例另断言503，不回退旧合法行：

  ```ts
  const state = { version: 1, runId: null, owner: null, targets: [], pending: null };
  assert.deepEqual(parseSchedulerLedger({ revision: 0, state }), { revision: 0, state });
  assert.throws(() => parseSchedulerLedger({ revision: 1, state: { ...state, version: 2 } }));
  assert.throws(() => parseSchedulerLedger({ revision: 1, state: { ...state, owner: 1 } }));
  ```

- [x] **3. 实现模型、只读状态及命令。** 保持preview/apply原分支类型收窄；status不索取receipt文件。所有新参数/文件在动态加载配置前校验；不接受token/staffId/now/force/send。沿原日志脱敏和finally销毁。
- [x] **4. PG与CLI验收。** 新`testExhibitionSchedulerReadBoundary(p)`组在隔离库记录并仅清理自己创建的控制审计ID；真实状态命令验证最新坏行不回退、无行/孤立事件、无文件/不同目录不改变数据库结论、任一现职管理员能看脱敏状态但不能读取他人回执。命令前后全表及输入文件字节不变，HTTP/fetch计数0。
- [x] **5. 交付验证与文档。** 完整`npm run check`、`npm run test:subscriptions`完整回归（原42＋2新组=44）、相关`npm run test:content`和`npm run test:exhibitions`及生产build；只在随机库。CLI不自动建库/推schema/改types的现有反例继续PASS。更新交接/进度/小结，写清1A只读、1B门禁尚未实现，未运行调度/真实发送。
- [x] **6. 提交任务2。** 完整本地验证后提交；完成命令`npm test`。独立全PR复核、精确HEAD两CI及fetch交接是任务完成后的最终分支门禁。

## 自检与后继边界

本计划覆盖正式设计的真正只读查询、状态读协议、现职权限/隐私、初始化安全及第一段独立交付；持久未决写入/受控结束/旧进程防写由1B计划覆盖，60秒循环、5秒身份轮询、manifest/state-dir落盘与信号处理由后续循环计划覆盖。未提前实现未调用的写API或通用调度框架。

类型/属性名以本计划Interfaces为后继契约；1B不得把state读模型改成另一套协议。自检已核对Spec对应项、每步期望、跨任务接口、五项Review Focus与计划比例，不派额外计划审阅代理。

**最终分支门禁：** 一次独立全PR复核，重要项一轮RED→GREEN及全套回归；精确HEAD两CI/日志及fetch一致后交接，草稿不自动合并。1A合并后才能开始1B。

## 实施结果与判断

本地check819/819、lint0/445、880文件行长、订阅44组、content/exhibitions及生产build通过；实际业务源码374≤400，270为失准预算。原库/.env/依赖/迁移不变，最终复核/精确CI见PR126记录。

Ruling: preserve accepted in-place/native workflow and existing PR126 branch; use an isolated no-.env source copy for tests and preserve five unrelated drafts — cost: shared checkout still needs coordination; do not claim whole root clean.

Ruling: literal READ ONLY snapshot plus fresh external authorization after release; no new writes, scheduler control or loop — cost: multiple live auth reads per query; no history from stale/revoked sessions.

Ruling: different-directory recovery means changing private input/state locations, not running an existing cwd-relative Payload configuration outside the repository. CLI remains documented from project root; test moves its valid auth into a fresh private directory and confirms the same DB blocked state — cost: operators still cd into the project; no unrelated configuration-path refactor.

Ruling: estimated270 source lines was low; actual374 remains below approved hard400. Retain strict validation instead of compressing statements — cost: larger review than estimate, no scope/cap increase.

Ruling: task-done records implementation, tests and commit; independent full-PR review and exact-head CI remain final branch gates — cost: explicitly pending until verified, no premature completion claim.
