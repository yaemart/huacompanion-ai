# 家里电脑本地基本操作验收 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this session; one fresh final readonly review, no implementer delegation.

**Goal:** 完成用户指定的CLI隔离验收、内容浏览器闭环与核心移动流程，按实际证据修复问题。

**Architecture:** 接手codex/local-basic-acceptance，沿用本机秘密及原库，先全表/图片备份恢复核对。无应用写入后短暂停原PG，在独立数据目录启动相同127.0.0.1:55438/hua_companion端点的临时PG15实例，恢复副本并验证迁移；CLI保护不变。网页/虚构账号测试只在此副本。结束停测试站/PG、恢复原PG，只事务应用已验证缺失迁移并核对原列指纹，启动默认原站，worker按开关/队列决定不常驻。

**Tech Stack:** Node24.22.1、PG15、Next16.4.3/Payload，CUA浏览器。

**Spec:** 用户2026-11-07接手指令；docs/local-basic-acceptance.md未完成项。

## Global Constraints

- 不购买、不部署、不合并；不拷外机.env，外部模型/邮件/语音/通话保持关闭。
- 本机开始clean；交接3fef2bbdacfd02645bac186a13e425f9f298b1f5与origin一致，PR19已关联。
- 不放宽CLI环境限制、不把测试账号/数据带回原库；所有备份/日志/秘密仅忽略目录。
- bug先复现/根因，再RED→GREEN；权限/客户/报价改动补对应测试；提交前check与相关集成。
- 原生弹窗取消应撤销操作，输入退回意见应保存；沿原权限审核分离。

## Review Focus

- 取消原生退回对话框不应改变状态或创建审计；确认非空意见正常退回。
- CLI真实执行只写临时实例，所有非指定数据库/主机/端口/查询参数仍拒绝。
- 原库升级不重放旧迁移、不改变原列数据、图片指纹及员工授权。
- 手机需求/服务商表单、内容审核/后台操作无横向溢出且可完成关键动作。
- 所谓通过区分本地虚构业务/关闭入口与依赖真实账户的未验功能。

### Task 1: 安全接手、备份迁移与CLI隔离

**Files:** 忽略.local/home-acceptance-*；文档证据。
**Interfaces:** 备份报告/原库指纹→独立PG副本/原站恢复；不改CLI接口。

- [x] npm run backup:test及test:backup:coverage退出0；check204单元基线。
- [x] 独立PG克隆迁移up/down/up、原66表原列指纹一致，policies:data整组含真实CLI退出0，环境拒绝单元通过。

### Task 2: 浏览器内容闭环与移动操作

**Files:** 仅有复现问题才修改对应src/tests；docs/screenshots/local-acceptance-home。
**Interfaces:** 本地副本HTTP/虚构账号，原有内容API及角色，不新增模块。

- [x] CUA实际编辑/保存/提交/取消退回/确认退回/再编辑/审核发布/详情/下架；失败留证并最小修复，先测后改。
- [x] 390手机公开需求/申请回执、供应商筛选、匿名保护、后台查询/内容/经营入口；关闭客户中心及外部服务如实记录。
- [x] 若修复，用对应单元/集成、实际浏览器复验及check，截图不含原客户资料或秘密。

### Task 3: 恢复、交接与独立复核

**Files:** docs/local-basic-acceptance.md/progress.md/handoff.md，必要测试。
**Interfaces:** 前两任务日志/截图/对比报告→可审阅提交/PR19。

- [x] 停测试进程，恢复原PG；仅应用缺失已验证迁移，原列指纹/图一致；检查开关和任务，不启动常驻worker。
- [x] 默认网站原库启动、基本HTTP通过；check/相关测试，记录通过/未通过/外部未验。
- [x] 一次fresh readonly分支增量复核，重要发现单轮TDD修复、minor记账，更新PR19/推送/fetch完整SHA及finalheadCI，不自动合并。
