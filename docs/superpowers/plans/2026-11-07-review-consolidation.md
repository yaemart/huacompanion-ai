# PR19 整理与手机政策阅读 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; one fresh final readonly reviewer, no per-task delegation. User approved design and implementation; no further plan approval needed.

**Goal:** 修复已核实反馈，将PR19作为单一审阅入口，证据归档并准备订阅分步设计。
**Architecture:** 保持现有查询纯函数、SSR正式数据与权限接口；同一表DOM在手机按卡片排版。PolicyQuery接收服务端children，通过原生details在查询成功后折叠参考，初始/无JS展开。仅测试子进程使用假环境。
**Tech Stack:** Node24.22.1、Next16.4.3/React19、CSS、node:test、CUA。
**Spec:** docs/superpowers/specs/2026-11-07-review-consolidation-design.md（用户已确认）。

## Global Constraints

- 沿用codex/local-basic-acceptance/PR19，不强推、不合并，不关闭PR1–18直到PR19合并。
- 不新增依赖/服务/schema/实际.env；不改原库数据，AI/邮件/语音/通话关闭，worker不启动。
- 手机卡片保留来源/核实日/条件/小时/截止状态；查询不上传，初始无JS完整资料可读。
- 证据先SHA校验归档，仅移出当前版本，保留固定提交链接；新截图不提交Git。
- 每任务check及相关回归，实际结果写progress；阶段2只分步设计，停止点C不群发。

## Review Focus

- 新电脑无本地秘密时测试是否真隔离，生产校验不得放松。
- 卡片含多政策/长条件/过期/无截止日与英文，语义及关键事实不丢失。
- 成功/未确认/无效输入/改输入时参考区展开状态合理，无JS有完整资料。
- 触屏/键盘跳转可用，失焦后隐藏；不因截图隐藏焦点或裁切正文。
- 证据链接来自真实历史版本；本机截图不能冒称GitHub已上传，订阅仅设计。

### Task 1: 无秘密单元隔离

**Files:** tests/support-operations.test.ts。
**Interfaces:** 仅该内存集成子进程env，生产配置原样。

- [x] 以PAYLOAD_SECRET空、不可达假DB运行npm test，重现206/207及配置错误（已有RED日志复核）。
- [x] 子进程显式提供ci假密钥/不可达假DB/关闭外部功能；不读取真实秘密或跳过断言。
- [x] 同样无秘密npm test为207/207；check退出0，提交本任务及设计/计划。

### Task 2: 手机阅读与键盘入口

**Files:** PolicyQuery.tsx、PolicyTable.tsx、policy-table.css、globals.css、工具page.tsx、双语copy；静态渲染测试。
**Interfaces:** PolicyQuery新增children?:React.ReactNode；参考details复用该children，组件其余props不变。

- [x] 静态渲染增加字段标签、table/row/cell显式语义与参考初始open断言，先观察缺失失败。
- [x] 同DOM手机卡片带aria-hidden标签；桌面保留表，原生details初始open、有效查询折叠、清空/无效重开；仅focus-visible显示skip入口。
- [x] table/browser/faq/banner:render及check退出0；隔离副本或纯虚构页面CUA桌面/390/320/无JS、Tab/失焦、查询展开折叠实测，截图只.local。
- [x] 停dev后trial build与生产开关HTTP回归；结束恢复原日常站，提交本任务。

### Task 3: 证据归档与可读交接

**Files:** docs/screenshots/**/README.md、docs/progress.md、handoff.md、一页中文小结、阶段2分步设计、协作规则。
**Interfaces:** 50文件SHA归档manifest→逐目录固定commit链接；新证据.local→PR说明如实可达性。

- [x] 检查归档manifest全部SHA一致，移除当前版本50个图片/JSON，保留README/文本；不改Git历史。
- [x] 一页小结及2.1–2.4逐PR设计，更新协作规则为前一步合并后再开下一步；CLI最新通过/any290与真实服务未验写清。
- [ ] check退出0，单次fresh只读增量复核；重要发现一次修复回归，minor记录；提交后推送/fetch核对SHA和本head两轮CI，更新PR19，不合并。
