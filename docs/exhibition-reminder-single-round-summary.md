# 展会提醒：受控本地单轮与信号停止

PR128合并后，从最新main351f7ef建立`codex/exhibition-reminder-single-round`，[草稿PR129](https://github.com/yaemart/huacompanion-ai/pull/129)。本批交付管理员显式单轮入口，**只生成/核实取消本地待发，不发送邮件**。连续循环待本PR由用户合并后另批实施，不接网站或worker默认启动链路，不自动合并。

```sh
npm run --silent exhibition:reminders -- schedule \
  --auth-file .local/private/admin.jwt \
  --manifest-file .local/private/targets.json \
  --state-dir .local/reminder-runs/run-NEW --once
```

管理员先准备可信、自己所有的本地父目录和两个0600私有文件。JWT来自原登录链路；清单精确为`{"version":1,"targets":[{"key":"exhibition-2026","locale":"zh"}]}`，将示例key换成实际本届标识。清单1–20项、16KiB、zh/en，启动时固定身份与范围，改文件不能续期或扩大范围；旧目录不能复用，不能用新目录绕过同库未决。

命令仅APP_ENV=local，强制要求--once，缺失或非法输入在加载配置前拒绝。沿原安全初始化禁schema push/自动建库/types生成/遥测；仅本进程调度连接追加10秒单SQL/锁超时，原池大小不变。每个目标使用原预检、审核、北京时间30/7天、现职管理员、内容→业务→权限与邮箱/主题锁和唯一session许可，不生成或替换授权。

有变化时先持久保存原回执，再prepare、保存prepared/applying后才调用原apply；明确成功且当前授权有效才finish，finished保存完成后才宣布应用结果。无变化不apply。正常完成退出0；SIGINT/SIGTERM停止新工作并分别退出130/143，重复信号只收尾一次；拒绝、失效或结果未知退出1优先。

已调用的apply按原锁后批准完成当前事务，信号不追溯撤销；之后不处理下一目标。已prepare而未apply保留pending。会话过期、登出、撤权或停用不能借旧身份补finish/stop。文件/提交未知不自动重试或恢复；保留目录，用scheduler-status/inspect核实，必要时停原进程后由现职管理员带原因使用独立scheduler-resolve。finish已实际提交而响应/文件失败时DB可能无pending，不能据此假报全库blocked。

运行目录0700、文件0600，复用PR128独占与同步协议。非秘密DB绑定、原回执与阶段仅私有留证；目录替换拒写，不从旧JSON恢复写能力。退出时关闭自身目录、session并调用Payload.destroy，最后沿原独立CLI的process.exit关闭本进程连接；当前上游适配器保留初始化连接，不能把Pool.end等待作为收尾。没有终止网站、worker或其他数据库后端。

验收：完整check901/901、lint0错误/445既有警告、897文件行长；完整订阅48组、content/exhibitions、内容权限及生产build均通过。30个真实CLI场景与双进程拒绝，10种实际文件/提交故障及原生身份失效已验证，旧邮件/额度/租约/尝试表指纹保持。唯一末尾独立复核0严重/2重要/2轻微，重要项单轮RED→GREEN、无二次复核：实际npm组信号下必须有子进程finally证据，入口改为node --import tsx；已提交pending时原生撤权且真实信号已送达，停止路径只读核实当前身份，403优先且原控制版本/0held不变。收尾检查跨check及后继timer/poll周期，修复单timer偶现退出0。两轻微后批：--once错位仍可被解析；启动时尚未一次显示完整固定清单，实际范围仍被冻结。精确最终CI见PR记录。CI588单元作业通过，数据库作业因Linux外层npm以SIGINT终止而非数值130的测试断言失败。仅适配外层表示，实际调度子进程必须留下130/143收尾证据，DB仍须blocked/0held；没有放宽业务退出或权限。补跑完整check901/901及实际npm双信号退出0。产品源码、命令配置和构建入口相对9e50952未变，沿用该提交的本地48组/content/exhibitions/内容权限/build全绿证据；最终精确提交两CI以PR记录为准。详见[进度](progress.md)及[交接](handoff.md)。原始日志仅本机`.local/exhibition-reminder-single-round`，未上传。无新依赖、表、迁移、必需环境变量或.env改动；原运行库未操作，五份其他草稿保留。真实试发、自动调度循环和送达仍后批，原H试发门禁保持。
