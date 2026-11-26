# 管理员本地提醒命令：本批小结与使用

[草稿PR125](https://github.com/yaemart/huacompanion-ai/pull/125)在PR124内核之上补齐一次性管理员命令；不自动合并。只生成/核实本届30天、7天本地待发记录，真实邮件、自动调度和运营页面后批，公开“提醒尚未启用”文案保持。

## 准备

1. 使用Node24.22.1与锁定依赖，配置自己的local环境及已迁移数据库。已有库先停对应Web/worker、配套备份，再按项目流程迁移/重建；命令不会自动建库或同步schema，本批未升级原演示库。
2. 通过既有员工登录取得当前有效的管理员JWT；命令不新增密码登录、裸staffId或命令行token入口。只有现职管理员可以操作，回执绑定原操作账号；换会话仍须同一账号。
3. 在仅自己可访问的目录保存原始JWT文本，文件须当前用户所有、0600、常规单链接文件。回执输入要求相同，不接受符号/硬链接、目录、特殊文件或超长内容。此入口依赖POSIX所有者/模式校验，当前验收环境为macOS与Linux CI。

macOS zsh保存现有JWT示例（输入不回显，不进入命令参数；目录与文件留在Git忽略的.local）：

```zsh
mkdir -p .local/private-reminders
chmod 700 .local/private-reminders
(
  umask 077
  set -C
  read -r -s 'reminder_jwt?请输入现有管理员JWT（不回显）：'
  printf '\n'
  printf '%s\n' "$reminder_jwt" > .local/private-reminders/admin.jwt
  unset reminder_jwt
)
```

已有同名认证文件时上述示例拒绝覆盖；在新私有文件中准备新会话。不要将JWT、回执内容、密码或.env贴进聊天/PR、终端日志或Git。

## 预检与应用

将`fair-content-key`换成已审核本届的contentKey，而非展会名称、网址、slug或下一届标识。语言只支持zh/en，分别依据本语言审核快照。

```sh
npm run --silent exhibition:reminders -- preview \
  --key fair-content-key --locale zh \
  --auth-file .local/private-reminders/admin.jwt \
  --receipt-file .local/private-reminders/first-preview.receipt

npm run --silent exhibition:reminders -- apply \
  --auth-file .local/private-reminders/admin.jwt \
  --receipt-file .local/private-reminders/first-preview.receipt
```

`--silent`抑制npm自身的脚本/参数回显。也可直接使用`node --import tsx scripts/exhibition-reminders.ts`加同样参数。独立`--help`只显示说明，不读凭证或初始化数据库。

预检全表只读，成功将封套写入全新0600文件，终端不显示JWT/封套。核对本届标识、语言、审核标题、快照版本、总体日期、业务日和拟新增/已有/拟取消数量，再明确应用；本档待发人数与订阅合资格人数分开，已取消终态不复活。新预检必须用新路径，不能覆盖任何已有回执。阻止/失败不提供可应用的新回执，保存失败时可能留下私有不完整文件，应换新路径重新预检。

北京时间恰好开展前30/7天才生成，漏日不补，不按分期分别提醒。其他日期只能明确核实失效记录；拟新增和拟取消均为0时无需应用。本批仍需人工运行，无定时扫描或后台worker。

退出0表示帮助、成功预检、成功应用或历史查询；退出1表示拒绝/失败，不能据此断言应用一定没提交。应用不改写原回执。结果未知时保留原文件，先再次用同一回执核实；历史报告明确显示“当时数量、原操作时间、当前资格未检查”，不是当前可发资格。仍不能核实结果时先核对现有审计/数据库/权限，确认未提交后再用新文件预检；不删除历史、不强制重试。撤权或登出后须重新按原登录链路获取有效管理员会话。

订阅总开关、隐私、语言和维护等条件限制新写入；邮件开关/供应商凭证保持原值。已提交回执经当前同一管理员授权可只读查询，支持后来的总开关关闭和密钥轮换；未提交旧封套仍须当前签名、10分钟、业务日及状态复核。APP_ENV非local一律拒绝实际操作。

## 验收与边界

35项新增参数、真实fs、实际启动与脱敏测试及完整check790/790、订阅42组与实际CLI闭环、生产构建通过；实际业务源码264行≤400。子进程HTTP/fetch禁止且最终0调用，缺失库自动创建有能失败的真实负对照。最终复核与精确提交CI见PR125核实记录。

无新依赖、迁移、字段或必需环境变量；原审核、现职权限、内容→业务→权限→邮箱→主题锁与H真实试发门禁保持。命令强制关闭自动schema、自动建库、类型自动生成和遥测，普通完成/失败路径销毁Payload。原始日志只在本机.local，未上传附件；无新页面，不虚构浏览器操作、真人、真实投递或全系统网络抓包验收。
