# 当前开发交接

日期：2026-11-01（Asia/Shanghai）。这是换电脑和继续开发时先读的入口。

## 当前生效任务与停止点

- 最新权威需求为 [流量入口分阶段任务书](traffic-entry-task.md)，已取代旧“收敛与上线准备”和“补充任务”。旧实施记录仅保留为已完成工作的证据。
- 当前分支`codex/visa-policy-workflow`，本轮1.1c1审核发布事务与权限适配，依赖草稿[PR #6](https://github.com/yaemart/huacompanion-ai/pull/6)。PR6的push/PR CI均成功（41291334908、41291360511）。依赖顺序PR2 → PR3 → PR4 → PR5 → PR6 → 本轮；先审核前置，再改指main重验，不自动合并。
- 阶段1按[开发计划](traffic-entry-phase1-plan.md)渐进交付。本轮接入政策保存/历史恢复/提交/退回/审核/下架与正式白名单快照，原员工不自动获政策授权；集合通用CRUD仍关闭、管理员只读、导航默认隐藏。现有公开列表始终排除政策。下一步1.1c2字段界面，1.1d再做种子与专用公开读取；查询工具仍未实现，见[政策约定](immigration-policies.md)。
- **停止点A已由用户于2026-11-01确认**：Render，以及Cloudflare Web Analytics加站内每日事件汇总。用户明确当下只继续本地开发测试；不创建账户、不购买、不部署、不接统计代码。无个人标识的有效行为次数口径按已确认方案说明执行，不宣称独立访客人数。

## 既有基础版本与证据

- 基础分支 `codex/trial-readiness`，同一时间只由一台电脑修改；草稿 [PR #2](https://github.com/yaemart/huacompanion-ai/pull/2)，不自动合并或部署。
- 本阶段按用户任务说明完成收敛代码与本机部署准备；真实试运行账户未提供，邮件实发、托管恢复、真实环境权限与网关仍待验收。不要将代码交付解释为正式上线。
- 分支包含尚未合并的 PR #1 协作／CI 基线；任务1 f5ea0e3、任务2 388ea6a（迁移格式7c191cf）、任务3 c1e813b、任务4 01ee97a。纯格式化独立提交为 d24d7b3。
- 最终任务5及补测提交以 `git log`／交接消息核实完整 hash，不在本文件虚构自引用 hash。每个 head 的 CI 需单独核对，不能沿用旧结果。
- 完整需求／计划：`superpowers/specs/2026-11-01-trial-readiness-design.md`、`superpowers/plans/2026-11-01-trial-readiness.md`；实际验证见 `progress.md`。

## 当前行为与剩余事项

1. 可维护性门禁已建立：check 串行 lint、typecheck、单元测试；核心指定文件 any 清零；本轮又清理内容发布服务9处，剩余数量与原因见 progress，无超过200字符的源码行例外。
2. 中文 `/operations-overview` 按员工范围统计／导出，CSV敏感字段仅管理员显式选择，导出先审计；没有改报价规则或客户授权。
3. SEO固定页由管理员在 `/admin/globals/seo-settings` 编辑，内容详情仍走草稿审核发布，图片沿用访问边界。trial默认noindex，正式环境也需显式收录开关。
4. `SITE_LOCALES` 默认 en,zh，其余五语的公网URL/API关闭，后台与代码七语保留；客户中心、全部客服／语音／通话、AI报价、外发邮件默认关闭。已有库运行 `trial:configure` 先预览，`--apply` 才持锁关闭并审计；不是启动时反复重置。
5. 表单客户端60／全站6000每十分钟；未配可信代理只用签名浏览器Cookie，能被清除重置。启用代理要求网关覆盖秘密头与权威IP并实际防绕过；目前没有宣称真实网关验证完成。
6. Docker三应用进程／PG／图片卷已在本机隔离启动、冒烟与两次配套恢复（最终62表、2图）通过；测试容器已停止并保留卷。不得把虚构测试卷复制上线。
7. 推荐 Render，备选 Railway + Neon，仅给方案／预算，未购买。账户、隐私主体、指定收件人及费用决定见 `launch-accounts.md`；真实验收条件到位后继续，不自行开放表单或正式发布。

## 环境与数据

- Node24.22.1、PostgreSQL15；本机系统默认Node版本不等于项目版本，先按 `.nvmrc` 配置并确认 `node -v`。本轮验证明确使用Node24。开发网站3000，专用虚构测试库55438。
- `npm run dev` 保留Next Fast Refresh、关闭Payload HMR；CMS配置／集合／字段／权限配置修改后重启。构建与check串行，避免生成Next类型竞争。
- 本轮DB回归先停止网站及两个worker，验收后均已恢复；workflow无提醒/处理，support记录AI不可用转人工。高级/邮件/模型开关仍关闭；进程与数据不经Git同步，其他电脑需自行启动并使用独立测试库。本轮155项单元、政策工作流DB/HTTP及原content/permissions/quality/agent/policies五套回归、生产构建通过。独立静态复核无发现，另跑3项纯单元通过；默认flag关闭、虚构政策/版本/临时板块授权均为0已核实。本head云端CI以最终交接实际状态为准，下一步1.1c2。
- 本轮迁移20261101_091015_immigration_policy_workflow只给员工内容类型枚举增加immigration-policy，不自动授权。备份.local/policy-workflow-before/database.dump；空库及隔离克隆up/down/up保留66张原表内容，down遇政策授权先拒绝，不能静默删除授权。本机已备份后事务up、原数据不变，local迁移标记保留。换电脑先备份升级；不要复用62表备份测试这一步。
- 新迁移：此前三项加`20261101_082855_immigration_policies`。本机已停三个进程、备份后事务应用政策up，原62表原列数据指纹一致；升级前备份在忽略目录`.local/visa-collection-before/database.dump`。本机保留原local开发迁移标记，不重放旧迁移；trial/CI空库正常执行全迁移CLI。其他电脑接手前先备份并阅读迁移说明，不能直接覆盖数据或用down切分支。
- `.env.example` 增加`VISA_CHECKER_ENABLED=false`；仅字面true显示本阶段后台导航，权限不随开关放宽，公开工具仍未实现。实际.env未改，截图临时进程已关闭并恢复默认。既有`SEARCH_ENGINE_INDEXING=false`、`SITE_LOCALES=en,zh`、可信网关和`INTAKE_ENABLED`边界不变。
- Docker使用 `.env.compose`、3001／55439和独立命名卷，命令见 `../docker/README.md`；配套恢复只用随机新目标，不覆盖55438或现有图片目录。
- `.env*`、`.local`凭据／媒体、数据库备份和容器测试备份不入Git。保留原本机内容；不从另一电脑覆盖运行中的目录，数据库和图片配套迁移。

## 下次接手

先检查 `git status`、`git branch -vv`、`git fetch origin`，确认工作区和远程head；同一任务用 `git pull --ff-only` 接手。有分叉先检查双方提交，不强推或清理未提交资料。先读最新任务书、阶段1计划和停止点A选项；A已确认，但当前只做本地；继续下一独立步骤，不据此开通账户、购买、部署或接统计。真实环境阶段另核对账户与授权。

```text
日期与任务：
当前分支／已确认远程提交：
PR／对应head的CI状态：
已完成／未完成或阻塞：
实际测试命令与结果：
环境变量变化（无秘密）：
迁移／备份／媒体要求：
本机服务和worker状态：
下一步及需要用户提供的账户：
```
