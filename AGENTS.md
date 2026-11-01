<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 多电脑开发与交接

- 开始前阅读 `docs/handoff.md` 和 `docs/multi-computer-development.md`，执行 `git status`、`git branch -vv`、`git fetch origin`。有未提交修改时先识别并保留，不覆盖、不自动清理。
- `main` 保存已验证的合并版本。新任务从最新 `origin/main` 创建 `codex/<任务名>` 分支；接手未完成任务时使用交接指定的同一任务分支。任务分支不要按电脑长期划分。
- 同一任务分支同一时间只由一台电脑继续修改。并行任务使用不同分支，并提前说明文件范围；仍须检查合并后的兼容性。
- 接手已有分支先 `git pull --ff-only`。若分叉或存在冲突，检查双方提交并整合，重新运行相关测试；不以强制推送、硬重置或覆盖目录解决同步问题。
- 使用 `.nvmrc` 指定的 Node.js 版本和 `npm ci` 安装锁定依赖。每台电脑使用自己的 `.env` 与本地测试数据库；数据结构变化须附带迁移或明确的本地处理说明。
- `.env`、`.local`、数据库备份、上传文件和真实密钥不进入 Git。不要通过网盘同步 `.git` 或运行中的数据库目录。
- 开发完成或换电脑前，运行相关检查，更新交接记录，提交并推送任务分支。通过 `git fetch origin` 后比较 `HEAD` 与对应 `origin/<分支>`，确认提交一致；工作区干净不等于已推送。
- 任务尽早建立面向 `main` 的草稿 PR；PR 的后续推送自动运行 CI。检查通过、复核后再合并，不自动将未验证代码推入 `main`。
- 最终交接消息说明分支、已确认推送的提交编号、PR、实际测试结果、未完成事项，以及环境变量/数据库变更；不得声称另一台电脑已同步或云端 CI 已通过，除非实际验证。
