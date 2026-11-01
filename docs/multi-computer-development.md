# 多电脑开发与 GitHub 同步

GitHub 保存共享代码，`main` 保存已验证的合并版本，每个任务使用独立分支。同一任务轮流在电脑之间交接；不同任务可以并行，但须协调文件范围。

## 开始开发

先读 `AGENTS.md` 与 `docs/handoff.md`，检查本机状态：

```sh
git status
git branch -vv
git fetch origin
```

如果有未提交修改，先确认来源并保存；不要直接切换、覆盖或丢弃。同步仓库时只同步源代码，不复制整个工作目录。

新任务直接从刚获取的 `origin/main` 创建，以下以客户中心为例：

```sh
git fetch origin
git switch --no-track -c codex/customer-center origin/main
```

这样不会把本机 `main` 上尚未推送的提交带进新任务，也不会把新任务误设为跟踪远程 `main`。本机已有历史保留，首次推送任务分支时再设置它自己的上游。分支名与实际任务对应，不用同一个电脑分支长期承载不同任务。

接手已有任务，以本次交接的 `codex/local-development` 为例。首次接手：

```sh
git fetch origin
git switch --track origin/codex/local-development
```

本机已有此分支时：

```sh
git switch codex/local-development
git pull --ff-only origin codex/local-development
```

`--ff-only` 拒绝已经分叉的历史。遇到拒绝时查看双方提交，合并并解决冲突，再运行相关测试；不要改用强制推送或硬重置来消除提示。

## 环境、内容和数据库

Node.js 使用 `.nvmrc` 的版本；已安装 nvm 时执行 `nvm install` 和 `nvm use`，也可用其他版本管理器安装同一版本。`npm ci` 按锁文件安装依赖，不以升级依赖作为同步步骤。

首次安装按 README 执行 `npm run local:db`、`npm run local:init`。每台电脑独立生成 `.env` 和测试数据库，不共享运行中的数据库。已有环境不必每次重装依赖；锁文件变化后重新执行 `npm ci`。

数据库结构变化须检查随提交提供的迁移及说明，先备份。当前 local 模式会自动同步 schema，可能修改已有数据结构；切换存在 schema 变化的分支前，应停止本站点的 Web/worker 进程并备份，不能把 schema 自动同步当作生产迁移验证。生产和试运行的顺序见 `trial-deployment.md`。

| 内容 | 同步方式 |
| --- | --- |
| 代码、锁文件、迁移、开发文档 | GitHub |
| `.env`、管理员密码、模型密钥 | 每台电脑单独配置，通过受控渠道管理 |
| 本地数据库 | 独立虚构测试数据；需要完整内容时恢复配套备份 |
| 发布状态和后台编辑内容 | 保存在数据库，不随 `git pull` 同步 |
| 上传图片 | 与数据库做配套备份及迁移，不提交 Git |
| Codex 聊天中的决定 | 将关键结论写入仓库交接文档 |

不要用网盘同步 `.git`、`node_modules`、`.next` 或运行中的 `.local/postgres`。内容迁移用数据库导出/备份及对应图片目录，不在两台电脑各自修改同一份内容后直接覆盖对方数据库。恢复前先备份接收端并确认目标库。

## 完成与换电脑

检查差异，运行与变更相称的测试；最低基线是 `npm test`、`npm run typecheck`。运行构建时停止占用同一 `.next` 的开发进程；数据库集成测试串行执行，并避免 worker 同时处理测试数据。

更新 `docs/handoff.md`，写明完成内容、剩余事项、验证结果和环境/数据库变化。提交前检查暂存差异，仅加入本任务文件，不强制加入忽略文件。

```sh
git status
git diff
# 将实际修改的文件逐个加入暂存区，再检查 git diff --cached。
git commit -m "说明本次修改"
git push -u origin HEAD
git fetch origin
git rev-parse HEAD
git rev-parse '@{upstream}'
```

最后两条输出应一致，并在交接消息中写出完整提交编号。若上游不是本任务对应的 `origin/<分支>`，先核对并正确设置，不能只凭哈希相同认定交接对象正确。未完成的功能可以保存并推送任务分支，但交接须明确未完成或失败状态。

同一任务分支同一时间只由一台电脑继续修改。另一台电脑收到已推送提交编号后再拉取并核对，再继续同一任务。

## PR 与自动检查

每个任务尽早建立面向 `main` 的草稿 PR。之后向该任务分支推送新提交，PR 会自动重新运行 CI；不必为了同步电脑提前合并未完成工作。

CI 在每次分支推送、面向 `main` 的 PR 和手动运行时触发。推送时运行 `npm run check`（lint、类型检查、单元测试）；数据库检查继续使用独立临时库。检查包括：

- Node.js 24.22.1 下的单元测试和 TypeScript 检查。
- 临时 PostgreSQL 15 空库上的迁移与生产构建（关闭自动 schema push）。
- 创建虚构管理员后串行执行内容、业务、通知、复核、客户和客服集成测试。

CI 不连接本地/试运行数据库，不读取业务密钥，不上传管理员凭据、数据库或图片；它不进行部署，也不自动合并。集成测试目前会开启 local schema 同步，因此迁移后构建与集成测试分别验证各自范围，不等同于线上迁移验收。

CI 通过后仍须复核变更和必要的人工体验检查，再合并 PR。`main` 的合并限制需要 GitHub 仓库规则另外强制执行，单有 workflow 文件不会禁止绕过检查。接手时从 PR 查看对应最新提交的检查结果，不把其他提交的绿色结果当作当前通过。

## 给 Codex 的交接指令

离开前：

> 请完成本次开发交接：检查并保存修改，运行相关测试，更新交接文档，推送当前任务分支，并确认远程提交编号。不要提交密钥、数据库或上传文件。说明失败或未完成的检查。

接手时：

> 请先阅读 AGENTS.md 和 docs/handoff.md，检查本机未提交修改，再同步交接指定的任务分支，核对远程提交编号，确认环境、数据库变化和测试状态后继续开发。不要覆盖本机已有修改。
