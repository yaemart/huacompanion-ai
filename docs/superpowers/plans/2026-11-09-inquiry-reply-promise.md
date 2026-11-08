# D9 咨询回执回复承诺实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans；原地任务分支，不另建工作树。

**Goal:** 成功咨询回执显示后台可配置中英文回复承诺，并保留编号／本地未发送邮件提示。

**Architecture:** 现有管理员workflow-settings新增inquiryReplyZh／inquiryReplyEn两个可空textarea（≤500字），留空用默认。服务器显式白名单投影两个字符串经现有SiteContext传入独立InquiryReceipt组件；原保存接口／幂等／权限／邮件开关不改。页面重新打开读取配置，其他五语沿用英文承诺回退，不新增翻译。

**Tech Stack:** Node24.22.1／Payload3／Next16.4.3 App Router／PostgreSQL15。

**Spec:** docs/tasks/customer-fixes.md 第9条；用户“37已经合并，继续”。

## Global Constraints

- 默认中文“我们会在 1 个工作日内（北京时间）通过邮件回复您。”；英文“We will reply by email within 1 business day (Beijing time).”。
- 仅D9，不实施E、真实邮件、SLA调度或部署；管理员权限沿用，其他角色不可读改完整设置。
- 每PR业务增删<400，源码≤200／lint≤465；生成类型由Payload生成，不手写。
- 源55442先停写配套备份并恢复核对，迁移仅新增2可空列／迁移记录，旧数据保留；原55438不写，不reset。
- 截图不进Git；真实服务及worker关闭，Node按.nvmrc，用户决定合并。

## Review Focus

- 已有配置留空、只有一语或读取失败：每语独立默认；不让保存成功变成失败。
- 已保存编号／重复提交／失败提交：只成功咨询显示承诺，服务商申请不显示，旧幂等语义不变。
- 私有通知配置：浏览器只收到两个公开字符串，不含开关、内部事件或客户数据。
- 超长／带HTML文本：保存限制500字，React转义且手机断行，不执行HTML。
- 旧库升级／回滚：旧字段值和设置开关不变，有自定义承诺拒绝破坏性回滚；其他电脑缺列启动停止提示。

## Task 1：D9可验收交付

**Files:** 新增src/lib/intake-receipt.ts、src/server/intake-receipt.ts、src/components/InquiryReceipt.tsx、单个迁移；修改workflow collections、SiteContext、frontend layout、InquiryForm、迁移索引、生成types、演示启动检查；新增纯／SSR／DB／HTTP测试接CI，更新一页指南和实际交接。

**Interfaces:** defaultInquiryReplies与publicInquiryReplies(settings:unknown)→{zh:string,en:string}只白名单；readInquiryReplies()读取配置或默认；InquiryReceipt({locale,kind,reference})从SiteContext消费inquiryReplies（可选），reference空返回null。

- [x] 新增纯测试与真实组件SSR；先运行观察模块缺失RED；断言准确默认、分语空值回退、只投影两键、异常类型与超限拒绝回退、HTML转义、申请／空编号不显示承诺且本地提示保留。
- [x] 实现最小组件接入；本地Next layout／context文档已读，生成Payload类型；纯／SSR GREEN，不改提交API或客户数据存储。
- [x] 隔离库测试迁移往返旧列指纹、配置回滚保护、admin成功／其他角色拒绝及maxlength；生产build与HTTP配置仅两字段、不泄露事件配置、默认／自定义／清空后更新；既有support回归；试运行本地HTTP提交预期503，隔离APP_ENV=local生产构建明确--intake-enabled验证原回执／幂等，保留HTTPS门禁。旧test:intake拒绝随机库名则保留保护，在CI合法临时库执行，不放宽guard。
- [x] 桌面1440／手机390实际表单提交、双语编号／承诺／本地未发邮件、管理员配置验证。配套备份恢复核对后源只装单个增量迁移，普通重启及test:demo，不reset。
- [ ] npm run check及相关集成通过后提交push尽早草稿PR，一次独立全分支复核；最终精确headCI／远端核对。记录新人／真机未验与附件实际状态，不自动合并。
