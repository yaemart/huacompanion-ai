# 共用事实第5批：两语说明编辑与横幅统一读取

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接通中文／英文说明编辑、独立二审、当前事实对照及事实／说明历史另存；横幅统一使用不可变事实。

**Architecture:** 复用已合并说明服务，在同一内容事务内读当前正式事实／说明／员工权限。复用事实页面入口按locale选择说明页；POST仍校验Origin、限量JSON、当前权限、factVersion与revision。横幅整段读取持内容锁，保留整体旧结构兼容但拒绝旧新正式混存，不按语言回退。

**Tech Stack:** Node24.22.1、Next16.4本机文档、Payload3、PG15，无新依赖、环境项或迁移。

**Spec:** docs/tasks/2026-11-08-policy-shared-facts.md；policy-entry-ux.md；local-test-checklist.md；PR30合并main33c36d4。

## Global Constraints

- 从最新origin/main建立codex/policy-language-editor，沿用已批准任务checkout与随机克隆隔离，不重复申请设计批准。不升级／清理／reset原55438与演示55442，不同步3100旧副本；精确清理重建与默认入口切换留下一顺序PR。
- 业务新增与删除合计不超过400行（测试、文档不计），lint警告不超过465，源码最长200字符。一行一条语句，不压缩函数。
- 不改变板块／角色权限、双人审核、禁止实际参与人自审／管理员例外原因；事实变化后说明必须重新核对，不自动补翻译或批准。
- AI、邮件、语音、通话、worker关闭；不购买、不部署、不自动合并，不引入P1/P2编辑功能。
- 配套备份并恢复到随机c5库验证所有写入，保留源66表和8旧政策；只允许临时克隆/CI测试，不放宽原CLI或55438专用套件限制。

## Review Focus

- 浏览器停留期间事实发布／下架：说明操作明确409，输入保留、审核勾选失效；不能批准过时说明或清新版待办。
- 一语改稿／退回／下架与另一语批准并发：只操作本语，预览只用当前不可变事实，不泄露内部备注／员工身份／未审说明。
- 伪造locale、缺失/无效组编号、旧JWT撤权、跨源及大JSON：页与接口服务端拒绝，不通过角色props授权写入。
- 历史另存只生成新草稿，待审期间拒绝另存；已有正式说明网址锁定，不让历史恢复绕过双人审核。
- 旧新正式数据混存、指定新组已下架、同组其他语言旧快照：横幅不能回退旧语言事实，比较上一正式事实时不得读工作稿；读与发布串行不撕裂。

### Task 1: 说明界面、历史操作及横幅读取

**Files:** shared-notes-service.ts、PolicyNoteWorkbench.tsx、现有事实page／Workbench与新说明POSTroute；shared-banner.ts、banner.ts；新隔离集成、HTTP和SSR测试及CI、中文小结和交接。

**Interfaces:** readSharedPolicyNote保留原group/draft/versions/warning，并在同一事务增加locale、当前正式facts（固定公开白名单，或null）、factRevision、依据事实生成的defaultBody和实际permissions。无正式事实时可保存说明，但不得送审／发布；显示事实第N版和待复核状态。说明表单只有本语title/slug/publicNotes，数值提示实时规则检测、不修改文本。

**UI:** /content-center/policy-facts?id=N&locale=zh|en；无locale保持事实页。事实页与说明页可在无未保存修改时切换；说明保存／送审／有因退回／二审发布／下架／历史另存都带事实版本及稿revision，写后整页重读授权。事实另存按钮恢复，仍重新送审。公开说明按语独立，不用两次复制事实。

**Banner:** 内容事务内取得新正式组；没有新生效组时可整体旧读取，但存在同key的新组时不得退旧。新组按唯一事实引用和上一事实revision比较，输出固定公开事实，无语言稿／内部字段；其他新组生效时未匹配key只显示尚未确认。旧新正式混存503拒绝。原横幅日期／延期／强制尚未确认规则不改。

- [x] 新读取／横幅集成先RED，再实现：权限／默认标题、同事实预览、旧新混存、延期及下架无回退、语言一致、并发一致；原文／二审／历史／错误回滚沿用既有服务回归。
- [x] 说明SSR先RED再实现：事实只读、语言身份／高级标识、数值提示、待复核／缺事实、只读角色、禁自审、历史按钮状态及原文保留。
- [x] HTTP验证新路由权限、Origin、locale、revision／factVersion冲突、畸形／过大JSON、no-store和开关默认404，显式测试开关不依赖本机配置。
- [x] 浏览器两语独立编辑／审核／事实变更提示／历史另存，桌面和390窄屏；截图忽略目录，未上传明确说明，不冒称真机／新人计时。
- [x] check、相关新旧串行集成、生产构建及开关HTTP、配套恢复；一次独立全分支复核，Important/Critical单次RED→GREEN修复，提交唯一草稿PR并核对远端和对应head CI。
