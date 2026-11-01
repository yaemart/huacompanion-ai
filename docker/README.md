# 本地容器验证

此目录只用于部署准备，不会购买云资源。先安装并启动 Docker Desktop，使用 Node 24.22.1。

```sh
npm run compose:init
docker compose --env-file .env.compose up --build -d
docker compose --env-file .env.compose ps
npm run compose:smoke
npm run compose:restore-test
```

网站为 http://127.0.0.1:3001，数据库仅绑定本机 55439；不会使用现有 3000／55438 开发环境。数据库和 `.local/content-media` 均使用此 Compose 项目自己的命名卷。`migrate` 一次性成功后才启动网站和两个常驻任务。`.env.compose` 含随机本地密钥，禁止提交；再次初始化不覆盖旧密钥。需使用可运行 docker 的本机终端；如命令不在 PATH 中，备份脚本可通过 `DOCKER_BIN` 指定 Docker CLI 绝对路径。

容器环境固定为 `APP_ENV=trial`、`NODE_ENV=production`；本地 HTTP 下真实表单入口保持关闭。`INTAKE_ENABLED=false`、noindex、中英文公开语言、无邮件/模型账户。改成 HTTPS 并落实隐私和网关前不能开放真实收集。`NEXT_PUBLIC_FORM_MODE` 改动后必须重新 build。

## 冒烟与初始账户

`compose:smoke` 只允许本机这个 db／3001 配置，使用虚构资料实际验证首页、表单入库服务、员工权限、BOM 导出与审计、私有图片；表单 HTTP 入口仍应返回 503，因为未对外开放。该命令会创建虚构测试账户和记录并保留供恢复验证，**不要在任何真实试运行库运行，不复制测试卷上线**。测试账户密码在进程内随机生成，不输出，不作为团队登录凭据。

独立试运行环境在托管秘密管理器中临时设置 `BOOTSTRAP_ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD`（随机 20–128 字符）和可选 `BOOTSTRAP_ADMIN_NAME`，通过维护终端执行：

```sh
npm run bootstrap:admin
npm run bootstrap:admin -- --apply
npm run trial:configure -- --apply
```

首条 dry-run，第二条只在 `APP_ENV=trial` 且 staff 为空时创建首位管理员；事务锁及二次检查防重复，已有账户不改密码、不加新管理员，公网首次注册仍被禁止。创建和配置均写审计。完成后移除 bootstrap 临时秘密并由负责人修改初始密码。已有账户的处理沿用管理员权限流程。

## 配套备份与隔离恢复

```sh
npm run compose:backup
npm run compose:restore-test
```

`compose:backup` 只接受本机 Unix socket Docker context，暂停全部三个应用进程（包括 restarting 状态）并确认停止；操作者同时停止其他 CLI 写入。备份 PostgreSQL 自定义格式 dump、图片 tar.gz 和 manifest，保存至忽略目录 `backups/compose/时间戳`，目录 0700／文件 0600。manifest 含归档校验值、所有表的行数／行内容 SHA256 和每个媒体文件的 SHA256，不含客户正文或密钥；完成或普通错误后尝试恢复原来应运行的进程。

`compose:restore-test` 先创建上述配套备份，再在随机命名的独立 Compose 项目恢复数据库与图片。目标没有公网端口，不挂载原数据库或图片卷；逐表和逐图片核对、检查媒体引用后，记录 `restore-verification.json`，只清理临时验证项目自己的卷。原始备份保留。

也可复验一个已存在的配套副本：

```sh
node scripts/compose-backup.mjs verify backups/compose/对应目录
```

备份中断：SIGINT／SIGTERM 在当前同步命令结束后进入恢复路径（每命令超时最多三分钟）；SIGKILL、掉电或 Docker 不可用时无法保证自动恢复。先检查状态，再在本机执行：

```sh
docker compose --env-file .env.compose start web support-worker workflow-worker
docker compose --env-file .env.compose ps
```

失败产生的不完整目录没有有效 manifest，不能当作可恢复副本。保管备份和环境秘密，真实数据需进一步落实加密、异地保存和保留策略；本地演练不替代托管自动备份与真实环境恢复验收。

## 日志、停止与数据保留

```sh
docker compose --env-file .env.compose logs --tail=100 web support-worker workflow-worker
docker compose --env-file .env.compose stop
```

`stop` 与不带 `-v` 的 `down` 保留卷。不要对含业务数据的环境运行 `down -v`。本项目最终验证后容器可停止以节约本机资源，命名卷保留；重新启动仍使用原数据和图片。
