# Exhibition Reminder Continuous Local Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独占目录和受控--once合并后，交付同一运行上下文中的串行连续循环及等待期间身份复查。

**Architecture:** 延用上一批一次性生命周期/信号处理；单个await链处理轮次，完成后60秒等待并最长5秒发起身份复查。不重复begin/stop，不轮换目录/清单，不创建第二套许可或恢复。

**Tech Stack:** Node24.22.1、PostgreSQL15、原生TypeScript/锁定依赖。

**Spec:** `docs/superpowers/specs/2026-11-27-exhibition-reminder-loop-design.md`；Consumes前两计划run-directory、single-round的已合并接口。

## Global Constraints

- 仅single-round用户合并后从最新origin/main创建codex/exhibition-reminder-local-loop。计划编写时先前能力尚未实施，不能把依赖写成现成产品；接手先核对实际合并/接口，保留5份草稿，不强推/硬重置。
- 原生就地实施，预算≤280/业务源码增删硬≤400，超限再切独立增量。无.env/依赖/迁移/原库操作，不自动合并。
- 固定清单、同一私有目录/原生会话和单实例锁；原所有审核/锁/pending/许可/真实试发门禁保持。不补tick或旧日，不以“今天已跑”跳过新确认订阅。
- 只在严格守卫的随机hua_subscriptions_*库和虚构账号/example.invalid；真实60秒验收可使用caffeinate防测试机休眠，不放宽生产会话/SQL超时。

## Review Focus

- 一轮耗时超过60秒/系统暂停：Task1从完成时刻开始等待，不重入/补tick；纯等待器单调时钟反例。
- 无变化空闲轮反复写审计/文件：Task2在已开始上下文中全表和目录指纹不变，正常begin/stop分开计数。
- 等待阶段会话过期/登出/撤权：Task2真实授权变化后不进入下一轮、不补stop审计；不读新JWT。
- 第一轮成功后第二目标/轮次未知：Task2保留原pending并整次停止，没有后续写，之前已提交历史不回滚。
- SIGINT/SIGTERM发生于等待唤醒/身份复查边界：Task1/2信号优先停止新工作，重复信号不残留计时器/监听/句柄。

---

### Task 1: 可唤醒的完成后等待

**Files:** Modify `scripts/lib/exhibition-schedule-stop.ts`, `scripts/lib/exhibition-schedule-runner.ts`（仅Stop类型）； Create `scripts/lib/exhibition-schedule-wait.ts`; Test `tests/exhibition-schedule-wait.test.ts`。

**Interfaces:**

- 扩展runner中ScheduleStop现有reason/request加`onRequest(listener:()=>void):()=>void`，返回取消订阅函数；已请求时立即通知并返回noop，不为每段等待新增进程监听。stop.dispose清自己的进程监听与订阅，不能伪造SIGINT；实际退出原因仍reason。禁止每5秒往永不settle的共享Promise追加.then，避免长运行累计回调。
- `waitScheduleCycle(stop:ScheduleStop,checkIdentity:()=>Promise<void>,clock?:ScheduleWaitClock):Promise<void>`：真实默认performance.now单调计时，60000ms完成后等待，片段≤5000ms；每片正常到期后在进入下一片/返回前发起checkIdentity；信号到来优先返回，不再开始身份检查或新轮。检查已经开始可完成/按10秒SQL限制失败；不是承诺5秒内完成所有SQL。
- `ScheduleWaitClock={now:()=>number;sleep:(ms:number,stop:ScheduleStop)=>Promise<void>}`只用于纯等待算法替换；生产runner不接受它、CLI无日期/间隔/clock参数。默认sleep用onRequest可取消订阅，信号/计时器任一路完成都清timer及另一订阅，不留下计时器/回调。outer先await当前等待退出再dispose；异常finally也取消该等待资源。

- [ ] **1. 写RED。** `next round waits sixty seconds after completion`使用可控单调等待器：开始值0→59999时未返回→60000后返回；每sleep参数≤5000；加入check耗时后不补连续短tick。`signal wins a due timer`请求停止后无新check；身份check拒绝应传播而不是当正常到期。
- [ ] **2. 观察RED并实现。** Run `node --experimental-strip-types --test tests/exhibition-schedule-wait.test.ts`；Expected：缺API/时序目标失败。无setInterval、无生产日期覆盖参数；默认sleep的真实timer/信号清理另用实际子进程证明不挂住。
- [ ] **3. GREEN与提交。** 聚焦测试及完整`npm run check`；Expected：0失败，原--once/信号功能保持；提交并task-done `npm test`。

### Task 2: 同一生命周期多轮与真实验收

**Files:** Modify `scripts/lib/exhibition-schedule-runner.ts`, `scripts/exhibition-reminders.ts`, `scripts/lib/exhibition-reminder-command.ts`; Test `tests/helpers/exhibition-schedule-loop.ts`, `tests/helpers/exhibition-schedule-process.ts`及subscriptions入口。

**Interfaces:**

- 新`runSchedule(p,headers,manifest,stateDir,stop,onReport,options:{once:boolean}):Promise<{exitCode:0|130|143}>`；参数类型与single-round一致。保留`runScheduleOnce(...)`为传once:true的兼容包装器，旧验收继续调用。private单轮逻辑仅当前已begin的真实session/目录可调用，不导出可序列化RoundContext或许可factory。
- outer生命周期只一次鉴权/取单实例/新建目录/begin，立即第一轮；每轮结束若未stop且once:false才waitScheduleCycle，等待返回再检查stop/身份并开始下一轮。无变化轮不写心跳/操作文件；正常结束只一次stop。异常不继续、不重新begin，原目录原样留证。
- schedule参数现在--once可选，返回`once:boolean`；缺--once表示连续，其他参数/拒绝/安全初始化不变。--once与循环使用同一单轮代码，不允许定时器调用另一个弱化应用入口。
- onReport的apply成功汇总必须在finish/finished都成功后发出；preview是明确预检信息，不是完成宣告。每轮只必要中文汇总；日志不打印owner/runId、digest、JWT、原回执或私有元数据。

- [ ] **1. 写真实循环RED。** 新组`continuous scheduler keeps one run and sees same-day new consent`：真实两轮，第一轮后新增同日合资格虚构订阅；第二轮新增恰好对应held，原held无重复。第二轮不得早于上一轮完成后真实60秒；用报告观测和实际DB时间/文件结果，测试超时允许完整一轮等待及SQL，生产等待/会话不改。初始CLI无--once会拒绝，应先观察RED。
- [ ] **2. 实现循环并GREEN。** 只扩展outer生命周期，不按轮重复调用会新建目录的runScheduleOnce。纯等待器测试可注入clock；这个真实PG/子进程多轮验收不跳过60秒或加隐藏加速参数。
- [ ] **3. 空闲/停止/失败。** 已begin下稳定无变化轮全表/目录指纹不变；实际等待中原生logout/撤权/停用/过期后不下一轮且无失效凭证补写；运行中替换auth/清单不换人或范围。SIGINT/SIGTERM唤醒真实等待，重复信号退出130/143且无活timer；另测身份check已开始再信号，异常优先退出1。第二轮prepare/apply/finish故障或未知时全次停止，之前结果保留、DB pending规则准确；新目录仍不能绕过未决。
- [ ] **4. 资格与边界。** 原服务真实30/7、不补档、非窗口只原失效取消、改期/撤下/退订/拒发/已审核修订变化及终态不复活回归；两进程单实例及旧运行拒写、普通手工/历史/H旧边界保持。测试锁和终止仍以子进程精确PID/当前DB/键限定，0外部调用和旧预算/尝试/租约表不变。
- [ ] **5. 全套与文档。** 完整check、全部订阅（预计前批48＋loop1=49组，实际为准）、content/exhibitions/权限、生产build。中文小结/handoff/progress明确本地循环已交付但真实发送未启用；每台电脑自己的账号/测试库及全新目录，旧目录留证不网盘同步运行中数据；实际源码≤400。提交/task-done `npm test`。
- [ ] **6. 最终收尾。** 唯一全PR独立复核，严重/重要单轮RED→GREEN及整套回归；精确HEAD两CI/关键日志和fetch一致。草稿不自动合并，不延伸为系统驻留、自动续期或真实发送。

## 计划自检（覆盖三份计划）

目录/清单与持久阶段由run-directory负责；受控单轮/真实命令/SQL超时/信号及未知结果由single-round负责；等待/连续与空闲身份由loop负责。既有PR127提供DB权威和私有许可，不重写。每个Review Focus已落到所属测试步骤，接口名/阶段字段跨计划一致；顺序依赖必须用户合并，不叠PR。
