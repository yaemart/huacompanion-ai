# Exhibition Calendar Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 从现有公开展会详情下载一次性整届全天日历。
**Architecture:** 纯函数负责导出资格和RFC5545文件；Next只读路由复用公开快照，原详情使用本语言普通下载链接。
**Tech Stack:** Node24.22.1、Next/React/Payload、原锁定依赖，无新增包。
**Spec:** docs/superpowers/specs/2026-11-26-exhibition-calendar-download-design.md

## Global Constraints

- 整届一个全天日程，分期放说明；不建分期身份、订阅、提醒或真实发送。
- 公布/历史结束且完整有效日期可导出；待公布、延期、取消、未知/无效日期不可导出。
- 只读当前已发布快照，保留原审核、语言、来源、试用和维护门禁。
- 无依赖、集合、迁移、环境变量/.env变化，不升级/reset原演示库；仅独立虚构随机库。
- 从最新origin/main建立codex分支；其他任务三份文档原样保留，不纳入提交。
- 原生执行，唯一末尾独立复核，按要求测试、更新交接、推送草稿PR，不自动合并。

## Review Focus

- 中文/emoji在75字节边界不得损坏或注入新属性（任务1）。
- 最后一天和跨年不能少一天，四位年份溢出不得输出畸形日期（任务1）。
- 草稿改期不能提前影响已下载文件的公开来源，撤下后不能继续下载（任务2）。
- UID不能因改名、slug或修订改变，也不能混同其他语言/展会（任务1）。
- 未启用语言、失效配置及数据库异常不能泄漏内部信息或借Host改写网址（任务2）。

### Task 1: 日历日期语义与序列化

**Files:** Create `src/lib/exhibition-calendar.ts`, `tests/exhibition-calendar.test.ts`; Modify `src/lib/exhibition-copy.ts`.
**Interfaces:** Consumes `ContentBody`, `validExhibitionDate`, `exhibitionPath`, `exhibitionText`; Produces `canExportExhibitionCalendar(body: ContentBody): boolean`, `buildExhibitionCalendar(body: ContentBody, origin: string, now?: Date): string | null`.

- [x] 编写缺导出能力断言、日期/状态/UID/旧JSON/七语言/UTF-8/注入测试；明确字面期望`DTSTART;VALUE=DATE:20240228`与`DTEND;VALUE=DATE:20240302`，跨年`21000103`，拒绝9999-12-31。
- [x] 运行`node --experimental-strip-types --test tests/exhibition-calendar.test.ts`，确认缺功能RED。
- [x] 实施资格、全天次日结束、稳定摘要UID、TEXT转义与UTF-8折行；添加七语言下载/不适用/一次性导入提示。
- [x] 同命令GREEN，再运行`npm test`验证完整套件。
- [x] 提交模型与测试、设计/计划；记录任务结果。

### Task 2: 公开只读下载、界面和真实生命周期

**Files:** Create `src/app/(frontend)/api/public/exhibitions/calendar/route.ts`, `tests/exhibition-calendar-route.test.ts`, `tests/helpers/exhibition-calendar-http.ts`; Modify `src/components/exhibitions/ExhibitionPage.tsx`, `tests/integration/exhibition-filters-render.tsx`, `tests/integration/exhibitions-http.ts`, `docs/handoff.md`, `docs/progress.md`; Create `docs/exhibition-calendar-download-summary.md`.
**Interfaces:** Consumes Task1两个函数；HTTP helper `assertExhibitionCalendarHTTP({p, admin, draftId, body, base, publish})`在现有独立库和真实生产服务器执行，不另建管理员、不改原库。

- [x] 实际组件补七语言下载路径与提示、不适用状态断言；编译实际Route Handler仅替换存储初始化边界，断言400不初始化、404/409/503/附件响应、Host不污染URL。先运行聚焦测试确认RED。
- [x] 实施GET路由和详情链接，先验证参数、复用listPublished、仅返回符合资格的本语言展会，no-store/nosniff与安全附件名；不新增其他写方法。
- [x] 同一聚焦测试GREEN；真实HTTP helper验证草稿不泄漏、改版UID保持、日期变更、全表指纹只读、撤下404、取消409和Next POST405。
- [x] 完整`npm run check`、既有展会/内容、详情渲染、生产build及展会HTTP通过；沿用已接入CI的exhibitions-http执行新helper。
- [x] 真实浏览器查看桌面/390详情与下载/提示，虚构数据，截图仅本机；停止本任务server并清理独立随机库。
- [x] 更新交接和中文小结，记录失败/修正及限制；提交推送并建立草稿PR。
- [ ] 末尾唯一独立复核，重要项单轮RED→GREEN修正，轻微项记录；核对最终SHA的CI与远端一致，不自动合并。

## 执行判定

用户在“也可以直接按整届一个日程推进”的提议后接受建议，沿用此前原生实施与草稿PR授权，不再重复请求确认设计、执行方式或推送。
当前普通checkout有三份其他任务未跟踪文档，沿用此前原地任务分支方式；不擅自建立新worktree。检查副本隔离运行与原演示服务，不复制.env或运行数据库。

## 末尾复核与实施记录

- 唯一独立复核0严重/2重要/0轻微，重要项一次修正，无二次复核；最终完整check670/670、PG/内容/展会、重新生产构建与HTTP通过，精确SHA及CI实核以PR121为准。
- 过去pending误导出：原生产HTTP200≠409先RED，模型投影false先RED；新增只读calendarExportable在既有结束状态转换前计算，原状态/列表不改。保存白名单去除外部伪造元数据，历史pending无下载且409，已确认历史仍可导出，读取/拒绝全表不变。成本：公开投影增加一个可选布尔值，未来导出入口须尊重它。
- 语言配置错误：三个实际解析器/路由用例先异常RED，移入保护边界后通用503、no-store/nosniff且Payload0次；48聚焦全绿。
- 沿用户已接受建议实施，不重复申请既有授权；成本若预期不同需后续调整。历史展会可导出、未知/取消/延期/待公布拒绝，成本未来状态策略变化需另批。
- 语言参与UID，成本跨语言导入可能重复；实际客户端导入/覆盖/默认提醒未测，成本客户端可能重复或使用自身提醒，文件无VALARM且提示一次性。
- 已发布slug保持不可改，最初真实夹具被原400拒绝后补全表回滚断言；纯函数UID不依赖slug不开放改网址，未来标识迁移需另批。
- 订阅、邀请、分期独立事件和真实发送后续，成本本批无这些功能；原expiresAt不自动下架，成本历史确认内容需员工主动撤下。
- 初次基线端口EPERM原样重跑，控制字符lint改Unicode类别；夹具字面类型、原网址规则及JSON对象收窄按实际契约修正，未放宽校验。浏览器首次等待中断后实际控件下载成功，截图仅本机。
