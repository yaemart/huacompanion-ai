# CRM C1跟进事项内核一页小结

2026-11-28；PR139已合并c4781da，用户审阅确认后授权“推进”。分支codex/crm-phase-c1-core，
[草稿PR140](https://github.com/yaemart/huacompanion-ai/pull/140)，不自动合并。

本批只启用adhoc附加事项，提供客户/咨询锚点、负责人/截止、追加记录、完成及原子续建、改期、取消、明确同团队事项转交、
父关闭挂起/重开核对。私有事项/事件/主槽与独立FollowupReceipt，沿原生员工认证及当前范围；事项指派不扩权。
主管可管理说明/取消，不能代他人完成改期。查询先范围过滤再计数分页，咨询直接入口不透露CRM客户资料。

客户页操作咨询子事项额外携带expectedInquiryUpdatedAt/expectedLinkRevision；读取提供parentVersion/linkRevision。
所有写按业务→客户锁且READ COMMITTED，锁后重查会话/现职/范围/父版本/事项版本；任务、事件、审计、回执同事务。
原键重试返回历史实际回执，失权不回放；实际changedCount只算真正修改的事项，所有无变化409。

新增20261128_170000_crm_followups仅空新表/索引；互斥锚点、有限日期/正整数版本、唯一主槽/事件/待办主事项、
终态元数据与RESTRICT保护；已有事项/事件/槽或对应回执时down拒绝。只在独立CRM随机虚构库迁移，不迁移真实库。
旧nextFollowUp/followUps/外部授权保持；不创建通用workflow任务或对客通知，C2才接管主来源，C3才做员工界面。

无依赖/产品环境变量/.env变更。PostgreSQL15/55443、HTTP3201，原演示/备份不操作，不启用真实邮件、驻留或部署。
实施与验证回执以最新handoff/progress为准；当前文档不把C2/C3验收或真人界面验收写为已完成。
