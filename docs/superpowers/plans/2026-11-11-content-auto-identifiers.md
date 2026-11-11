# 内容自动标识 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** 让编辑首次保存普通工作稿时不必填写标识，保留已发布网址和原审核边界。

**Architecture:** 纯函数提出标识，原保存事务验证角色后分配空闲网址；内容工作台使用折叠区与固定页选择器。

**Tech Stack:** Next.js、Payload、PostgreSQL 15、Node 24.22.1。

**Spec:** docs/superpowers/specs/2026-11-11-content-auto-identifiers-design.md

## Global Constraints

- 只改内容工作台和原保存入口；无迁移、外部服务或依赖。保留原发布、政策、AI 与导入路径。
- 从 PR44 合并后的 main 开独立 PR，lint 不增；本批合并后才开下一批。

## Review Focus

- 并发同标题、草稿／下架快照占用、同名异语与显式双语共享标识。
- 固定页没有任意网址或自动后缀；无效手填、越权和已有稿留空均不得被修补而绕过原校验。
- 发布后改标题、恢复历史和试图修改原网址，均保留旧链接与审核边界。

### Task 1: 标识规则与工作台

- [x] 写纯规则与隔离数据库失败测试：中文回退、英数清理、限制、固定页、碰撞、双语与旧链接。
- [x] 实现 `src/lib/content-identifiers.ts` 与 `src/server/content/identifiers.ts`，在原写事务内使用并只读索引字段。
- [x] 把两个字段移入原生 details；正常区提供固定页面选择，按现有状态锁定字段。
- [x] 跑新旧集成、完整 check、构建与桌面／手机视口实测；独立复核并修复，记录本地证据。
- [ ] 推送草稿 PR，实核截图与精确 HEAD CI，结果记入 PR 和交接。
