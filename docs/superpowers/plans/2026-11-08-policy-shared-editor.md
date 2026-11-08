# 共用事实第4批：统一读取与事实编辑器

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接通统一正式事实读取，并提供可操作的共用事实编辑、二审及历史查看页面。

**Architecture:** 公开读取沿用内容事务锁，一次锁内读取唯一事实引用和本语有效说明；旧正式政策与新正式事实混存时拒绝混合输出。新事实编辑页面复用国家／单位／列表组件，所有操作仍调用已验证的事实服务。两语说明编辑界面与受保护重建留下一批。

**Tech Stack:** Node24.22.1、Next16.4本地文档、Payload3、PG15，无新依赖／环境项／迁移。

**Spec:** docs/tasks/2026-11-08-policy-shared-facts.md；policy-entry-ux.md；local-test-checklist.md。

## Global Constraints

- PR29已实核合并57f24b0；新分支codex/policy-shared-editor基于最新origin/main。沿用任务checkout，所有数据库写入在随机c4克隆，保留原55438／演示55442及3100旧副本。
- 业务改动不超过400行，测试不计；lint警告不超过465。不开AI／邮件／语音／通话／worker，不购买／部署／自动合并。
- 现有事实／说明权限、实际参与人禁止自审及管理员有因例外不改；不新增保存即发布路径。
- 公开只返回固定事实白名单和当前事实对应的已审说明，待复核或缺失时事实仍显示；不缓存语言事实引用。
- 源库正式升级、8条虚构旧政策受保护清理、新样例及演示脚本切换留后续，不在本批偷偷迁移或reset。

## Review Focus

- 旧、新正式数据混存：不能按语言回退或拼接，须明确拒绝；完全旧数据继续旧整体读取，完全新数据共用引用。
- 说明工作稿正在改写／退回：同事实旧已审说明仍显示；事实更新后不暴露旧说明和员工／内部备注。
- 浏览器携带过时revision、伪造身份／板块及跨源POST：服务端拒绝；readonly角色不能通过按钮或API写入。
- 选国家／换类型／编辑已有值：不能把小时换算旧天数，不能丢事实字段或静默覆盖手填标识；提交前必须保存。
- 请求失败、重复点击、切换记录：错误时保留已填内容，审核确认失效；不得误操作另一个政策或复用旧确认。

### Task 1: 统一读取与事实界面

**Files:** shared-public.ts、shared-editor.ts、policy-shared-form.ts、新事实页面／API／组件，复用PolicyFields与PolicyList；新增纯测试和隔离集成、CI脚本、实际进度／交接／一页中文小结。

**Interfaces:** sharedPolicyForm(facts?)返回现有PolicyForm（仅事实）；sharedPolicyInput(form)返回共用facts补丁，显式maximumStay/stayUnit；readSharedFactEditor(p,user,groupId?)在事务中返回当前员工权限、组列表、选中组／事实稿／历史、国家／核实人和中国日期默认值。API GET/POST均关功能时404，鉴权及no-store；POST校验Origin与限量JSON后调用mutateSharedPolicyFacts，不接受客户端角色权限。

**Public transition:** listPublicPolicies在一次contentTransaction内读取旧正式快照及新正式组。存在旧正式政策且新组正在生效时拒绝；无新生效组可整体读取旧快照，清理后新组直接读取统一事实。不得从旧快照补新组缺少的语言说明。该兼容门禁只用于本地阶段切换，不是按组／语言回退。

- [x] 表单纯测试RED→GREEN：天／小时双向转换、缺失值不隐式填240、无说明字段或数组对象泄漏。
- [x] 隔离集成RED→GREEN：读取鉴权／撤权、默认值／列表、事实编辑到二审；统一两语、独立说明及事实变更失效、内部字段不泄漏、旧新混存拒绝、并发发布读取一致。
- [x] 实现浏览器可操作事实页；桌面及窄屏检查保存、送审、退回原因、发布／下架；历史另存服务已实现，本轮界面仅列已发布历史，恢复按钮随两语说明界面补齐、错误保留、角色边界。
- [x] npm run check、相关旧新集成、隔离build、配套恢复校验；记录源库／真人场景边界与业务行数。
- [x] 一次全分支独立复核，修复Important／Critical后推送唯一草稿PR，fetch核对远端；合并后再接说明界面和受保护重建。
