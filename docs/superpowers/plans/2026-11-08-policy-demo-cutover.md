# 共用政策：受保护演示切换

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在已确认8条虚构政策范围内完成演示重建，默认政策入口切到新事实／说明编辑器，保持非政策数据。

**Architecture:** 一次性清理由显式管理员命令执行，核对固定ID及完整行指纹、引用闭包，事务内删除并审计；不放进启动自动执行。新种子只生成4组事实和8份说明草稿，幂等不覆盖修改；启动旧演示先拒绝，受保护升级完成才放行。正式迁移安装后关闭演示schema自动push。浏览器用运营提交／审核人批准，禁止种子自动批准。

**Tech Stack:** Node24.22.1、PG15、Payload3、Next16.4本机指南，无新依赖／外部服务。

**Spec:** docs/tasks/2026-11-08-policy-shared-facts.md；2026-11-08-policy-cleanup-scope.md；local-test-checklist.md；PR31合并main6f3c9ae。

## Global Constraints

- 复用已授权checkout，从最新origin/main建codex/policy-demo-cutover；源55438不写，55442只清理已批准8政策及关联。停写后完整盘点，范围变化必须停止。
- 原政策／图片配套备份，先随机c6克隆演练恢复、失败回滚、幂等和非政策指纹；SQL函数不接受任意表／宽泛删除。源执行前复核批准清单和完整行指纹，管理员身份重载，清理本身审计。
- 业务改动新增＋删除不超400行，lint不增465，源码最长200，一行一条语句。若实现安全保护需要超过预算，拆顺序PR，不压缩书写。
- 不改审核／角色权限、成本／客户数据业务规则。政策只用XY/XZ/XW/XQ并标虚构；种子不自动提交／批准，演示验收明确通过真实UI分角色操作。
- 源网站停用／重新启动在明确验证迁移后进行；不能复制.env，不全库reset，不删除dev标记，不假称旧新配对迁移。
- AI／邮件／语音／通话／worker关闭，不购买、不部署、不自动合并。每次提交check与相关集成，推送一个草稿PR，最终核对远端及对应head CI。

## Review Focus

- 固定ID仍在但正文被修改、新增关联／横幅／编辑锁、真实国家或其他库：清理在写入前拒绝，不能扩大清单。
- 跨表删除级联：任何不在批准闭包的行必须保留，审计失败／种子失败不能静默继续启动；配套备份已恢复验证。
- 重启／部分失败重试：旧库不自动清理，新seed不重复组／草稿，不覆写审核或运营修改；版本标记不代替实际DB安全检查。
- 旧政策入口与新说明：功能关闭／撤权仍拒绝，默认链接到同一个新事实页，不再诱导重复中英事实录入；数字提示／二人审核不退化。
- 演示升级后停止／启动及新库初始化：正式触发器都存在、schema自动push确实关闭；原55438、非政策内容、账号权限、客户／报价／图片原列指纹不变。

### Task 1: 受保护清理、草稿种子和入口切换

**Files:** scripts/lib/policy-demo-cleanup.ts、scripts/lib/policy-demo-seed.ts、demo-seed.ts／demo-fixtures.ts／demo.mjs／demo-environment.mjs；payload.config.ts、content-center/page.tsx、PolicyNoteWorkbench.tsx；新纯／集成／HTTP测试和CI；中文小结、指南及交接。

**Interfaces:** cleanup函数接固定批准范围的行指纹manifest和管理员ID，校验本地专用库、固定闭包、额外引用和管理员，在同一事务锁内比较并删除／审计；重复运行有审计且旧范围空才返回已完成。运行器仅从既有demo状态取得凭据，无任意目标参数。重建独立通过既有事实／说明保存服务，不调用publish；首次存稿后再启动不修改已有稿。新事实默认入口沿用/content-center?kind=immigration-policy重定向。顺带补上PR31轻微待办国家代码／政策类型。

- [x] RED→GREEN：保护范围／真实库拒绝、固定ID正文改变／新增引用拒绝、审计故障回滚、幂等、不改非政策；种子草稿4组8语、240小时／过期／固定截止、重试不覆盖、公开空且无自动批准。
- [x] 本机同快照备份恢复／随机c6演练、显式迁移保护触发器、源范围及非政策原列指纹。
- [x] check、相关新旧串行集成、生产构建／HTTP／权限；一次独立整分支复核，Important/Critical仅一次RED→GREEN修复。
- [x] 源停写再盘点，备份恢复验证，原批准范围一致才执行清理、迁移、草稿重建；浏览器运营／审核人明确发布样例并验E1–E4、虚构C1–C3、窄屏；不冒称真国／新人／真机。
- [x] 一页中文小结、实际记录和指南更新，check后提交推送唯一草稿PR，fetch确认head及CI，保留备份清理自建临时副本。
