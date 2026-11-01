# 华伴 · Hua Companion

面向来华客户的服务信息、咨询和员工协作平台。当前已完成收敛代码与本机部署准备，**尚未在真实托管环境试运行或正式发布**。公开语言默认为英文、中文，根路径进入英文首页；其余五语与高级模块保留代码并关闭入口。完整状态见[功能清单](docs/feature-inventory.md)。

当前开发以[流量入口分阶段任务书](docs/traffic-entry-task.md)为准；停止点A已确认[Render托管](docs/hosting-options.md)与[Cloudflare加站内汇总](docs/analytics-options.md)，当前仅继续本地开发测试。此前的收敛工作作为基础复用，新功能按步骤独立 PR。[阶段1完整开发任务书与实施顺序](docs/traffic-entry-phase1-plan.md)已整理，1.1a契约及1.1b私有集合/版本已本地验证；编辑审核和公开工具尚未实现。

## 已完成

- Prettier／ESLint、`npm run check` 和每次 push／PR 的 GitHub Actions；核心服务及 CMS 权限类型清理，源码行长门禁，无压缩书写。
- 中英官网、咨询与服务商两表单、中文后台、内容编辑审核发布、私有图片、团队与负责人数据范围。
- 基础服务单／报价版本和人工审核、站内通知；客户数据和内部成本沿用原权限边界。
- 中文[经营概览](http://127.0.0.1:3000/operations-overview)、权限范围统计、筛选 CSV／BOM／公式转义／管理员敏感字段和导出审计。
- 页面 SEO 标题／描述／分享图、robots、真实多语 hreflang；试运行 noindex、`SITE_LOCALES=en,zh`。
- 客户端与全站两层限流、认证代理头、honeypot；原有数据库锁容量及 AI 检索限制记录。
- Docker 网站、两个后台任务、PostgreSQL 和图片持久卷；本机实际冒烟、匿名／低权限隔离及配套数据库／图片恢复演练。

“已完成”指代码和本机证据，不代表真实邮件、云端恢复或正式部署验收。测试结果及剩余 299 处显式 any 原因见[实施记录](docs/progress.md)。依赖审计仍有低／中危告警，运行时依赖也受影响，见[安全与部署边界](docs/trial-deployment.md)。

## 待接入

- 你批准托管方案、地域与费用，并提供平台／托管数据库／DNS 授权；[推荐和备选方案](docs/hosting-options.md)。
- Resend 已验证发件域名和指定收件人；实际发一封通知并确认送达。
- 真实试运行环境的数据库与图片配套恢复、未登录／低权限访问拒绝、HTTPS／网关防绕过及失败告警。
- 隐私说明主体、联系渠道、保留策略与值班责任；完成验收前 `INTAKE_ENABLED=false`，不开放真实收集。

需要的具体信息和下一步见[上线账户清单](docs/launch-accounts.md)。没有购买账户、接通模型或改动正式 DNS；正式发布和搜索收录需要另行决定。

## 后续功能

- 客户中心、七语客户能力、语音消息／转写／播放、实时通话、AI 文字客服、AI 报价及内容 AI：**已实现、未启用**，本阶段保留原开关，不接真实账户或扩展能力。
- 其他五语的实际内容翻译、知识检索改进、客服锁粒度优化：后续单独评估和补并发测试。
- 支付、App、自动抓取、自动预订／派单、视觉改版：本阶段不做。

## 本地继续开发

使用 Node 24.22.1，PostgreSQL 15，按 `.env.example` 单独配置秘密。不要把其他电脑的 `.env` 或数据库复制进 Git。

```sh
nvm install
nvm use
npm ci
npm run local:db
npm run local:init
npm run trial:configure
npm run trial:configure -- --apply
npm run dev
```

数据库使用独立实例 55438；其他电脑可用 `PG_BIN` 指定 PostgreSQL 工具目录。`local:init` 不改已有密码；首位本地管理员凭据位于忽略的 `.local/admin-credentials.txt`。本地库只使用虚构资料，不能复制上线。`trial:configure` 默认预览，显式 `--apply` 才关闭已有高级开关并审计，不删业务资料或员工权限。

网站：[中文首页](http://127.0.0.1:3000/zh)，后台：[中文管理](http://127.0.0.1:3000/admin)。工作台有 `/content-center`、`/business-center`、`/workflow-center`、`/operations-overview`；具体访问沿用角色权限。

`npm run dev` 保留 Next Fast Refresh，关闭 Payload HMR；修改 CMS 配置／集合／字段／权限配置后手动重启，避免数据库映射热重载竞争。生产构建前停止 dev，再依次 `npm run build`、`npm run check`；不要同时清理／生成 Next 类型。

两个后台任务另开终端，使用同一套本地环境：

```sh
npm run support:worker
npm run workflow:worker
```

## 验证与本地容器

```sh
npm run check
npm run test:permissions:business
npm run test:permissions:content
npm run test:reporting
npm run test:intake
npm run test:trial
npm run test:migrations
```

数据库集成测试必须串行，HTTP 测试还需正在运行的网站；部分会保留虚构记录，绝不指向真实客户库。每项开发提交前运行 check 和相关集成测试，并在 progress 记录实际结果。全部历史回归入口保留在 package.json。

安装并启动 Docker Desktop 后：

```sh
npm run compose:init
docker compose --env-file .env.compose up --build -d
npm run compose:smoke
npm run compose:restore-test
docker compose --env-file .env.compose stop
```

容器网站为 [3001](http://127.0.0.1:3001/zh)，数据库仅绑定本机 55439，使用独立命名卷；不覆盖开发库或图片。备份保存在忽略的 `backups/compose`，恢复验证使用临时新卷。详细初始化、恢复和中断处理见[容器说明](docker/README.md)。不带 `-v` 的停止／移除保留数据；不要随意删除卷。

## 多电脑与操作文档

先读[当前交接](docs/handoff.md)和[协作流程](docs/multi-computer-development.md)：同一任务分支同一时间仅一台电脑修改；接手先检查工作区、fetch、`pull --ff-only`，切换前提交并 push。`main` 只接收验证后的 PR，CI 不部署或自动合并。环境、数据库、图片和账户分别配置，各本地副本不共用试运行库。

- [试运行部署与验收](docs/trial-deployment.md)、[功能清单](docs/feature-inventory.md)、[账户清单](docs/launch-accounts.md)
- [通知待办](docs/workflow.md)、[内容复核](docs/content-quality.md)、[员工权限](docs/staff-permissions-verification.md)
- 已实现未启用的[客户中心](docs/customer-center.md)、[AI 报价](docs/business-ai.md)、[客服](docs/customer-support.md)、[语音](docs/support-voice.md)、[通话](docs/support-calls.md)

GitHub 仅保存源代码、依赖锁、迁移和文档；`.env*`、`.local`、客户资料、上传图片、备份和密钥不入仓库。接手电脑需要单独建立测试库与秘密配置，导入仓库不等于已部署。
