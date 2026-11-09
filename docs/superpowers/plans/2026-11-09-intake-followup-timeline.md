# 任务 E2：只能追加的跟进时间线实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 咨询、服务商只能追加内部跟进，系统记录时间与作者，旧备注完整保留为首条。
**Architecture:** 两类父记录及版本表增加只读JSON历史字段；原notes原文保留、禁止覆盖。专用POST复用businessTransaction锁，锁内重读员工与授权父记录，校验并幂等追加，同时写既有审计。追加只改参数化JSON、不改资料编辑时间，普通保存锁内取最新历史，保留真实他人修改的过期保护；普通CRUD不可伪造历史。客户端字段禁用表单提交历史数据，追加独立保存，不刷新／清空其他未保存输入。管理员敏感CSV包含完整跟进且沿用原筛选／转义。
**Tech Stack:** Node24.22.1、PostgreSQL15、Next16.4.3、Payload3.92、React19、TypeScript；只用既有依赖。
**Spec:** docs/tasks/editor-ux.md；docs/tasks/2026-11-08-master-plan.md；状态批准记录2026-11-09-intake-status-proposal.md。

## Global Constraints

- 接手codex/intake-followup-timeline；PR39合并main2abfee5；批准记录e158e6f保留。只做追加时间线及前批两项相关显示Minor。
- 状态方案虽已批准，代码后续独立PR；本批不实现转服务单／P1／F报价，不改角色和记录范围。
- 业务源码增删≤400，迁移／测试除外；lint≤465，源码≤200，无新增any。
- 旧备注及历史版本不能丢，未知作者／时间不猜测；克隆迁移往返验证，回滚拒绝丢失新跟进。
- 原55438不写；55442先停写、配套备份恢复核对，再受保护增量迁移，普通启动，不reset。
- 真实AI／邮件／语音／通话／worker关闭，不购买、不部署、不自动合并，不新增依赖或环境键。
- 截图和原始日志只在.local及PR附件；新人／真机测试不冒充开发自测。

## Review Focus

1. 并发追加、网络重试、普通表单保存是否丢历史或误重复，未保存字段是否保留。
2. 原备注及各历史版本有空值／长原文时是否完整迁移，是否伪造旧作者时间，回滚是否静默丢新记录。
3. 当前员工停用／改团队、跨记录请求、直接CRUD／伪造作者时间是否越权，审计是否与追加同事务。
4. 只读历史字段是否被客户端普通表单携带旧值覆盖；追加失败、错误Origin、超大请求时是否保留输入。
5. 管理员敏感CSV是否保留旧备注和新跟进，运营是否看不到越权成本／备注导出，日期及HTML是否安全。

## Task 1：完整追加时间线

**Interfaces:** lib/intake-followups.ts纯校验／显示／CSV → server/intake-followups.ts锁内追加 → api/intake-followups/route.ts鉴权 → cms/FollowUpTimeline.tsx受保护字段。collections既有钩子接只读历史保护；四列正式迁移及demo启动守卫；原敏感CSV接格式化结果。

- [x] RED：先写旧备注保留、严格输入、幂等键／作者显示，以及两项旧资料Minor的纯与SSR回归；观察缺模块／真实边界失败。
      Expected: 正确RED原因，无数据库密钥依赖。
- [x] GREEN：实现只读历史／字段、锁内追加／审计／幂等、迁移与CSV；生成类型／映射。测试普通CRUD不可改历史／notes，追加仅范围内当前员工，双并发均保留，同key同body一次、不同body冲突，记录作者时间不可由输入指定。
      Expected: 纯／SSR、迁移往返／拒绝有新数据回滚、相关集成通过；所有旧notes原文保留。
- [x] 验收：随机克隆生产build／HTTP Origin及权限／真实浏览器两类追加重载、保留其他修改、失败保留输入、桌面1440／手机390。停写源备份恢复全表与图片后单增量迁移，重启3100并五账号自检。
      Expected: 无邮件／worker，无源数据覆盖，无重复／丢失；不是新人／真机通过。
- [x] 收尾：更新一页小结、指南、progress、handoff；check；早建草稿PR；一次独立整分支复核，重要项TDD一次修复；最终headCI／上游一致见交接消息，上传有效截图；清理自建克隆，归档本计划记录。
      Expected: check全过、lint不增，业务≤400，PR待用户合并，明确可测E7跟进部分与剩余项。
