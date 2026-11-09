# 咨询转服务单实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 运营在咨询编辑页直接创建或打开同一服务单，不重选咨询、不丢原页面输入。
**Architecture:** 复用businessAction(create)唯一／锁／审计通知；增加锁内按咨询定位编号的GET分支，CMS UI字段独立创建，报价工作台接收已校验id。现有数据及权限不变。
**Tech Stack:** Node24.22.1、PostgreSQL15、Next16.4.3、Payload3.92、React19，既有依赖。
**Spec:** docs/tasks/editor-ux.md；docs/superpowers/specs/2026-11-10-inquiry-service-case-design.md。

## Global Constraints

- PR40已合并d9d3d834d959763a66579a069dbe1e1b2091ec22；从origin/main新建codex/inquiry-to-service-case，无未提交修改。
- 只做E3转单及旧backend误导日志；状态批准不等于实现，P1／F后续逐PR。
- 业务源码≤400、lint≤465、源码行≤200，不新增any／依赖／环境键／schema／种子。
- 原55438不写，源55442只读配套备份后恢复随机E3库验收；3100普通重启不reset，旧数据／账号／图片保留。
- 外部AI／邮件／语音／通话及worker关闭；不部署、不购买、不自动合并；截图只.local和PR附件。

## Review Focus

1. 超过最近200条的咨询仍能找到服务单；按URL定位不会错误打开列表中另一单或泄露成本。
2. 重复点击、超时提交已成功、双账号并发不会新建第二张或多次通知；已有单不能覆盖标题。
3. 锁等待期间停用、转团队、转负责人后重新核权；GET不存在／越权不泄露另一客户编号。
4. 原咨询表单和独立未提交跟进不因转单清空；查询失败不能显示可创建、未保存资料明确提示。
5. URL数组、布尔、零、负数、大整数和HTML姓名不误定位或执行；低权限不能借新入口获得业务权限。

## Task 1：入口与定位的完整交付

**Files:** lib/intake-case.ts纯ID／默认标题；cms/InquiryCase.tsx及IntakeCasePanel.tsx；cms/intake-editor.ts注册；server/business/service.ts编号查询；api/business/route.ts GET分支；business-center/page.tsx异步searchParams；BusinessDesk.tsx初始id；测试与CI／docs。
**Interfaces:** inquiryCaseID(unknown): number|undefined；inquiryCaseTitle(reference,name): string；businessCaseForInquiry(p,user,id): Promise<{case:number|null}>。CMS POST仍businessAction(create)。

- [x] RED：写严格ID／标题纯测、真实面板SSR及DB按咨询定位模块缺失；测试查询失败／已有单／未保存的文字和禁用，观察正确失败。
- [x] GREEN：实现最小纯逻辑、锁内授权查询和GET、CMS独立UI／新标签链接、工作台URLid；补200外、原范围、并发幂等和事件／通知，修旧backend日志，保留notes断言。生成importMap，检查无schema变更。
- [x] 验收：完整check、DB与生产build／HTTP；克隆浏览器桌面／手机实际创建／打开／重载、未保存输入保留和重复只一单。源普通启动及五账号自检；截图上传PR，清理仅本轮克隆。
- [x] 收尾：实际记录与一页小结／指南；早建面向main草稿PR；一次独立整分支复核、重要问题一次TDD修复，次要项记账；最终head CI和上游一致；归档本计划记录，不自动合并。
