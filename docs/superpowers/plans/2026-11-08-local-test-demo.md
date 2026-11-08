# 任务A本地测试环境补齐实施计划

> 执行superpowers:executing-plans，用户已确认范围及例外，当前会话直接实施。

**Goal:** 沿现有隔离演示环境补齐local命令、五账号、发布材料及C/E清单映射。
**Architecture:** 保持3100/55442专用环境；纯演示数据模块与启动保护模块分开；不改产品权限/schema。
**Tech Stack:** Node24.22.1、已有PG15/16、现有Payload/Next，无新增依赖。
**Spec:** docs/tasks/2026-11-08-master-plan.md、local-test-checklist.md；用户已确认.local/proposals/2026-11-08-task-a-demo-scope.md及本轮补充。

## Global Constraints

- 真实德美未验；人工待审报价待F、不伪造AI。主管角色维持原样，服务商授权待E。
- E扩P0+P1，P2在G后；回执承诺待D，C10移动网络待部署。
- 不复制.env、不触碰原库/媒体，不启动worker或真实服务。普通启动保留修改，reset先配套备份。
- 一个PR；业务代码改动不超过400行；本轮开发工具可独立扩展。警告不增加。

## Review Focus

- 环境DATABASE_URL/APP_ENV冲突必须在建库或重置前拒绝。
- PG工具大版本须匹配PG_VERSION，缺PG提供中文提示，不升级旧库。
- LAN仅显式开启、限定私网地址，重启本机模式后不残留公网监听。
- 旧演示不静默覆盖，新版样例双语、发布状态和截止日必须正确。
- 主管不扩权、运营/新人范围与成本过滤，报价不能伪装成待审。

### Task 1: 启动和环境保护

Files: scripts/lib/demo-runtime.mjs、scripts/demo.mjs、scripts/lib/demo-environment.mjs、start.command、package.json、tests/local-demo.test.ts。
Interfaces: resolvePostgres(data, env)、demoWeb(mode, interfaces)、assertDemoInvocation(state, env)。

- [ ] RED：PG版本/私网地址/外部环境拒绝/账号及目录保护用例。
- [ ] GREEN：local别名、PG15/16匹配、备份和账号目标、浏览器打开、显式LAN及幂等启动。
- [ ] 跑相关单元并记录；不执行原库初始化。

### Task 2: 演示材料与权限

Files: scripts/lib/demo-fixtures.ts、scripts/demo-seed.ts、tests/local-demo-fixtures.test.ts、tests/integration/local-demo.ts。
Interfaces: demoEntries(today)生成body/policy/publish；state.seedVersion=2只在显式重置/首次建库完成后写入。

- [ ] RED：5指南3服务3展会5页面/已发布过境/过期与尚未确认/两语文案；集成数量及新人范围。
- [ ] GREEN：现有保存送审发布服务种子；5咨询3申请2服务单2普通草稿5账号，主管无额外角色。
- [ ] 演示库配套备份后显式reset，集成、重复启动、内容保留和原环境只读指纹。

### Task 3: 文档和交付

Files: master-plan/editor-ux/customer-fixes/local-test-checklist/local-testing-guide、README、handoff/progress。

- [ ] 记录本轮明确决定与20项场景可测/待完成，LAN临时开启/关闭及安全说明。
- [ ] 完整check、开发浏览器代表流程与390/1440截图；不冒充真机/新人。
- [ ] 提交推送任务A单个草稿PR，独立整分支复核并一轮修重要项；核对上游与实际CI，不自动合并。
