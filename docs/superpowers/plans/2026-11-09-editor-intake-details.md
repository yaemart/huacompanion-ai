# 任务 E1：咨询与服务商详情可读化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 两类 Payload 编辑页用中文只读卡片展示初始需求，将既有操作放顶部、元数据折叠；不改变数据或权限。
**Architecture:** 服务器字段组件只渲染 Payload 已授权的字段 value；纯函数格式化所有原始字段，未知字段保留并提示。无名 collapsible 分组复用原 Field 对象，不新增持久字段。
**Tech Stack:** Next 16.4.3、Payload 3.92、React 19、TypeScript；Node 24.22.1、PostgreSQL 15。
**Spec:** docs/tasks/editor-ux.md；docs/tasks/2026-11-08-master-plan.md。

## Global Constraints

- 本批只实施 E P0 第1条前两项；时间线、转服务单、P1 后续顺序 PR。
- 状态／协调进度合并或联动为明确停止点，本批只准备方案不改逻辑。
- 本地独立任务分支，基于 main 19acd83126c0e395cb8b264c984da4bdd3834889；不堆叠、不自动合并。
- 不改权限、审核、种子、schema、报价；不新增依赖／环境键／外部服务。真实服务与 worker 关闭。
- 业务源码增删不超过400行；lint警告不超过465，源码不超过200字符。
- 55438不写；55442源保留，隔离随机克隆测试；无reset。
- 屏幕截图仅忽略目录／PR附件；新人测试不冒充开发自测。

## Review Focus

1. 服务端组件是否只用授权 value，是否从完整 data 或其他API绕过字段读取权限。
2. 旧 JSON 中未知、嵌套、数组、布尔或恶意文字是否丢失／执行，是否空白误导。
3. 无名折叠分组是否保持原字段路径、访问守卫、版本数据与保存行为。
4. 主管／运营原来的字段写权限与跨团队客户隔离是否因布局变化扩大。
5. 手机长文字、家政申请、空资料以及提交后重新加载是否可用。

## Task 1：可独立验收的需求卡片与编辑分组

**Interfaces:** lib/intake-details.ts 格式化数据 → cms/IntakeDetailsField.tsx；cms/intake-editor.ts 复用原字段 → collections.ts。新增纯／SSR测试，集成权限回归和浏览器验证。生成importMap。

- [ ] 先写格式化与SSR测试：中文标签／枚举、多选、原文保留、空值、未知嵌套及HTML转义。运行并观察模块缺失 RED。
      Expected: 新模块缺失导致失败，不是环境或密钥问题。
- [ ] 实现纯格式化、只读服务器卡片、无名分组，保留所有原字段对象；生成importMap；运行纯／SSR测试与typecheck。
      Expected: 全部通过，不引入any／依赖。
- [ ] 随机E1克隆执行相关业务权限集成、真实Payload页面读取和保存；隔离生产build；浏览器管理员／运营两类编辑页、手机390及桌面1440前后图。
      Expected: 旧权限与原始详情保护不变；卡片无JSON编辑器，顶部操作和折叠生效，无横溢；真实外部发送0。
- [ ] 更新一页小结、测试指南、progress、handoff和状态联动待确认方案；npm run check、diff检查、业务行数检查；尽早草稿PR。
      Expected: check全过，lint<=465，业务行数<=400，PR不合并。
- [ ] 一次独立全分支复核，按影响分级；重要项先RED后GREEN一次修复；上传截图、核实精确headCI和远端提交；普通重启3100，不reset。
      Expected: 明确已验／未验／停止点，源数据保留，最终上游一致。
