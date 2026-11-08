# 华伴 · Hua Companion

## 本地亲测入口

先以本地“客户友好、编辑友好”验收推进，11月30日不再是上线日期。运行`npm run local:start`或双击根目录[start.command](start.command)，首次自动准备独立演示库、已发布的虚构内容、业务数据及五个账号。启动、关闭、重置与账号说明见[一页本地测试指南](docs/local-testing-guide.md)。演示使用3100/55442，不覆盖原3000/55438环境；每次拉取新代码后关闭并重开演示。

面向来华客户的服务信息、咨询和员工协作平台。当前已完成收敛代码与本机部署准备，**尚未在真实托管环境试运行或正式发布**。公开语言默认为英文、中文，根路径进入英文首页；其余五语与高级模块保留代码并关闭入口。先看[一页中文小结](docs/project-status-2026-11-07.md)，完整状态见[功能清单](docs/feature-inventory.md)。

当前开发以[2026-11-08总指令](docs/tasks/2026-11-08-master-plan.md)为准，按[本地清单](docs/tasks/local-test-checklist.md)亲测；原[流量入口分阶段任务书](docs/traffic-entry-task.md)作历史参考；停止点A已确认[Render托管](docs/hosting-options.md)与[Cloudflare加站内汇总](docs/analytics-options.md)，当前仅继续本地开发测试。此前的收敛工作作为基础复用，新功能按步骤独立 PR。[阶段1完整开发任务书与实施顺序](docs/traffic-entry-phase1-plan.md)已整理，1.1政策数据/审核/正式投影、1.2纯查询及1.3a/b/c中英文SSR、浏览器查询及正式FAQ已本地验证；1.4横幅、1.5站内提醒及1.6搜索基础也已本地验证。[PR19](https://github.com/yaemart/huacompanion-ai/pull/19)及PR20已合并。最新顺序为本地演示→政策P0第2–6条→共用事实→客户端修复→其他录入界面P0＋P1→报价分项与二审→员工工作台→录入P2；[订阅](docs/subscription-phase2-design.md)暂缓。每步合并后再从最新main继续，不叠加PR；真实部署/恢复及公开B仍待用户完成本地亲测后决定。

## 已完成

- Prettier／ESLint、`npm run check` 和每次 push／PR 的 GitHub Actions；核心服务及 CMS 权限类型清理，源码行长门禁，无压缩书写。
- 中英官网、咨询与服务商两表单、中文后台、内容编辑审核发布、私有图片、团队与负责人数据范围。
- 基础服务单／报价版本和人工审核、站内通知；客户数据和内部成本沿用原权限边界。
- 中文[经营概览](http://127.0.0.1:3000/operations-overview)、权限范围统计、筛选 CSV／BOM／公式转义／管理员敏感字段和导出审计。
- 页面 SEO 标题／描述／分享图、robots、真实多语 hreflang；试运行 noindex、`SITE_LOCALES=en,zh`。
- 客户端与全站两层限流、认证代理头、honeypot；原有数据库锁容量及 AI 检索限制记录。
- Docker 网站、两个后台任务、PostgreSQL 和图片持久卷配置已准备；本机PG配套恢复与权限隔离已验，当前机器无Docker，容器及真实托管部署/恢复仍待验。
- 入境政策编辑审核、版本恢复、仅草稿JSON导入及正式快照白名单投影；默认关闭。导入步骤见[政策说明](docs/immigration-policies.md)。
- 国籍/入境日查询纯函数、日期边界/三时区隔离测试与正式发布链路集成；各政策时长分列，过境按240小时提示条件。仍需人工核实的现实政策和已发布签证指南。
- 中英文 `/en/tools/china-visa-free-checker`、`/zh/tools/china-visa-free-checker` SSR参考表，关闭时404；无JS完整资料、手机卡片、来源/日期/条件及空态已在生产构建本机验收。国籍/日期仅在浏览器查询，改输入清除旧结果，查询后可折叠完整参考资料，已发布指南可精确配置；正式FAQ与一致FAQPage已接入，中英生产移动Lighthouse性能/可访问性均100；[报告与手工验证范围](docs/screenshots/visa-checker-accessibility/README.md)。[浏览器截图与隐私证据](docs/screenshots/visa-checker-browser/README.md)为虚构资料。

“已完成”指代码和本机证据，不代表真实邮件、云端恢复或正式部署验收。测试结果及剩余 290 处显式 any 原因见[实施记录](docs/progress.md)。依赖审计仍有低／中危告警，运行时依赖也受影响，见[安全与部署边界](docs/trial-deployment.md)。

## 待接入

- 按已确认Render方案，待你另行批准地域与费用并提供平台／托管数据库／DNS 授权；[推荐和备选方案](docs/hosting-options.md)。
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
