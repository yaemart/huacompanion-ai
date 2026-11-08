# 共用事实第2批：事实审核与说明复核待办

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在隐藏新结构上完成事实编辑、送审、退回、发布、历史另存、下架；事实发布原子失效两语说明并创建站内待办。

**Architecture:** 复用contentTransaction全局内容锁、policyActor的员工锁及数据库重载授权；只提供受信任服务接口，不新增UI或HTTP入口。事实草稿采用乐观revision，正式版本只新增；发布统一指针、说明失效、待办及审计同事务。待办增加policyGroup可空关联，继续用现有工作台权限／领取入口，明确不触发邮件。

**Tech Stack:** Node24.22.1、Payload3、PostgreSQL15，现有依赖。

**Spec:** docs/tasks/2026-11-08-policy-shared-facts.md、2026-11-08-policy-cleanup-scope.md、2026-11-08-master-plan.md；PR27已合并0f7963f。

## Global Constraints

- 从最新origin/main 0f7963f新建codex/policy-fact-review，工作区开始干净；沿用本机任务checkout，以新克隆库及独立源码副本隔离所有写入。原3000/55438、演示3100/55442不升级／清理／reset。
- 400行业务上限（迁移／测试不计），lint最多465；不新增依赖、账号、环境键或服务；不用真实政策、AI、外发邮件、语音、通话或worker进程。
- 已批准设计和继续指令覆盖本批实现，不重复申请批准。仍不清理8条旧政策；清单变动在实际清理前停止。说明独立审核、编辑器、统一公开读取及保护重建留后续逐个合并PR。
- 保留原编辑／审核板块边界、禁止参与人自审及管理员有原因例外；新服务不相信调用方传来的旧角色；不改变全局锁次序。
- 仅在本批随机克隆／CI验证迁移和服务；备份含媒体空状态及恢复证明，原表原列指纹不变；有新待办关联时down拒绝。

## Review Focus

- JWT／传入员工角色过时或伪造：事务内重载员工并按政策板块检查；被停用、失去板块权限的审核人不能发布。
- 同一个送审修订并发发布或旧revision重放：只生成一个正式版本和两条语言待办；失败不切生效指针。
- 事实发布中途待办／审计写入失败：事实版本、指针、两语说明失效和审计全部回滚。
- 两语说明缺失、已有或正在审核：发布事实均不受阻，已有说明保留旧快照、标待复核并作废旧送审；按组／语言／事实版本生成任务，旧任务关闭。
- 待办负责人停用／失去板块权限及普通主管／越权运营：失效负责人释放，授权政策员工才能看／领；通用完成按钮不能代替说明审核，也不生成邮件。

### Task 1: 事实审核服务与可见的站内复核待办

**Files:** 新src/server/immigration/shared-facts-service.ts、shared-note-tasks.ts；修改src/lib/policy-shared-facts.ts（严格草稿白名单）、src/cms/workflow/collections.ts、src/server/workflow/service.ts；新迁移20261108_160000_policy_note_tasks.ts及注册／生成类型。测试tests/policy-shared-facts.test.ts、tests/integration/policy-fact-review.ts及CI；更新小结、交接、进度和本地指南。

**Interfaces:** mutateSharedPolicyFacts(p: Payload, user: ContentUser, input: {action: 'save'|'submit'|'return'|'publish'|'restore'|'unpublish'; groupId?: number; revision?: number; contentKey?: string; facts?: unknown; versionId?: number; policyReviewed?: boolean; note?: string; overrideReason?: string}): Promise<PolicyFactDraft>。readSharedPolicyFacts(p,user,groupId)返回组／工作稿／最多50个历史事实版本，先授权。sharedFactDraft(value: unknown): Record<string,unknown>严格白名单并克隆，不允许语言说明或服务字段。

**Semantics:** 新组键符合现有contentKey规则，重复显式409；保存不完整事实允许，但国家必须有效；送审和发布完整校验（中国日期、有效核实人）。送审期间不可编辑。审核覆盖实际编辑／提交参与人；管理员例外必有原因，退回必有原因。正式revision连续递增，sourceRevision记录精确送审修订；发布/下架同时更新组revision。restore仅同组不可变历史复制为新草稿，不能直接改正式指针。审计记录组／草稿／正式版本／操作者／原因／操作，审计失败也回滚。

**Tasks:** syncSharedNoteTasks(p,req,group,versionId|null)按policy-note-review:<group>:<locale>:<version>幂等创建／关闭，现有说明工作稿revision+1、needsReview=true、reviewState=draft，保留旧版本引用及原文。无说明也创建两语言任务；初始无负责人，授权员工可领取。refreshSharedNoteAssignees(p)使用同序锁释放失效负责人，工作流读／运行前调用；不以领取／完成待办代替审核。可空policyGroup只加workflow-tasks，工作台仅政策板块可见；done拒绝；通用worker跳过这些任务，不发外部邮件。无新待办链接，等编辑器接入。

- [x] 单元RED：sharedFactDraft拒绝语言说明、未知键、非对象，保留不完整值并深拷贝；GREEN实现。
- [x] 克隆集成RED：缺新服务；覆盖新建／重复／国家、保存冻结、提交／退回／复提、参与人自审／管理员原因、当前核实人授权、伪造／撤销角色、陈旧修订。
- [x] GREEN实现事实服务和严格投影；两语说明失效和幂等任务；历史恢复和下架再发布；禁止修改历史。
- [x] 覆盖两语缺失／正在审核、原子失败、并发双发布；工作台权限／领取／释放失效人员／不许手工完成；无邮件任务。仅在隔离库运行。
- [x] 新迁移up/down/up保留71张旧表原列，down有policyGroup引用拒绝；完整空库迁移、schema push后约束检查；生成类型。
- [x] npm run check、原基础集成／审核／查询及新待办集成、隔离生产build通过；旧通用workflow本地专用库限制拒绝，保留限制并交一次性CI核验；独立全分支复核无确定缺陷。
- [x] E1–E4/C1–C3场景表：旧UI回归；新事实审核与复核任务服务测试完成，不冒称新编辑器/公开读取或真人计时完成。源库不刷新／reset。
- [x] 提交、推送唯一草稿PR，核对origin提交和对应CI；本批合并后才继续说明审核／新编辑器。
