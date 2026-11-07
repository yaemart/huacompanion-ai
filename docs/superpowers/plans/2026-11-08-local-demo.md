# 本地一键演示实施计划

> 执行：superpowers:executing-plans，当前会话直接实施；用户已确认方案，不再重复请求实施批准。

**Goal:** Mac一键启动隔离演示环境、四账号、五类数据与可恢复的本地亲测入口。
**Architecture:** 原生PG15独立实例；源码复制到.local/demo/app运行，隔离.env、图片和Next输出；状态与随机凭据仅存.local/demo。
**Tech Stack:** Node24.22.1、PG15、现有Payload/Next、无新依赖。
**Spec:** docs/tasks/local-demo-setup.md（用户2026-11-08回复1批准）。

## Global Constraints

- DB127.0.0.1:55442/hua_companion_demo，Web127.0.0.1:3100；原55438库/3000站和媒体不改。
- 不复制.env，不传递外部服务密钥，不启用外发或worker；不改变业务权限或提前实现报价二审。
- 首次种子、普通启动保留数据；reset须显式确认和演示身份校验；只停自身进程。
- 源码100目标行宽/200上限、警告不增加；提交前check与相关集成；单独PR不合并。

## Review Focus

- 错库/无标记目录：reset拒绝，不能波及原库。
- 端口占用/PID复用：提示错误，不停止无关进程。
- 初始化中断/重复启动：种子幂等，不重置已完成演示编辑。
- 复制源码时环境/媒体泄露：白名单复制及干净子进程环境，图片只在演示app。
- 四角色及二人流程：沿现有权限验证，未来报价二审明确待实现。

### Task 1：生命周期与隔离

Files: scripts/demo.mjs、tests/local-demo.test.ts、package.json、华伴演示.command。
Interfaces: demoPaths(root)、demoEnvironment(state)、assertDemo(state)、runDemo(action)；CLI start/stop/reset。

- [ ] 先写真实文件/环境隔离、错误目标/缺失标记重置拒绝、端口占用断言并观察失败。
- [ ] 实现PG启动/关闭、自身Web进程管理、白名单源码快照、显式reset与异常清理。
- [ ] 运行node --test tests/local-demo.test.ts及npm test；记录结果。

### Task 2：演示数据与四账号

Files: scripts/demo-seed.ts、tests/integration/local-demo.ts。
Interfaces: seedDemo()只连接受保护的演示目标；固定演示标识幂等，credentials.json仅本地。

- [ ] 先写首次初始化、重复种子、四账号登录/角色范围、内容双人审核和成本过滤集成断言并观察失败。
- [ ] 用现有工作流保存/送审/发布虚构政策、指南、展会；咨询报价走现有业务服务，配置高级开关关闭。
- [ ] 串行验证初始化、重复启动、修改保留、停止与重置，失败后修复并重测。

### Task 3：指南与交付

Files: docs/local-testing-guide.md、README.md、docs/handoff.md、docs/progress.md、docs/tasks/policy-entry-ux.md。

- [ ] 写一页中文指南：命令/双击、账号文件、角色、重置、问题记录；更新最新顺序和取消上线日期。
- [ ] 完整check；浏览器亲测代表流程；独立只读复核全分支，修复重要问题。
- [ ] 提交推送单独草稿PR、fetch核对HEAD与对应上游；不合并、不部署。
