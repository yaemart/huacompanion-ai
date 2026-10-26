# 本地后台第一批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按用户批准的本地→Replit→云部署路线，首先完成“中文后台能登录、两类表单真实入库”的可验证节点。
**Architecture:** Next.js 与 Payload 共进程，PostgreSQL 独立持久存储；应用配置使用环境变量；所有运行数据和凭据忽略入 Git。无外部付费服务。
**Tech Stack:** Next.js compatible with Payload, Payload CMS, PostgreSQL 15, React, TypeScript.
**Spec:** docs/original-brief.txt 与 docs/superpowers/specs/2026-10-26-hua-companion-design.md；用户后续批准 App Store/Google Play、共享后台及本地优先路线。

## Global Constraints
- 本地测试先用虚构资料，不发布、不购买，不声称邮件或 AI 已接通。
- 员工管理员、运营、编辑分权，拒绝公开创建员工。
- 运营只能访问分配给自己的咨询，编辑不能读取客户数据。
- 真实数据库提交完成后才返回编号；通知任务同事务保存，邮件未配置明确 pending。
- 保留可迁移的数据库结构、迁移和备份脚本；同一份源码部署 Replit。

## Review Focus
- 匿名 API、登录页初次创建入口、字段修改不得绕过角色权限。
- 表单重复点击及网络重试不能重复创建；冲突内容不能复用旧幂等键。
- 服务端拒绝无效类别/类型/超长内容/未同意隐私；忽略客户端内部字段。
- 数据库失败不返回成功；记录与通知任务原子保存。
- 备份恢复到独立数据库，不覆盖开发库。

### Task 1: 本地 Postgres 和 Payload 接入
- [x] 安装兼容版本、隔离网站与后台路由组，配置中文管理界面。
- [x] 本地脚本初始化专属数据库和随机密钥，不输出密钥，不改已有数据库服务。
- [x] 建立员工及权限规则，先测匿名/编辑/运营/管理员，再实现。
- [x] 仅本地受控命令创建初始管理员；后台无公开自助注册。

### Task 2: 咨询、服务商与通知任务
- [x] 建立字段、状态、分配、跟进、内部备注与审计事件。
- [x] 服务端校验、事务及持久幂等键；先用测试复现非法输入。
- [x] 两类表单接通本地接口，显示真实编号、错误与重试状态。
- [x] 通知保存为待配置，后台可查看，不模拟邮件送达。

### Task 3: 验证与交付
- [x] 实际 PostgreSQL 测试两类保存、重复提交、权限隔离、分配与数据导出。
- [x] 备份并恢复到隔离库，核对数据。
- [x] 构建、类型检查和浏览器验证中文后台/前台表单。
- [x] 写中文操作说明、重启命令、当前完成与未完成清单。

## 第一批后续节点
内容审核发布与前台 CMS 读取、报价与客户版导出、通知实际邮件接入、统计工作台与完整上线验收另行推进；本节点不得称为第一批全部交付。

验证范围与浏览器提交未完成项详见 docs/local-backend-verification.md；不代表全部第一批或生产验收完成。
