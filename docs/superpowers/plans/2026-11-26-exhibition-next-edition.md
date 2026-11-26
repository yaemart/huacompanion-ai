# Exhibition Next Edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 人工关联同语言下一届展会，旧展会结束后展示有效公开目标，未定日期明确提示。
**Architecture:** 可选JSON键与纯关系解析/发布校验；原内容锁复读公开快照，精简候选复用工作台读取，公开和预览共享组件。
**Tech Stack:** Node24.22.1、Next/React/Payload、PG15与原锁定依赖。
**Spec:** docs/superpowers/specs/2026-11-26-exhibition-next-edition-design.md

## Global Constraints

- 人工指定，不猜系列/年份；下一届日期待公布可链接并标注。
- 同语言、同类型、非自指、无回环；已知日期目标开始晚于来源结束；取消/结束/撤下隐藏。
- 仅当前公开目标，保留原审核/来源/修订/审计和内容事务锁；旧内容无键兼容、不补写。
- 原列表、旧网址、咨询、JSON-LD及.ics不变，无自动重定向/跳届。
- 无新依赖/集合/迁移/环境变量/.env变化；不升级/reset原演示库，独立虚构随机库。
- 新分支从origin/main610ccec开始，其他三份文档不动；原生执行，末尾唯一独立复核，草稿PR不自动合并。

## Review Focus

- 公开目标的草稿改名/取消不可先影响来源页面，撤下后须立即隐藏（任务2）。
- 来源过去pending被现有展示变成ended，不能冒充已确认历史；目标同类转换也不可绕过状态限制（任务1/2）。
- 双向并发审核不得产生回环，失败前后全表不变（任务2）。
- 候选不能随1000条草稿截断漏项或用待审核标题替代公开标题（任务2）。
- 缺翻译/停用语言/目标长期失效时，保留原选择供修正，不跨语言或跳转其他届（任务2）。

### Task 1: 可选引用与纯关系规则

**Files:** Modify `src/lib/exhibitions.ts`, `src/lib/content-model.ts`; Create `src/lib/exhibition-next-edition.ts`, `tests/exhibition-next-edition.test.ts`.
**Interfaces:** `ExhibitionEdition = Pick<ContentBody,"kind"|"locale"|"contentKey"|"title"|"slug"|"calendarExportable"> & { exhibition?: Pick<Exhibition,"startDate"|"endDate"|"status"|"nextEditionKey"> }`; Produce `isNextEditionTarget(source, target, today?): boolean`, `resolveNextEdition(source, published, today?): ExhibitionEdition | undefined`, `validateNextEditionPublication(source, published): void`.

- [x] 先写旧缺键兼容/白名单/标识/自指、同语言类型、状态/日期、未知日、历史pending投影、回环断言，独立字面日期2020/2090；运行`node --experimental-strip-types --test tests/exhibition-next-edition.test.ts`确认RED。
- [x] 加可选nextEditionKey、缺省空值和白名单；保存自指校验；纯函数实现同语言目标判定、结束后解析和可操作发布拒绝。只按直接引用，不跟随找其他届。
- [x] 同命令GREEN及完整npm test/typecheck，更新进展并提交模型/设计/计划。

### Task 2: 原审核集成、编辑、公开与预览

**Files:** Modify `src/server/content/service.ts`, `src/app/(frontend)/api/content-center/route.ts`, `src/components/content/ContentCenter.tsx`, `src/components/content/ExhibitionFields.tsx`, `src/components/exhibitions/ExhibitionPage.tsx`, `src/app/(frontend)/content-preview/[id]/page.tsx`, `src/lib/exhibition-copy.ts`, `tests/helpers/exhibition-preview-render.ts`, `tests/integration/exhibition-filters-render.tsx`, `tests/integration/exhibitions.ts`, `tests/integration/exhibitions-http.ts`; Create `src/components/content/ExhibitionNextEditionField.tsx`, `src/components/exhibitions/ExhibitionNextEdition.tsx`, `tests/helpers/exhibition-next-edition-lifecycle.ts`, `tests/helpers/exhibition-next-edition-http.ts`.
**Interfaces:** Consume Task1；新增content-center响应`exhibitionChoices: ExhibitionEdition[]`，只在有展会板块权限时返回同集合已公开精简数据；helper复用现有独立PG/HTTP配置和人员，入口数据库守卫保持。

- [x] 实际组件补选择/旧选项丢失/七语言公开链接与未知日期/无效目标隐藏断言，实际预览存储边界供公开目标，先运行确认RED；PG在来源审核前写关联并断言真实发布服务拒绝错误关系。
- [x] 在原contentTransaction发布阶段调用validateNextEditionPublication；复用已计算visible输出精简候选，不取草稿标题，不依赖草稿1000上限；选择走原field取消核验。
- [x] 新原生选择字段与共享公开/预览关联展示，七语言三项标签；预览鉴权后仅在站点语言启用且存在引用时读取公开目标。
- [x] 运行真实PG关系生命周期：合法/未知日期、缺人工核验/错板块/编辑者/跨语言/回环拒绝、两任务并发互链至少一拒绝且最终无环、目标草稿不泄漏/变更/撤下、来源版本恢复与旧字段兼容，全表指纹拒绝/读取保持。
- [x] 生产HTTP验证来源ended路径200无重定向、目标原公开标题、目标改稿隔离/下架与取消/结束隐藏、再发布恢复、pending日期提示及旧.ics回归；接入已在CI运行的展会脚本。
- [x] 完整check/相关展会与内容/渲染/生产build及HTTP，实际浏览器保存/审核提示、公开桌面/390宽度、缺目标旧值恢复验证；仅清理本任务server/随机库。
- [ ] 更新docs/handoff.md、docs/progress.md及一页中文小结，提交推送草稿PR；末尾唯一独立复核，重要项单轮RED→GREEN修正，核对最终SHA对应CI，不自动合并。

## 实施判定

用户接受上一条具体范围并接受直接推进，沿用原生方式与既有推送草稿授权，不重复申请执行方式或设计确认。普通checkout沿前批原地任务分支，不新建worktree；三份其他任务文档保留。
已确认原contentTransaction统一advisory lock726271，关系校验/公开读取在同事务req内执行；不另设锁或关系集合。没有新业务身份或自动发送能力。
