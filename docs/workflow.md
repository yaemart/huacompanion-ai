# 通知与待办

入口 `/workflow-center`。员工使用后台登录后可查看站内通知、认领、分派（主管）、完成和填写原因后延期。每次读写重新查询咨询或内容当前权限；历史收件人身份不能保留已撤销访问权。通知仅发给具体收件人；待办按当前源记录权限显示。所有历史操作保存在任务内。

`workflowCollections` / `workflowSettings` 位于 `src/cms/workflow/collections.ts`。事件设置提供逐类型开关；主管逾期升级默认关闭、开启后默认 24 小时。事件、收件通知、任务和邮件具有持久唯一去重键；提醒键包含实际截止时间，因此重复扫描只提醒一次，延期到新截止时间后允许新提醒。

`enqueueWorkflowEvent(payload, { key, type, inquiry?, contentDraft?, recipient?, title, dueAt? }, req?)` 使用调用者事务请求，不能新开嵌套事务。调用方 key 必须是稳定业务事件编号，标题不含客户联系方式。咨询缺少 recipient 时取当前 owner。类型支持 inquiry-created、owner-changed、customer-reply、quote-sent、quote-confirmed、case-stage、quality-due、task-due、task-escalated。

运行 `npx tsx scripts/workflow-worker.ts --once` 单次扫描，去掉 --once 每 30 秒扫描。运行可由同机进程管理器监管。每批最多发送 25 封；持久租约与比较更新避免多 worker 重复领取，租约 60 秒，单次 HTTPS 超时 10 秒。失联后复用同一个供应商幂等键重试，最多 5 次，指数退避。超过 23 小时的未知状态停止自动重试，管理员在供应商控制台核实；不能把未知状态手工假定为已发送。

邮件仅使用 Resend 固定 HTTPS 地址。必须同时配置 `WORKFLOW_MAIL_ENABLED=true`、`WORKFLOW_MAIL_API_KEY`、`WORKFLOW_MAIL_FROM`；站内通知邮件还要求后台通知设置 `emailEnabled`。密钥只放环境变量，不保存在数据库或响应。验证码通过同一 `sendConfiguredMail({to,subject,text,idempotencyKey})` 适配器；`configuredMailEnabled()` 用于配置状态。网络故障返回 uncertain，供应商明确成功且给出 id 才返回 sent。通知邮件使用固定通用文案，不复制客户详情。禁用期间的邮件作业标为 disabled，不在后续开启时重发历史通知。

测试 `node --experimental-strip-types --test tests/workflow.test.ts`；数据库测试 `npx tsx tests/integration/workflow.ts` 只能在本地数据库串行运行。测试使用 `.invalid` 地址和注入的 fetch，不发送真实邮件。

供应商接口已按 [Resend 发送接口](https://resend.com/docs/api-reference/emails/send-email)、[幂等键说明](https://resend.com/docs/dashboard/emails/idempotency-keys)及[限流说明](https://resend.com/docs/api-reference/rate-limit)核对。重试遵守 Retry-After（上限一小时），响应读取上限 16 KiB。未分派咨询仍创建无负责人的任务；当前可访问该咨询的主管/管理员可认领。任务修改使用与业务/咨询归属修改一致的事务锁，串行复核最新员工权限和任务状态。

已验证客户通知：quote-sent、quote-confirmed、case-stage 仅为有明确有效咨询关联且已验证的活跃客户生成私有通知与可选邮件。业务调用方只允许在公开业务状态变更时发出 case-stage，草稿保存不得发出。worker 在发信前重新检查关联和账户；消息为七种站点语言的通用提醒和客户中心链接，不包含报价或联系方式。`customerWorkflowRead(p, customer, req?)` 返回白名单通知 DTO，`customerWorkflowMarkRead(p, customer, id, req?)` 沿用客户事务并重新校验关联和通知所有权。

管理员在工作台查看待发送、失败和待核实邮件，安全重试保持供应商幂等键不变。超过创建时间 23 小时不允许自动或手工重试，避免供应商幂等窗口到期后重复发送。未启用邮件仍可查看站内通知。

新报价发出或报价确认后，只关闭同一咨询更早的 quote-sent 待办，并保留系统关闭原因。重放旧事件不会关闭新版报价待办，其他跟进任务不受影响；即使关闭某类通知，已存在报价待办仍会随业务完成而关闭。
