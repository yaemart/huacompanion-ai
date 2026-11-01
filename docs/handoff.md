# 当前开发交接

日期：2026-11-01（Asia/Shanghai）。这是换电脑和继续开发时先读的入口。

## 当前生效任务与停止点

- 最新权威需求为 [流量入口分阶段任务书](traffic-entry-task.md)，已取代旧“收敛与上线准备”和“补充任务”。旧实施记录仅保留为已完成工作的证据。
- 当前分支codex/visa-checker-accessibility，依赖草稿[PR13](https://github.com/yaemart/huacompanion-ai/pull/13)的231e2c94d2dcd29b9374ec66361fe810c2148b92；基准push/PR CI已成功（41314484133、41314489200）。本步草稿[PR14](https://github.com/yaemart/huacompanion-ai/pull/14)，当前head完整SHA/CI见最终交接，不能沿用基准结果。依赖顺序PR2→3→4→5→6→7→8→9→10→11→12→13→14，前置合并后改指main重验，不自动合并。
- 阶段1按[开发计划](traffic-entry-phase1-plan.md)渐进交付。1.1政策流程、1.2纯查询及1.3a/b/c SSR/浏览器查询/正式FAQ与本机移动审计已验证。后台入口/content-center?kind=immigration-policy仍需开关和显式授权，通用集合CRUD仍关闭。工具默认404/noindex，无公共原始数据API。下一步1.4政策横幅；现实内容/部署/恢复及公开B仍待完成。
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

- 1.3c无schema/新项目依赖/实际.env修改；新增可选VISA_FAQ_CONTENT_KEYS仅示例，逗号精确选择同语言正式faq；正文纯文本块、每来源HTTPS+核实日，未配置/未发布/下架/不完整不造数据，空FAQ无schema。FAQ仍是既有通用公开内容，不是全站保密开关。用户明确批准临时官方Lighthouse13.6.0，安装在.local/lighthouse-tool，不进入package/锁。生产中英mobile412×823、默认4G模拟/CPU4倍放慢性能/可访问性均100；初始英文100/97的对比度和品牌可见名称问题已实际修复复测。报告/手工键盘/390/320无JS截图见screenshots/visa-checker-accessibility；未实跑VoiceOver/NVDA或所有系统缩放/跨浏览器组合，真实内容和托管后重测。
- 本步check190单元、三套静态渲染、生产build、七语开关HTTP及政策/指南/FAQ发布改稿下架、query DB/trial HTTP退出0；源码any仍290/38，行长无例外。虚构政策/版本/工作稿/快照/FAQ/指南/临时账号/授权0，原稿116保留、flag关闭。默认dev和两worker恢复，support无模型转人工，workflow0提醒/处理。独立复核无Critical/Important/Minor，另跑190单元/三渲染并查看原始报告，未重跑DB/HTTP/build/浏览器/CI。源码提交2d1fb0664cb3bce3267cce14838151be0390492b已与构建源码指纹核对；最终文档提交不冒称重新跑过Lighthouse。当前head远端/CI另核，不能把本地审计当上线验收。

- 1.3b无新迁移/依赖/服务/实际.env变化；.env.example新增可选VISA_GUIDE_CONTENT_KEY，只从listPublished精确匹配同语言guide，未配置/未发布/下架没有特定链接，不能随便选文章。国籍/入境日只在浏览器局部state，水合前禁用且无form/name，输入改变清空旧结果，SSR表保留。check186单元、静态控件/结果渲染、生产build、生产开/关HTTP及真实指南发布/下架、query DB和trial HTTP已通过。实际浏览器中英键盘/未知/过期/无JS及390手机通过，0查询网络/日志/异常，网址及非敏感存储摘要不变；未读取保留完整Cookie/存储值，限制见screenshots/visa-checker-browser。临时政策/版本/草稿/快照/指南/账号/授权0，原稿116保留、实际flag关闭；默认dev及两worker恢复，support转人工，workflow0提醒/处理。AST any仍290/38。独立复核无Critical/Important/Minor，另跑186单元及控件渲染；未代跑DB/HTTP/build/浏览器/CI。页面快照不实时更新，发布/下架后须重新加载。FAQ/Lighthouse未完成，公开B未到，不部署。

- 1.3a无新迁移/依赖/实际.env变化；业务源码369行。check182项单元、静态表格渲染、生产build、生产开/关七语HTTP矩阵和发布/改稿/下架链路、原query DB/trial HTTP回归已通过，源码AST any仍290/38文件。无JS桌面/手机截图均是虚构资料并已清理；页面宽度无溢出，表格可键盘横滚。独立复核无Critical/Important/Minor，另跑表格渲染及纯18/18；未代跑DB/HTTP/build/浏览器/CI。最终串行核实政策/版本/工作稿/快照/临时账号/授权0，原稿116保留，实际flag关闭。默认dev和两个worker已恢复，support转人工、workflow0提醒/处理。当前head远端CI见最终交接及PR12。

- 1.2无新迁移/依赖/环境值变化。check通过177项单元；新增test:policies:query与原test:policies:data两套DB及trial HTTP通过。查询显式日期基准，只消费正式投影；指南必须由调用方从listPublished提供，无真实指南时null。只读核实政策/版本/工作稿/正式快照/临时账号和授权均0，原稿116保留，实际flag关闭。此步无界面，截图不适用。独立复核无Critical/Important/Minor，另跑纯13/13；未代跑DB/HTTP/build/CI。网站及两个worker已恢复，support无模型转人工，workflow为0提醒/0处理。当前head远端/CI证据见最终交接及PR11说明。

- Node24.22.1、PostgreSQL15；本机系统默认Node版本不等于项目版本，先按 `.nvmrc` 配置并确认 `node -v`。本轮验证明确使用Node24。开发网站3000，专用虚构测试库55438。
- `npm run dev` 保留Next Fast Refresh、关闭Payload HMR；CMS配置／集合／字段／权限配置修改后重启。构建与check串行，避免生成Next类型竞争。
- 1.1d无新迁移/依赖/环境值变更，复用既有66表结构。本轮data+content/permissions:content/quality/policies:workflow/policies:editor六套DB及policies/workflow/editor/trial四套HTTP退出0；164项单元、check及生产build通过。独立复核3项CLI连接/错误与输入类型问题均补RED→GREEN，详见progress；复核者未重跑DB/HTTP/build/CI。只读核实政策/版本/工作稿/正式快照/临时授权均0，原稿116保留，实际flag关闭；未把空模板导入用户库。网站与support/workflow两个worker已恢复，仍无模型/外发邮件；当前head CI见最终交接。
- seed:policies须--file JSON，默认预览，--apply仅创建草稿，已有记录不更新。限制本机专用postgresql URL且无查询/片段，避免驱动改连接目标；核实字段只能后台填写。SSR投影只读active快照，默认空，不新增公网接口。1.2纯函数现已验证，仍需实际政策、指南与后续工具/B验收。纯数据/脚本无新截图；screenshots/visa-policy-editor只代表1.1c2旧表单验收。
- 本轮迁移20261101_091015_immigration_policy_workflow只给员工内容类型枚举增加immigration-policy，不自动授权。备份.local/policy-workflow-before/database.dump；空库及隔离克隆up/down/up保留66张原表内容，down遇政策授权先拒绝，不能静默删除授权。本机已备份后事务up、原数据不变，local迁移标记保留。换电脑先备份升级；不要复用62表备份测试这一步。
- 新迁移：此前三项加`20261101_082855_immigration_policies`。本机已停三个进程、备份后事务应用政策up，原62表原列数据指纹一致；升级前备份在忽略目录`.local/visa-collection-before/database.dump`。本机保留原local开发迁移标记，不重放旧迁移；trial/CI空库正常执行全迁移CLI。其他电脑接手前先备份并阅读迁移说明，不能直接覆盖数据或用down切分支。
- `.env.example` 增加`VISA_CHECKER_ENABLED=false`；仅字面true显示本阶段后台导航及中英SSR工具页，权限不随开关放宽；浏览器查询及FAQ/本机移动审计已验证，真实内容/托管验收待后续。实际.env未改，截图临时进程已关闭并恢复默认。既有`SEARCH_ENGINE_INDEXING=false`、`SITE_LOCALES=en,zh`、可信网关和`INTAKE_ENABLED`边界不变。
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
