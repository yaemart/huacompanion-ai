# H：签名回执接收与整链路模拟验收（已接受）

## 基线与目标

PR117已合并，fetch后origin/main为`f639e692f98af05a97b5a483e095b055f5df717d`，包含最终f0bc8f4。
干净工作区从该main创建`codex/subscription-signed-feedback`。先H后展会日历，不自动合并。
本批用Resend/Svix真实签名协议与虚构事件完成本地HTTP→持久回执→拒发→资格/worker的模拟闭环；不接真实账号、发件、费用、隧道或部署。

## 方案选择

推荐复用Node内置crypto，按Svix公开手工协议实现HMAC-SHA256验证，并用官方固定向量及独立签名夹具验证，避免新增依赖。
官方SDK是另一条可行路线，但本仓库尚无Resend/Svix SDK，安装须另获新增依赖许可。本设计选不新增依赖。
真实生产匿名接收和真实邮件ID绑定须随真实传输另行验收，本批不因协议兼容而放开非local环境。

## 请求入口与验签

- 新POST `/api/subscriptions/campaign-feedback`，仅APP_ENV=local及显式回执开关开启时可处理，缺密钥或开关默认拒绝；不调用发件API。
- 拟新增`SUBSCRIPTION_FEEDBACK_ENABLED=false`、`SUBSCRIPTION_FEEDBACK_SIGNING_SECRET=`，测试时注入随机值；不改已有.env或真实密钥。
- 不依赖浏览器Origin或员工JWT，认证来源是验签。保留试运行Basic/维护门禁，不新增非local匿名绕过。
- 限制原始请求体16KiB和请求头长度；先按原始字节验证，再解码/解析JSON，不先JSON.stringify重构正文。
- 校验svix-id、以秒计的svix-timestamp、svix-signature；v1签名支持空格分隔的多个候选，用恒定时间比较。
- whsec_后密钥按base64解码；签名内容为`id.timestamp.rawBody`。请求签名时间接受当前时间±5分钟，未来过大/过期拒绝。此窗口针对本次投递签名，不拒绝事件本身的合法迟到。
- 失败、停用与未支持方法不写业务表，响应不返回邮箱、原文、签名、密钥或内部记录。关闭营销发送不同时关闭这个独立回执开关。

## 邮件绑定、事件归一化与幂等

- 现有模拟尝试没有供应商邮件ID。新增私有本地模拟邮件绑定，由内部现职管理员演练服务建立，关联原attempt及收件邮箱摘要；绑定不可换任务/地址，不从回调tags或attemptId建立绑定。
- 以已验签的data.email_id（全局抑制事件使用source_id）查服务端绑定，再交叉核对原任务/活动和唯一收件人；真实收件地址仍拒绝。模拟ID明确标注本地来源，不冒充供应商发件成功。
- 首批处理email.delivered、email.bounced（仅Permanent才作硬退信）、email.complained、email.suppressed及suppression.added。供应商抑制独立标记为provider-suppressed，不伪装成硬退信/投诉；suppression.removed不清除本地拒发。
- 无source_id的全局抑制仅允许匹配已绑定过的本地营销地址，作为邮箱级事件保存，不捏造某任务投递结果；需要反馈模型区分邮件事件与邮箱级抑制。
- 对未绑定的相关事件返回可重试结果，不猜测任务或吞掉可能早于绑定到达的回执；无关事件只在验签通过后安全忽略，不执行点击/打开跟踪。
- 私有接收记录以供应商命名空间+svix-id摘要唯一，保存必要归一化指纹/处理关联，不保存原始正文或诊断文本。同消息重放不重复处理；同ID换目标/类型/事件时间拒绝。
- 接收记录、回执、首次拒发和系统来源审计同事务；签名服务身份与管理员手工模拟身份分开，不伪造员工actor。原手工服务仍要求现职管理员，不能用布尔参数从HTTP跳过鉴权。
- 复用内容→业务→邮箱锁、历史保护及拒发单调性。已开始尝试可按原守卫记录结果，新尝试/重试/重订/新活动/续发均不能解除拒发。

## 验收与交付

1. 官方签名向量、原始正文变化、UTF-8、缺头/错签名/错密钥、时间窗口、多签名、超体积、默认关闭、非local拒绝；先RED后实现。
2. 真实PG和实际HTTP覆盖“模拟开始→邮件绑定→签名送达/硬退信/投诉/抑制→持久回执及拒发→新活动/续发/worker拒发”，并验证已开始结果保留。
3. 并发重放、跨第二真实任务的同ID冲突（补PR117轻微待办）、迟到送达/移除事件不解除拒发、绑定迟到后重试、错误归属及审计失败回滚；所有拒绝/只读操作比较全表指纹。
4. 运行完整npm run check、官方完整订阅集成及相关迁移验证；保留已有大表性能、预算、worker中断与租约竞争组，不放宽断言。
5. 数据模型变更附迁移和生成类型，仅独立随机库应用，非空记录保护回退；不升级/重置已有演示库。业务源码目标≤400行，必要时先交付可独立验证的小PR，不绕过顺序合并规则。
6. 更新一页中文小结、handoff/progress；一次末尾独立复核、推送完整SHA和精确CI、草稿PR；无UI变更不虚构页面截图或真人验收。

## 官方依据（2026-11-25核对）

- [Resend：原始请求体验签](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Svix：HMAC协议、时间检查、多签名与固定向量](https://docs.svix.com/receiving/verifying-payloads/how-manual)
- [Resend：事件类型](https://resend.com/docs/webhooks/event-types)、[退信类型](https://resend.com/docs/webhooks/emails/bounced)、[邮件抑制](https://resend.com/docs/webhooks/emails/suppressed)、[全局抑制及source_id](https://resend.com/docs/webhooks/suppressions/added)
- [Resend：重试和重放](https://resend.com/docs/webhooks/retries-and-replays)

独立设计检查未发现仍需澄清的重大问题，具体模块划分留给实施规划。
2026-11-26用户明确回复“接受”，沿用原生实施方式，不重复请求相同授权。实现与实测结果由本批交接记录承载。
