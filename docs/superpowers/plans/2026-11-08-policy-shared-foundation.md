# 共用事实第1批：数据基础实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立已批准共用事实的5类存储对象及约束；保留现有读写，尚不清理旧演示政策。

**Architecture:** 5个后台隐藏集合，普通REST写入关闭，正式版本在Payload和数据库均禁止更新/删除。政策组只有一个正式事实引用；外键及归属触发器确保事实/说明引用属于同组及同语言。纯校验器将新显式天/小时事实映射到既有发布校验，不使用旧过境默认240推断新事实。

**Tech Stack:** Node24.22.1、PostgreSQL15、Payload3、现有Next服务端，零新依赖。

**Spec:** docs/tasks/2026-11-08-policy-shared-facts.md；docs/tasks/2026-11-08-policy-cleanup-scope.md（用户本轮已确认清单，变化即停）；总指令400行业务上限，迁移/测试不计。

## Global Constraints

- 接手续用codex/policy-shared-facts-plan，基于13d7e02，已ff-only同步；保留ed0ebd6清单，不新开叠加PR。
- 本批只加结构，不切换旧API/公开读取，不清理旧ID1–8，不改演示种子或客户数据，不重置。
- 仅在55442集群新建的一次性克隆库运行新迁移/写入；原55438、演示源库与3100进程保持原状态。升级前配套备份和恢复指纹验证；源库不执行schema push。
- 原审核角色/板块边界/禁止自审和管理员原因由下一批服务接入，不让隐藏集合成为绕过路径。无外部服务、账号、worker、购买或部署。
- check全通过、lint不超过465；截图不进Git；每次交付明确E1–E4、客户C1–C3的可测范围。

## Review Focus

- 事实快照含私有核实人/备注，匿名和普通运营不能通过新REST/Local API直接读取。
- 直接更新或删除已创建正式版本、批量更新及SQL绕过Payload都必须失败。
- 组A不能把组B事实设为当前版本，中文草稿不能引用英文正式说明。
- 新结构的过境时长必须显式小时正整数，不能靠旧maxStayDays或未填值推断240。
- 回滚有任何新结构数据时拒绝；旧66表内容在up/down/up前后不变。

### Task 1: 结构、验证器和迁移约束

**Files:** 新src/lib/policy-shared-facts.ts、src/cms/immigration/shared-collections.ts、src/migrations/20261108_140000_policy_shared_foundation.ts；修改payload.config.ts、migrations/index.ts、生成payload-types.ts；tests/policy-shared-facts.test.ts、tests/integration/policy-shared-foundation.ts及CI脚本；中文小结和指南/交接/进度。

**Interfaces:** validateSharedFacts(value: unknown, today: string, allowFictional: boolean): asserts value is SharedPolicyFacts；publicSharedFacts(facts: SharedPolicyFacts): PublicPolicyData（不含说明、核实人、内部备注）；SharedPolicyFacts沿用国家/日期/来源/核实字段，停留仅maximumStay和stayUnit。集合policy-groups、policy-fact-drafts、policy-fact-versions、policy-note-drafts、policy-note-versions。group.activeFactVersion唯一事实指针；两类正式版本不更新删除；note-draft的basedOnFactVersion及publishedNoteVersion均有同组约束，后者同时同语言。复核待办和发布事务由下一批使用这些接口实现。

- [ ] 写单元RED：新事实显式单位/数值、合法天/小时、名单/日期、未知/私有说明键拒绝、公开固定投影无私有信息；原对象不被改写。
- [ ] 写克隆集成RED：5表存在、重复组/工作稿/版本拒绝、错误跨组/跨语言指针拒绝、Payload及SQL快照改删拒绝；匿名/运营/审核人直接集合访问拒绝。
- [ ] 实现最小结构及校验器；生成类型；up只新建5表及索引/FK/不可变触发器，down先检查5表均空，不cascade删除旧表。
- [ ] 已批准清单只读复核；配套备份恢复到新库；在新库up/down/up及完整迁移注册检查，核对66表原列指纹不变；最后保留源库、移除本批临时库。
- [ ] check及相关政策工作流/查询集成通过；一次独立全分支复核，记录实际验收/限制。
- [ ] 本PR交付场景：E1–E4与客户C1–C3回归现有界面，无共用事实新操作；真实德美和真人计时仍未验。新同步发布/分语复核验收留下一批，不宣称C完成。
- [ ] 提交推送同一分支，建立唯一草稿PR并核对最新远端/CI，不自动合并；之后须等用户合并才开下一批。
