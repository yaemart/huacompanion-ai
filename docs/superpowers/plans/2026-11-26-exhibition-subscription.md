# Exhibition Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 展会详情固定本届订阅，复用原确认、退订和管理闭环。
**Architecture:** 纯资格/专用标记校验，原申请事务取得内容锁后复读，原生表单增加固定展会模式。公开详情替换通用表单，不改邮件任务或订阅身份。
**Tech Stack:** Node24.22.1、Next/React/Payload、PostgreSQL15、现有锁定依赖。
**Spec:** docs/superpowers/specs/2026-11-26-exhibition-subscription-design.md

## Global Constraints

- 用户已接受正式设计并授权继续原生实施，完成测试、交接、推送草稿PR，不自动合并；不重复申请已给出的执行授权。
- 保留邮箱＋主题唯一、已确认语言、原核验/权限/审计、内容→邮箱→主题锁顺序和真实试发门禁。
- 无新依赖、集合、迁移、环境变量/.env变化；仅独立随机虚构库，原演示库不升级/reset；其他三份文档原样保留。
- 仅zh/en专用UI，旧通用请求兼容；结束当天有效、次日关闭，pending过去日期沿原状态规则，延期明确提示。
- 目标失效不自动撤销已有同意，原确认/退订保持；不订阅下一届、不生成提醒/资料/活动、不真实发送。
- 业务源码增删目标≤400；确认邮件/摘要/幂等/重试不改。末尾唯一独立复核，重要项单轮RED→GREEN修正。

## Review Focus

- 专用标记省略不能绕过单展会资格，混用policyReference/伪造路径/标题拒绝（任务1/2）。
- 展示时有效、提交时撤下或取消，原内容锁必须覆盖公开复读至入队提交（任务2）。
- 详情无效不得回退成全部展会主题，完整页面只出现一个订阅区；列表保持通用（任务2）。
- 跨语言重复不改变已确认语言；目标失效后原确认/退订不依赖公开状态（任务2）。
- 不把普通入口限流写入算作全表只读，不把confirmed当发送资格，未审核目标不泄漏（任务2）。

### Task 1: 共用资格和专用请求契约

**Files:** Create `src/lib/exhibition-subscription.ts`, `tests/exhibition-subscription.test.ts`.
**Interfaces:** Produce `ExhibitionSubscriptionTarget = Pick<ContentBody,"kind"|"locale"|"contentKey"|"slug"|"title"> & {exhibition?:Pick<Exhibition,"status"|"endDate">}`; `isExhibitionSubscribable(body: ExhibitionSubscriptionTarget | undefined, locale: string, today?: string): boolean`; `validExhibitionSubscriptionRequest(input: Record<string,unknown>): boolean` (missing marker preserves legacy contract; marker validates key/topic/zh-en/no policy/allowed keys, canonical path checked against published body in Task2).

- [x] 写字面日期2020/2090和固定2026-11-26的资格表：错误标识/语言/类型/状态、未知日期、当天/次日、pending过去日期、延期旧日期；专用标记错误类型、混用policy、未知键、错topic/语言与旧无标记。运行`node --experimental-strip-types --test tests/exhibition-subscription.test.ts`确认RED。
- [x] 实现最小资格及请求校验，复用effectiveExhibitionStatus、isContentIdentifier与isLocale，不引入服务端依赖。
- [x] 聚焦GREEN；完整npm run check通过，记录并提交。Task完成命令`npm test`，Expected全量通过。

### Task 2: 固定展会UI、事务申请和完整验收

**Files:** Modify `src/components/content/PublicSubscription.tsx`, `src/components/content/SubscriptionForm.tsx`, `src/server/subscriptions.ts`, `src/app/(frontend)/api/subscriptions/request/route.ts`, `src/app/(frontend)/globals.css` (仅需要时窄屏换行), `tests/integration/subscription-form.tsx`, `tests/integration/subscriptions.ts`, `tests/integration/exhibitions-http.ts`; Create `tests/helpers/exhibition-subscription-lifecycle.ts`, `tests/helpers/exhibition-subscription-http.ts`; update spec/handoff/progress/summary.
**Interfaces:** Consume Task1 helpers; `SubscriptionConsent.exhibitionKey?:string`仅瞬时校验；`SubscriptionForm.exhibition?:{contentKey:string;title:string;status?:Exhibition["status"]}`固定主题并提交标记。原请求输入和邮件任务/凭证接口不变。新增PG helper `testExhibitionSubscription(payload:Payload)`在原独立订阅集成驱动调用；新增HTTP helper在现有生产展会HTTP脚本调用，使用当前独立数据库守卫。

- [x] 实际PublicSubscription/SubscriptionForm增加固定名称/范围/无下拉/未知日延期/不回退/列表通用断言；先运行并确认旧通用选项失败RED，再接固定模式GREEN。
- [x] 实际API专用伪造标记/类型/额外字段先RED拒绝；在原请求校验后、Payload读前检查标记。queueSubscription中复用Task1，所有单展会申请在原事务先锁726271，再复读同语言同key公开body及资格；专用路径须等于当前exhibitionPath，不持邮箱锁反向取内容锁；验证字段不存入原data。
- [x] 在现有独立随机订阅测试库真实审核发布虚构目标，跑完整申请/模拟确认/只读预取/确认/退订/再同意，核对旧凭证、跨主题/下一届不串联、跨语言已确认语言不变、失效后确认/退订、目标改稿隔离/撤下/重发、管理员/普通编辑/撤权及CSV。
- [x] 用独立PG连接持原内容锁，按pg_locks观察真实申请阻塞；分别先提交撤下/取消或先让申请提交再撤下，核对拒绝零订阅/零队列和允许pending历史；正常限流计数单独核对，服务拒绝与GET完整表指纹不变。先用真实旧缺锁行为获得RED，再实现GREEN，不以sleep猜锁。
- [x] 生产构建后真实HTTP验证详情固定本届/列表通用/配置及语言隐藏、转义/状态/目标改稿与撤下、旧日历和下一届回归；实际浏览器中英文申请/模拟确认/退订、失效错误保留输入和390宽度。任务服务/虚构库独立清理，原3100保留。
- [x] 完整check、订阅全部回归、相关展会/content/实际渲染、重新生产build/HTTP通过，Task完成命令`npm test`，Expected全量通过；更新文档与一页小结，提交推送并尽早建草稿PR。
- [x] 唯一末尾复核与重要项单轮RED→GREEN及完整suite；轻微记录延期。精确最终HEAD及两作业CI日志的实核结果由PR123交付记录承载，不自动合并。

## 实施判断

用户已接受正式设计并明确继续实施，沿此前原生执行与原地分支偏好；本计划将已批准范围转成测试步骤，不增加重复审批。Task1两项纯函数/类型由Task2精确消费，服务端资格与显示共用；旧通用请求不带标记保持原契约。设计明确保留的语言唯一性、失效后同意、邮件编号、过去pending状态及真实发送边界作为验收条件，不另行扩展。

## 末尾复核与交付记录

唯一末尾独立复核0严重/1重要/2轻微，无二次复核。重要项是“零活动任务”验收默认depth展开subscription对象后与数字ID比较而漏检；测试手动创建真实关联的held任务，旧断言出现Missing expected rejection RED，改为按subscription ID过滤p.count后GREEN：0通过、真实1拒绝、清理回0通过，且探针清理全表不变。探针仅虚构测试数据，不触发活动或发件。最终完整check723/723、lint0/445、857文件行长及完整订阅39组退出0；本轮只改测试和文档，git已核对产品源码/锁依赖/config相对1e1ae3c未变，沿用其最终CSS构建/HTTP/浏览器通过证据。
轻微延期两项：HTTP草稿隔离仅断言未出现草稿标题，空区也可能通过，服务层隔离另有覆盖；专用400文案仍说“检查主题”，虽不可改主题但刷新提示和输入保留有效。本轮不增加正向断言或文案润色。
复核范围判定：提醒/营销调度/真实送达留后批，成本本批不证明通知或生产投递就绪；分语言身份/偏好及跨届同意迁移保持既定兼容，成本需新届另同意且此处不能编辑语言；邮件标题快照及通用操作页改版后批，成本邮件和操作页仍沿用编号/通用标签；内部startSubscription仅测试辅助且无公开申请入口，保持原语义，成本未来暴露时必须补公开门禁与队列验收。

原生/原地执行和隔离检查沿用用户偏好，代价为共享路径需协调；设计已接受继续授权，未重复计划审批，若预期不同需后续调整。最终SHA/CI由PR123记录，不以中间提交绿灯替代。
