# 入境政策集合 1.1b Implementation Plan

Goal: 增加受保护的结构化政策集合/历史版本、默认关闭开关、生成类型和安全迁移；不实现审核发布、种子或公开页面。
Architecture: 单一ImmigrationPolicies录入主记录，后续引用既有工作流与正式快照。本步仅有效管理员可读取记录和历史；所有普通CRUD关闭，包含管理员。仅受信Local API overrideAccess可写测试夹具。后台导航按VISA_CHECKER_ENABLED隐藏，公开工具仍未实现。
Spec: docs/traffic-entry-task.md、docs/traffic-entry-phase1-plan.md、docs/immigration-policies.md。

Global Constraints: Node24.22.1；无新依赖/服务/费用；一步一PR；业务源码<400行（迁移/测试另计）；修改模块无any；源码行长<=200；不自动合并或部署。

### Task 1: 测试与集合

Files: src/cms/immigration/collections.ts; src/lib/immigration-policy-flags.ts; tests/immigration-policy-flags.test.ts; tests/integration/immigration-policies.ts; src/payload.config.ts。

- [x] 先跑默认开关和集合权限测试，Expected RED缺少模块/集合。
- [x] 集合slug immigration-policies、dbName imm_policies、interface ImmigrationPolicy；policyKey唯一；国家中英名、类型、停留天数、日历日期文本、口岸数组、来源、核实人关系、公开/内部备注、draft/published状态和revision。
- [x] 非必填事实允许部分草稿；status/revision只读，status默认draft；版本maxPerDoc30。read/readVersions/admin仅有效管理员，CRUD/unlock false。尚未授予编辑员政策板块，不更改旧staff枚举。
- [x] VISA_CHECKER_ENABLED仅字面true开启；默认false，不改本机.env。Expected:单元GREEN，管理员只读，普通角色/匿名读历史及写入均拒绝。

### Task 2: 类型与迁移

Files: payload-types.ts; src/lib/immigration-policy.ts; src/migrations/新迁移; tests/integration/immigration-migration.ts。

- [x] 停站点与两worker后备份已有库；先生成迁移及类型，不运行local schema push。
- [x] 发布契约用生成字段Pick/NonNullable，关系/口岸列表是规范化投影；内部备注兼容Payload空值；不复制另一套Schema。
- [x] 迁移只新增政策表、版本表、子表与锁关系列；检查无旧表drop/数据重写。
- [x] 空库全迁移、已有库克隆up/down/up；对迁移前所有表做行内容hash/行数对照，含Payload集合锁既有记录。Expected:原数据完全保留，版本及唯一键/状态默认正确。
- [x] 验证通过后才在本机专用库应用这一个迁移；不清空/重建原库，不替换dev migration history。

### Task 3: 验收与交接

- [x] check、政策真实DB/REST权限和版本回归、原content/permissions/quality回归；生产build在dev停机时运行。
- [x] 中文后台截图仅展示虚构草稿；测试完清理夹具，开关恢复false。公开页面无变更。
- [x] 记录docs/progress.md、handoff和inventory，独立只读复核通过；恢复本机三个进程。
- [ ] 提交/推送独立草稿PR（依赖PR5），核对CI与远程head；最终交接消息记录实际提交与CI状态。

Review Focus: 默认Payload overrideAccess不是面向外部权限；版本入口与通用CRUD都要测试；时间字段不转换时区；不把statuspublished当新公开接口；生成迁移不能破坏旧锁关联或数据。
