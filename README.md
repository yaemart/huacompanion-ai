# 华伴 · Hua Companion

中英文来华服务网站，当前完成**第一批的本地后台基础节点**。网站、中文后台和数据库可在本机联调，尚未部署 Replit，尚未提供客户 App。

## 打开与登录

- 中文网站：http://127.0.0.1:3000/zh
- English：http://127.0.0.1:3000/en
- 中文后台：http://127.0.0.1:3000/admin
- 初始管理员凭据：本项目 `.local/admin-credentials.txt`。该文件与 `.env` 不进入 Git，请勿分享。

## 本地启动

当前电脑已具备 PostgreSQL 15。脚本使用独立目录 `.local/postgres` 和端口 55438，不使用已有的 55432 服务。其他电脑需要安装 PostgreSQL 15，并通过 `PG_BIN` 指定工具目录。

```sh
npm ci
npm run local:db
npm run local:init
npm run dev
```

`local:db` 首次生成随机数据库密码和应用密钥；`local:init` 仅在没有员工时创建管理员，重复执行不会重置密码。项目安装了兼容的 Node 版本，由 npm 脚本使用。

正式构建的本地测试：`npm run build` 后执行 `npm run start`。应用和数据库均只监听本机。停止应用用 Ctrl+C；下次按上述命令启动。切换开发模式前先停止占用 3000 端口的应用。

## 当前可测试的操作

1. 在网站提交虚构咨询或合作申请，完成四步表单后显示真实保存编号。
2. 管理员登录后台，查看“客户咨询”“服务商管理”，分配咨询负责人、修改状态、跟进时间和内部备注。
3. 管理员可创建管理员、客户运营、内容编辑三类员工；运营只访问分配给自己的咨询，编辑不能访问客户数据。内容编辑功能尚未接通。
4. 查看通知任务、变更记录和历史版本。通知当前全部待配置，没有发送邮件。
5. 服务商申请保持未验证且不公开。审核状态与公开批准由管理员管理；本阶段前台尚未读取服务商资料。

当前库保留自动测试创建的虚构资料和测试员工，便于核对。切勿直接当作生产数据库使用。表单保存成功前刷新页面仍可能丢失输入；网络重试在当前页面使用同一提交标识防止重复入库。

## 备份、导出与验证

```sh
npm test
npm run typecheck
npm run test:integration
npm run test:migrations
npm run backup:test
npm run export:local
npm run build
# 另一个终端启动应用后：
npm run test:http
node scripts/check-routes.mjs
```

- 集成与 HTTP 测试会写入虚构记录。
- 备份保存于 `backups/`，恢复到临时独立数据库核对内容后删除临时库，不覆盖开发库。
- CSV 导出保存于 `.local/exports/`，目前通过命令运行，尚无自定义后台导出按钮。
- 备份、导出和凭据均忽略入 Git；当前没有定时备份或异地备份。
- 具体结果见 `docs/local-backend-verification.md`。

## 后续两批工作

第一批后续：网站内容审核发布、报价与客户版导出、真实邮件通知、统计工作台、完整上线验收。

第二批：客户账号、订单/行程查看与消息，React Native/Expo 客户 App，共享同一后台，再准备 Google Play 与 App Store 测试及发布。

部署沿用本地→Replit试运行→按业务需要考虑 AWS 的路线。代码、数据库与密钥分开管理，已生成数据库迁移并在空库验证。Replit 阶段仍需配置持久化 PostgreSQL、域名、备份、密钥与日志，并演练迁移。当前提交接口主动限制为本地模式，不可仅上传代码就视为可公开运营。

尚未接入：AI、真实邮件、客户账号、支付、App、正式公司联系方式。网站内容仍来自 `src/lib/content.ts`，页面保持 noindex。依赖审计剩余 5 项中等级传递依赖告警（迁移工具链），上线前需再次评估和处理。
