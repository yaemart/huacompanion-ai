# 展会提醒1A：只读回执核实与持久状态查询

本批在[草稿PR126](https://github.com/yaemart/huacompanion-ai/pull/126)中提供两个管理员只读命令，沿原生方式实施，不自动合并。[1A计划](superpowers/plans/2026-11-27-exhibition-reminder-recovery-read.md)、[正式设计](superpowers/specs/2026-11-27-exhibition-reminder-scheduler-design.md)。原预检/应用、审核、写锁和H真实试发门禁保持。

## 使用

在项目目录使用Node24.22.1、锁定依赖及自己的local环境/已迁移测试数据库。原库升级仍须配套备份，命令不自动建库或同步schema，本批未操作原库。

沿[PR125说明](exhibition-reminder-command-summary.md)安全准备现有管理员JWT；认证与原回执须当前用户私有0600常规单链接文件，不贴到聊天/Git或命令参数中。

```sh
npm run --silent exhibition:reminders -- inspect \
  --auth-file .local/private-reminders/admin.jwt \
  --receipt-file .local/private-reminders/first-preview.receipt

npm run --silent exhibition:reminders -- scheduler-status \
  --auth-file .local/private-reminders/admin.jwt
```

`inspect`核对原封套对应的生成审计，只返回当时的已提交数量、原时间及“当前资格未检查”。没有匹配审计时返回“未找到可确认提交”；即使封套仍有效，也不会执行原动作。没有找到不能证明绝对未执行，不自动重试或换新封套。

旧已提交封套在过期、跨日、密钥轮换或订阅总开关后来关闭时，仍可由原管理员的新有效会话核实。换其他管理员不能认领原回执；JWT会话过期、原生登出或撤权仍拒绝。原`apply`可能实际生成，未知结果应先用本批`inspect`，不把`apply`当纯查询。

`scheduler-status`只读取当前数据库中的控制审计，返回状态和状态版本；无需回执文件，不读本地恢复目录。未登记不代表调度已启用；空闲不代表当前可发；“已登记运行”不证明进程在线；未决仅报告需要核实，不解除阻断。最新行损坏/未知版本或存在孤立控制事件时拒绝，不回退到旧状态或假装空闲。

退出0仅表示查询完成，包括not-found或blocked；退出1表示拒绝/失败，不能据此推断原生成一定未提交。输入文件字节不改写，不创建新回执、审计、任务或额度。终端不打印JWT、封套、邮箱/订阅ID、运行身份或摘要。

## 验收与后续

验收覆盖真实JWT、原生只读事务拒写、有效未提交封套不执行、历史脱敏/损坏拒绝、十并发、新进程密钥轮换与旧日回执、快照释放后登出、原生撤权、真实命令与私有输入目录变化、开发模式不改schema/types及0对外HTTP/fetch调用。新增22项单元，完整check819/819、lint0错误/445既有警告、订阅44组、content/exhibitions及生产build通过；业务源码374≤400。最终独立复核和精确CI见PR126核实记录。

1A不会创建控制事件或执行调度。持久未决写入、跨目录启动阻断、带原因受控结束及旧运行/封套防写属于[1B计划](superpowers/plans/2026-11-27-exhibition-reminder-recovery-control.md)，等1A合并后实施；实际循环、系统驻留和真实发送仍后批。现有排除原因分类和U+2028/U+2029标题清理轻微项保持另批。

无新依赖、字段、迁移或必需环境变量，未改.env；原库未升级，其他5份草稿保留。原始日志仅本机.local/exhibition-reminder-recovery-read，未上传；无新UI或真实送达声称。
