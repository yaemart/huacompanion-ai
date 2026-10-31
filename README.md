# 华伴 · Hua Companion

面向来华客户的服务信息、咨询和协作平台，客户界面支持中文、英文、西班牙语、法语、德语、意大利语、阿拉伯语。当前为本地开发测试版本，尚未部署 Replit 或发布手机 App。

## 本地运行

```sh
npm ci
npm run local:db
npm run local:init
npm run dev
```

数据库脚本使用独立 PostgreSQL 15 实例（端口 55438），其他电脑通过 `PG_BIN` 指定 PostgreSQL 工具目录。`local:init` 不重置已有管理员密码。初始凭据位于 `.local/admin-credentials.txt`，不得分享或提交。测试库包含虚构资料，不可直接作为生产库。

- 网站：<http://127.0.0.1:3000/zh>
- 后台：<http://127.0.0.1:3000/admin>
- 内容管理：`/content-center`，内容复核：`/quality-center`
- 客服工作台：`/support-center`
- 业务服务单：`/business-center`，通知待办：`/workflow-center`
- 客户中心：`/zh/account`（默认关闭，启用前配置验证邮件）

## 当前业务功能

网站提供指南、服务商、自建服务、展会、医疗康养和城市生活内容；公开展示遵循审核发布与资料有效性检查。客户联系统一经华伴咨询或客服。

员工按团队、角色、数据范围与字段权限工作。业务工作台将咨询转为服务单，保存报价版本、发出报价、客户确认、落实安排、记录履约和售后。内部成本和交接说明不对客户展示。客户只能查看员工核验并明确关联的记录，不能凭相同邮箱自动取得历史资料。

通知待办支持认领、分派、延期原因、截止提醒和邮件状态检查。内容复核记录来源、责任人和复核期限；编辑草稿不会改写公开快照。客服包含文字、语音消息和通话接口及开关；外部模型、语音识别和通话网关需另行配置并实测。

邮件、客户验证登录和外部 AI 服务不因代码存在而自动启用；AI 方案助手可保存生成任务、整理为报价草稿并经主管审核后发出；模型未配置时保持关闭。不包含支付、自动订票或服务商自动派单。客户界面七种语言不代表每篇内容已经完成七语翻译。

## 后台任务与验证

另外的终端启动任务进程：

```sh
npm run support:worker
npm run workflow:worker
```

正式构建使用 `npm run build`，随后 `npm run start`。切换运行模式前停止占用 3000 端口的旧进程。

```sh
npm test
npm run typecheck
npm run test:business
npm run test:workflow
npm run test:quality
npm run test:customer
npm run test:content
npm run test:support
npm run test:migrations
npm run backup:test
```

数据库集成测试需串行执行，部分测试保留虚构记录；不要对生产库运行。备份位于 `backups/`，内容图片在 `.local/content-media`，数据库和图片必须配套备份恢复。`npm run export:local` 提供本地导出。

## 操作说明

- [试运行部署与验收](docs/trial-deployment.md)
- [AI 服务方案与报价草稿](docs/business-ai.md)
- [通知与待办](docs/workflow.md)
- [客户中心与验证](docs/customer-center.md)
- [内容复核](docs/content-quality.md)
- [客服系统](docs/customer-support.md)
- [语音消息](docs/support-voice.md)、[通话](docs/support-calls.md)、[客服运营](docs/support-operations.md)

本地→Replit试运行→按业务需要迁移云服务器。外部账户、域名、持久化存储与邮件/AI供应商配置尚需运营阶段落实，当前不声称已上线。

## GitHub 代码交接

代码仓库应保持私有。GitHub 管理源代码、依赖锁文件、迁移和文档，不保存 `.env`、`.local`、数据库备份、客户上传文件或模型密钥。提交前检查 `git status`，不要使用强制添加把已忽略的文件纳入版本管理。

其他电脑获取代码后，按上方本地运行步骤建立自己的测试数据库；环境变量单独配置。每项开发使用独立分支，测试后合并。切换电脑前提交并推送，接手电脑先获取最新版本。不要让各本地开发副本连接同一个试运行数据库。

Replit 获取代码后仍需完成数据库、图片存储和后台任务适配；导入仓库不等于已部署。当前操作说明见 `docs/trial-deployment.md`。
