# Hua Companion 双语整站预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 交付可审核的完整双语网站预览，作为真实运营后台的前端基础。

**Architecture:** Next.js App Router 服务端页面，集中双语内容。客户端仅处理导航、指南筛选和表单步骤。表单本阶段不对外提交、不假报成功。

**Tech Stack:** Next.js, React, TypeScript, CSS, Node test runner.

**Spec:** docs/superpowers/specs/2026-10-26-hua-companion-design.md

## Global Constraints

- 全部七类服务保留业务边界；默认英文，中文切换保留路径。
- 不虚构公司、联系方式、合作方、评价及交易数字。
- 不购买服务、不正式发布、不接收敏感附件、不模拟 AI。
- 预览与正式环境分开，预览阻止索引。

## Review Focus

- 深层路径切换语言后仍是同一页面；未知路径返回 404。
- 多选服务应展示对应补充问题，长租与短住分开。
- 表单前后切换保留输入；校验阻止空白、无效邮箱和未同意隐私。
- 手机导航、表单和多列布局不溢出。
- 未配置保存服务时绝不能显示提交成功或咨询编号。

### Task 1: 页面基础与双语内容

**Files:** package.json, tsconfig.json, src/lib/content.ts, src/lib/routes.ts, src/app/layout.tsx, src/app/[locale]/[[...slug]]/page.tsx, src/components/Site.tsx, src/app/globals.css
**Interfaces:** Locale = 'en' | 'zh'; service slugs shared across locales; page route resolves home/services/service/guides/guide/partners/about/contact/request/apply/privacy/terms.

- [x] 配置 Next.js 与 TypeScript，编写路由切换和未知路径用例，观察未实现失败。
- [x] 实现路径工具、双语内容、页头页尾、主页和七个服务详情。
- [x] 实现指南目录与详情、合作招募、关于、联系、隐私与服务说明。
- [x] npm test 验证路径行为；npx tsc --noEmit 验证接口。

### Task 2: 分步表单

**Files:** src/lib/forms.ts, src/components/InquiryForm.tsx, tests/forms.test.ts
**Interfaces:** validateStep(kind, step, values, locale): Record<string,string>; kind = 'request' | 'apply'.

- [x] 先测试空值、非法邮箱、未同意隐私、日期和人数输入，运行并观察失败。
- [x] 实现两套四步表单、类别补充字段、返回时保留数据、错误提示和预览拦截。
- [x] npm test 验证；手动验证完整填写后仍不返回虚假的保存成功。

### Task 3: 预览与交付

**Files:** README.md, docs/preview-verification.md, docs/progress.md

- [x] npm run build 完成生产构建，运行本地预览。
- [x] HTTP 检查所有双语页面与未知页面。
- [x] 使用浏览器检查桌面、手机布局，语言切换和表单，修复发现的问题。
- [x] 更新实测报告与下一阶段待接入清单，保留预览供审核。

## 后续独立实施计划

后台/权限、咨询与申请持久化、报价与通知、AI 集成、备份恢复各自形成计划；不得将本轮页面预览算作最终交付。
