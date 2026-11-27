# CRM A1a implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** 私有客户／联系人、固定权限、幂等审计与安全迁移，不开放HTTP或界面。
**Spec:** 阶段A设计及本文件修订；用户2026-11-28批准。

## 固定实施决定

三集合crm-clients、crm-contacts、crm-operations；关联表留A1b随其服务同批迁移。
管理员全范围，主管同团队，运营同团队本人；负责人必须同团队现职operations。
团队与负责人建档后不可变，客户类型不可变，无负责人仅管理员可建、同团队主管可读。
动作createClient/updateClient/saveContact/setPrimaryContact/archiveContact/archiveClient。
客户／联系人version为正整数；子项改变同时增加父revision。存档只读，无恢复。
A1a无关联表，archiveClient只在本批无活动关联的前提可用；A1b必须在开放关联同时加存档阻断。
未知字段整次拒绝，范围外与不存在统一404，版本／幂等冲突409。无导出、历史或通用集合接口。
读DTO不展开关系、不含内部成本、审核或身份凭据；读操作READ ONLY事务。
现有业务726281→客户726283，锁后现职和权限复读；无嵌套事务，不改已有锁路径。
crmAction为可信内部员工入口，要求staff集合身份、锁后读数据库员工；A2提供真实会话鉴权，
A1a不暴露HTTP且不接受外部身份或客户端员工JSON。不得称仅员工重读已覆盖会话注销。
幂等检查在版本校验前，但当前权限校验后；actor+UUID唯一，规范输入HMAC摘要及epoch。
epoch为当前秘密独立派生摘要标识，秘密轮换后旧键409，明确不可自动重做；新键须核对结果。
回执只含ID/revision，操作无邮件／队列；审计只含动作、ID、字段名及修订号，不复制联系方式。
三个新表非空任一拒绝down，外键RESTRICT；无回填，无实际.env变化。

## Task 1: 隔离与文档

- [ ] 独立worktree/Node24.22.1/npm ci；新PG15集群55443，仅回环地址。
- [ ] 校验目标host/port/库名/用户及危险环境后才初始化；无demo环境导入。
- [ ] 单元基线及设计格式校验；早建main草稿PR。

## Task 2: 模型、规则、迁移

- [ ] tests/crm.test.ts先RED再实现src/lib/crm.ts严格联合校验。
- [ ] src/cms/crm/collections.ts、配置、根payload-types.ts与新迁移，关闭通用CRUD/GraphQL。
- [ ] 迁移旧虚构库升级指纹、空表往返和三类非空保护。

## Task 3: 服务与权限

- [ ] 真实PG测试先RED：角色／范围／联系人父ID／版本／主联系人唯一／存档／幂等。
- [ ] src/server/crm/service.ts及read.ts，事务权限检查、白名单DTO和同事务审计。
- [ ] 并发幂等、停职／撤权屏障、审计故障回滚、GET全表指纹及旧表不变。

## Task 4: 交付

- [ ] npm run check、CRM集成、客户／报价／业务权限回归和生产build。
- [ ] 一次独立整分支审阅，重要问题一轮修正及验证；progress/交接/中文小结。
- [ ] 提交推送、远端SHA与CI实核、main草稿PR，不合并。
