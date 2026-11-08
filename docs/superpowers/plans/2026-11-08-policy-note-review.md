# 共用事实第3批：两语说明独立审核

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 两语说明分别保存、送审、退回、审核发布、历史另存和下架，不能改变正式事实或恢复过时说明；补齐数值提示和严格公开说明投影。

**Architecture:** 沿用contentTransaction→policyActor锁顺序和新集合；显式group/locale/factVersion加revision校验。说明版本不可变，批准只改本语言的正式引用和复核标记、完成精确版本的同语待办；其余语言／事实指针保持原样。只增加受信任内部服务和纯函数，不接旧公共读取或新页面。

**Tech Stack:** Node24.22.1、Payload3、PostgreSQL15；无新依赖、环境键、集合或迁移。

**Spec:** docs/tasks/2026-11-08-policy-shared-facts.md、policy-cleanup-scope；PR28已实核合并3ec9a2d。

## Global Constraints

- 从最新origin/main新建codex/policy-note-review；原工作区干净，沿用任务checkout与随机克隆隔离所有写入，原55438和演示55442不升级／清理／reset，3100保留旧副本。
- 400行业务上限（测试／迁移目录不计），lint不超过465；不新增外部服务、账号、依赖或UI，不启用AI／邮件／语音／通话／worker，不部署和自动合并。
- 已批准设计及“合并继续”覆盖本批，不重复申请批准；清理范围不扩大，实际清理前仍须停写盘点。旧界面和公共读取的切换、虚构样例重建留后续逐PR合并。
- 双人审核、板块权限、参与人禁止自审／管理员原因沿用；每次事务重载员工。说明保存不修改事实；事实变更后提交／批准必须按当前版本重新校验。
- 没有已批准的当前说明时只返回事实；普通说明改稿／送审／退回不影响同一事实下旧已批准说明。历史另存只是新草稿，不自动沿用旧批准。

## Review Focus

- 审核期间事实发布或下架：说明批准失败，不清除新版任务，也不把旧审批挪到新事实。
- 中英文并发审核、同语重放：每次只改自己语言的说明引用／任务，正式事实指针与另一语不变。
- 工作稿编辑／退回中仍有同事实已批准说明：严格投影使用不可变版本，不泄露未审改稿，也不误隐藏旧已审文案。
- 伪造角色／板块授权、已停用员工、参与人自审／跨组跨语言恢复：事务中拒绝，管理员原因必记审计。
- 任务完成或审计写入失败：版本、引用、needsReview及待办整体回滚；数值提示只提示，不阻止原文保存或调用AI。

### Task 1: 说明服务、投影和提示

**Files:** 新src/server/immigration/shared-notes-service.ts、src/lib/policy-shared-notes.ts、tests/policy-shared-notes.test.ts、tests/integration/policy-note-review.ts；package/CI；相关测试克隆白名单仅加新随机c3隔离库；一页中文小结／交接／进度／指南。不改集合字段或迁移。

**Interfaces:** mutateSharedPolicyNote(p:Payload,user:ContentUser,input:{action:'save'|'submit'|'return'|'publish'|'restore'|'unpublish';groupId:number;locale:'zh'|'en';factVersion:number|null;revision?:number;body?:unknown;versionId?:number;noteReviewed?:boolean;note?:string;overrideReason?:string}):Promise<PolicyNoteDraft>。readSharedPolicyNote(p,user,groupId,locale)返回group/draft/null/最多50历史版本/warning，先重载授权。policyNoteDraft(value:unknown)严格只允许title/slug/publicNotes三个字符串字段（可缺省为补丁），标题最多200、slug现有100字符规则、说明最多4000，保留说明原文；explanationFactWarning(value)给出固定中文提示或null；approvedSharedNote(groupId,locale,factVersion,draft,version)返回严格title/slug/publicNotes或null，不返回员工／内部信息。

**Semantics:** 所有写入带预期factVersion（可null），与组当前指针不符409。保存／恢复需编辑权限，待审冻结；新草稿允许事实未发布，但送审／批准必须有当前正式事实，且说明basedOnFactVersion精确匹配。已有正式历史后slug锁定；重复同语slug给中文409，不能静默覆盖。空说明允许经人工审核作为“无额外说明”，不凭空补译文。每语sourceRevision、contributors和管理员原因独立记录；保存／恢复／送审不碰publishedNoteVersion及已有needsReview（原先已审同事实仍可显示）。批准创建不可变说明版本、清本语needsReview、完成policy-note-review:<group>:<locale>:<factVersion>精确任务；下架清本语引用、标待复核并重开该任务，不改变另一语。历史只允许同组同语，复制为依据当前事实的新草稿，须重新二审。每次操作均审计。

**Visibility:** 以publishedNoteVersion指针、needsReview=false、版本同组同语且basedOnFactVersion=当前事实共同决定；工作稿reviewState不是已发布说明是否可见的条件。无事实指针／无说明／待复核／引用错配均null；调用方以后必须在一致读取中提供这些对象，本批不新增读库公开入口。

- [x] 单元RED→GREEN：草稿白名单／类型／长度、日期／天／小时提示（中英文、原文不变），固定投影同版本可见、待复核／错配／未发布隐藏、草稿改稿不影响旧已审投影。
- [x] 隔离集成RED→GREEN：两语独立工作流／参与人自审／管理员原因；事实变更／下架拒绝旧提交批准；同语并发一次成功、两语互不阻塞；旧已审说明在新草稿期间继续可见；历史恢复／slug锁定／重复／跨语跨组拒绝。
- [x] 故障注入任务／审计写入失败全回滚，批准只完成同语同事实待办，下架重开本语任务；无邮件队列、新事实版本或指针变化。
- [x] 备份恢复到随机c3克隆后按顺序装已合并基础／任务迁移，旧表原列指纹不变；新说明与原事实服务／政策审核查询回归、check、隔离build；不修改原安全CLI限制。
- [x] 独立整分支复核一次；记录实际测试和未做的真人／浏览器／新页面范围；E1–E4/C1–C3继续旧界面回归，新说明规则仅自动集成。
- [x] 提交推送唯一草稿PR，核对origin与head CI；本批合并后再接新编辑器／统一公开读取与受保护重建。
