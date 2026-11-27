# Exhibition Reminder Exclusive Run Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 交付固定清单与每次新建的私有运行目录协议，为下一批受控单轮提供可独立验收的持久文件能力；本批不公开schedule命令或启动循环。

**Architecture:** 纯Node文件模块只追加版本1元数据和原回执，独占发布并同步文件及包含目录。DB控制/许可仍由已合并PR127提供，本批不创建第二套运行授权。

**Tech Stack:** Node24.22.1、现有TypeScript/测试、macOS/Linux本地文件系统；无新依赖。

**Spec:** `docs/superpowers/specs/2026-11-27-exhibition-reminder-loop-design.md`，用户已接受；后继计划single-round和loop见同目录。

## Global Constraints

- 保留原生就地方式及5份无关草稿。先fetch核对PR128；未合并时沿codex/exhibition-reminder-loop-design实施本批，已合并则从最新main创建codex/exhibition-reminder-run-directory。后继PR仅在本批用户合并后开始，不自动合并。
- 本PR保守业务源码预算≤360、硬上限增删400；若实际超限，按设计再切独立增量，不压缩语句或删边界。预算不是已完成行数。
- 输入/文件模块无Payload/config导入，无.env/迁移/依赖/原库操作。纯文件验收仅自建临时目录，权限敏感测试必须真实文件/子进程，不用调用次数代替。
- 当前uid、0700目录/0600文件、无链接/特殊文件/覆盖、可信本地父路径，文件和包含目录同步后才算保存成功。对不具备uid/NOFOLLOW/目录同步的环境拒绝，不承诺Windows/同步盘保证。

## Review Focus

- 父目录或叶目录在验证后被替换：Task2实际替换device/inode或符号链接，不能写到替代目录。
- 文件fsync成功但目录fsync/关闭失败：Task2按阶段注入，必须拒绝，后继不得拿“文件存在”当持久成功。
- receipt文件尾换行与pending摘要：Task2实际读取后等于原封套，digest严格reminderHash(原字符串)，不是文件字节另编码。
- 清单被调用方/原文件修改：Task1固定深复制快照；摘要/范围不随之变化。
- 旧目录/阶段文件未来版本或损坏：Task2拒绝，不修复/截断/覆盖/续跑。

---

### Task 1: 固定清单与路径边界

**Files:** Create `scripts/lib/exhibition-schedule-input.ts`; Test `tests/exhibition-schedule-input.test.ts`。

**Interfaces:**

- `ScheduleManifest={version:1;targets:ReadonlyArray<Readonly<ReminderScope>>}`，scope沿src/lib/exhibition-reminders；严格仅version/targets及key/locale，1–20合法contentKey＋zh/en，重复拒绝。
- `parseScheduleManifest(value:unknown):ScheduleManifest`：副本按JSON.stringify([key,locale])直接字符串字典序排序，深冻结；不使用系统locale排序。
- `readScheduleManifest(path:string):ScheduleManifest`：当前uid/0600/单链接常规文件，NOFOLLOW/NONBLOCK，有界16KiB，严格UTF-8/JSON及精确字段；拒FIFO、截断或读取中身份变化，不回显内容。
- `assertNewScheduleDirectory(path:string):string`：返回规范绝对候选路径；父目录必须已存在且当前uid拥有；规范祖先组件由root或当前uid拥有、无symlink/非目录、无组/其他用户写权限，叶路径必须不存在。仅预检，实际创建仍须重验，不能作为之后写入的授权。
- `scheduleManifestDigest(manifest:ScheduleManifest):string`：SHA256(canonical JSON `{version:1,targets}` UTF-8)，64位小写hex，不混入原文件格式/JWT。

- [x] **1. 写RED。** 名称`fixed manifest is canonical and immutable`至少含：

  ```ts
  const parsed = parseScheduleManifest({
    version: 1,
    targets: [
      { key: "fair-b", locale: "zh" },
      { key: "fair-a", locale: "en" },
    ],
  });
  assert.deepEqual(
    parsed.targets.map((t) => t.key),
    ["fair-a", "fair-b"],
  );
  assert.equal(Object.isFrozen(parsed.targets[0]), true);
  ```

  同文件覆盖0/21/重复/额外字段/未来版本/坏key/语言，源对象和源文件变化后原摘要不变；真实0600正向及FIFO/link/uid/权限/大小/坏编码反向。

- [x] **2. 观察RED。** Run `node --experimental-strip-types --test tests/exhibition-schedule-input.test.ts`；Expected：缺API或目标断言失败，记录确切原因。
- [x] **3. 实现接口。** 复用原contentKey规则及文件安全手法；读取后比较fd与path的device/inode/大小等，不复制Payload或CLI初始化。只处理文件，不接调度授权。
- [x] **4. 验证GREEN。** 上述命令及`npm run check`；Expected：0失败，原823项也通过，实际计数写进交接，不预填新总数。
- [x] **5. 提交。** 仅暂存本任务文件，diff检查并提交；task-done命令`npm test`。

### Task 2: 不可覆盖的持久运行日志

**Files:** Create `scripts/lib/exhibition-schedule-directory.ts`; Test `tests/exhibition-schedule-directory.test.ts`及`tests/helpers/exhibition-schedule-files.ts`。

**Interfaces:**

- `RunStart={runId:string;owner:number;revision:number}`，UUID/正整数与PR127一致。`RunDirectory`仅由工厂创建、保存新目录fd/device/inode/uid，不接受JSON反序列化为可写实例。
- `createScheduleDirectory(path:string,manifest:ScheduleManifest,binding:string):RunDirectory`：binding为64hex DB非秘密绑定摘要；重新核实父/不存在叶，非递归独占0700创建并同步父目录。创建并持久发布run.json和operations目录；run.json精确字段`version,localRunId,manifest,manifestDigest,databaseBinding`。本地UUID由内部生成。
- `directory.started(start:RunStart):void`：持久追加started.json，字段`version,localRunId,runId,owner,revision`。重复调用拒绝。
- `directory.plan(scope:ReminderScope,receipt:string):OperationJournal`：started之后且scope在固定清单中；内部序号000001起、每次独占操作子目录，保存原receipt及planned.json，字段`version,sequence,scope,digest`。receipt沿原封套2048字节限制、仅存原字符串加单尾换行；digest调用原reminderHash(receipt)。不得并行存在未finished的本地操作。
- `operation.prepared(revision:number):void`、`operation.applying():void`、`operation.finished(revision:number,asOf:string):void`：严格按planned→prepared→applying→finished追加同名json，精确字段`version,sequence,digest`加当前阶段所需revision/asOf；prepared/finished revision正整数，asOf规范ISO。重复/倒序拒绝；不把阶段当数据库权威。
- `directory.stopped():void`追加`{version:1,localRunId}` stopped.json，仅调用方明确成功stop后使用；`directory.close():void`只关自己fd、幂等，不删除旧证据。所有json≤16KiB。
- 写入顺序：私有临时文件O_EXCL/NOFOLLOW→写/fsync/关闭→独占发布→同步包含目录；新子目录条目同步其父。操作前后核对目录身份；失败不返回成功。可清自己未发布临时文件，任何可能关联DB写的已发布证据不自动删除。

- [x] **1. 写RED。** `existing run directory never becomes writable`和`directory fsync failure never returns a prepared receipt`；真实调用新工厂，重复新建必须拒绝且旧字节不变；缺API先失败。
- [x] **2. 观察RED并实现。** Run `node --experimental-strip-types --test tests/exhibition-schedule-directory.test.ts`；Expected：缺工厂/持久化断言失败；实现上述阶段与同步，不添加恢复写API。
- [x] **3. 故障与替换验收。** 真文件＋隔离子进程测试替换目录/symlink、已有目标、各写/fsync/close/独占发布/父目录同步失败、重复/倒序/未来版本/损坏值；以存储层故障注入，异常必须传到调用方。读取receipt经原readReminderFile返回精确原字符串，reminderHash与planned一致；未变化阶段目录字节不变。
- [x] **4. 全套与中文小结。** `npm run check`、上述真实文件测试；Expected：全绿，无新PG/生成能力。更新handoff/progress/一页小结，精确计源码≤400；现有46组未因库模块变更受影响的检查范围如实列明，不冒称新循环已测。
- [ ] **5. 提交/收尾。** task-done命令`npm test`。唯一全PR独立复核，严重/重要单轮RED→GREEN及完整回归；精确最终CI两作业、fetch推送一致，草稿不合并。原始日志只.local；用户合并后才进入single-round计划。

## 实施记录

Task1缺模块RED→18项GREEN，完整841/841；Task2真实文件/阶段/故障及变更反例后完整884/884，新61项。所有权元数据负向为故障注入，真实uid正向/权限/链接/FIFO/替换均实测；没有伪称切换OS账号。当前实际业务源码393≤400，360估算偏低。目录类复用readScheduleBytes有界读取，不导入Payload/config。未知存储结果不返回成功，不开放调度入口。末尾唯一复核和精确CI仍为分支交付门禁。
