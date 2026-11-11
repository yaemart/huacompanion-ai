# 整篇编辑器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Track verification below.

**Goal:** 让运营一次粘贴整篇指南，并按现有流程保存、预览和提交审核。

**Architecture:** 浏览器将剪贴板解析为既有正文块，编辑区通过安全创建的 DOM 节点显示正文。图片和政策横幅使用已有字段控件，保持它们在正文中的相对位置。

**Tech Stack:** Next.js 客户端组件、React、DOM、现有 Payload API。

**Spec:** [整篇编辑器方案](../specs/2026-11-11-content-article-editor-design.md)。

## 正文转换

- [x] 先测试 `readArticle` 的标题、正文、列表、链接和富文本简化，以及 `plainArticle` 的换行。
- [x] 实现 `src/lib/content-article.ts`。复用 `safeURL`；只投影结构和文字，不挂载剪贴板节点。运行定向测试。

## 编辑与保存

- [x] 接入 `ArticleEditor.tsx` 和内容工作台，保留现有保存、只读、图片与政策横幅字段。
- [x] 检查草稿切换、保存后的回显、文字与附件顺序、编辑选择及无效链接提示。测试过长或过多正文仍保留输入。
- [x] 在独立演示数据库用约 800 字虚构指南实测粘贴、保存、重开、预览和送审；核对浏览器截图、正文结构与待审核状态。
- [x] 运行 `npm run check`、相关集成测试及生产构建，记录实际结果与人工验收边界。更新本地指南和交接，提交单独 PR。
