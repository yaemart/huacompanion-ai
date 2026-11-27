# 阶段A：客户档案与业务关联实施设计

日期：2026-11-26。状态：2026-11-28 A1a获准实施；A1b与A2须前一PR合并后续批。
依据：`2026-11-26-customer-provider-platform-design.md`第十一至十三节。
仅新增本文与对应计划，不改现有展会文件、交接、分支或代码；实施另从最新origin/main建立任务分支。

## 1. 本阶段结果与边界

员工可以创建个人／企业档案、登记多个联系人、将有权咨询关联到档案、查看已关联咨询及其唯一服务单，
并纠正误关联。客户登录、对外门户、跟进事项、批量归档、客户合并和负责人转交均不在A实现。
客户主负责人作为必要字段先落库；运营只能创建本人负责档案，转交留B。团队不由普通表单自由改写。
企业多联系人是内部业务关系，不自动成为企业登录成员。

现有依据：`src/cms/access.ts`固定角色与inquiryScope；`src/cms/collections.ts`咨询团队／负责人；
`src/cms/business/collections.ts`service-cases.inquiry唯一；`src/server/customer/service.ts`
customerTransaction依次锁726281、726283并提供关联／撤销服务。
本文为目标契约，尚无对应新集合、API、迁移或测试。

## 2. 方案与数据结构

采用专用私有CRM集合及员工服务接口，不直接开放集合CRUD，不给咨询原表批量填客户字段。
客户关联以咨询为唯一业务锚点；服务单通过service-cases.inquiry派生，绝不另存第二套客户归属。
另一方案分别关联咨询与服务单易冲突；全局按邮箱自动建档无法证明身份，均不采用。

新增四集合（均关闭通用REST／GraphQL、默认拒绝Local API access；可信服务在验权后内部操作）：

| 集合              | 固定字段与约束                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| crm-clients       | reference唯一；kind=individual/company；displayName；language；countryCode可空；team；owner可空；status=active/archived；revision正整数 |
| crm-contacts      | client必填；name；email可空；phone可空；jobTitle可空；isPrimary；status=active/archived；revision                                       |
| crm-inquiry-links | client；inquiry唯一；active；revision；linkedBy/At；reason；revokedBy/At/Reason；lastOperationKey                                       |
| crm-operations    | actor；operationKey；action；inputDigest；result最小回执；createdAt；actor＋operationKey唯一                                            |

联系人是客户关系内的业务联系人，不建跨客户可编辑共享记录；同一个人代表两个企业时各自保留关系资料。
既有customer-accounts是认证身份，A不新增联系人到账户的自动关系；D再按证据关联。
reference由服务器生成不可预测稳定编号（CLI-加UUID），不包含邮箱、国家或连续客户量。
姓名1–200字符；职务0–100；电话0–100；原因10–2000；email用现有规范化函数；
countryCode为空或两个大写ASCII字母，不宣称完成地理校验；language仅en/zh。所有字符串先trim。
联系人至少email或phone之一非空；主联系人同一客户最多一名，由事务及部分唯一索引保护。
企业可多联系人；个人也可登记经核对的代办联系人，联系人关系不作身份核验结论。
姓名、邮箱、电话均不全局唯一；不因重复拒绝建档，不返回跨范围重复命中。

每个咨询最多一个活动客户关联。保留同一link行与审计历史：已撤销后重新关联仍需完整证据，
revision递增，linkedBy/At更新、原撤销元数据保留在审计；不同客户间换绑必须先撤销再明确关联。
不删除咨询、报价、服务单或旧提交人资料。历史联系人原文始终留在咨询中。
客户有活动关联时禁止存档；已存档客户只读，不可更新、新增／修改联系人或关联业务，A无恢复动作。
联系人存档同时清除isPrimary；不可编辑或再次设主，A无恢复动作；不自动挑选另一联系人。
crm-operations只保存ID与revision等回执，不保存原始联系方式、证据正文或令牌；摘要使用服务器HMAC，
复用项目现有秘密配置但独立命名空间，不增加实际.env值。不可将摘要当匿名化或向客户端返回。
幂等键UUID；同员工同键同内容返回原回执，同键异内容409；回放也须重新检查当前权限。

## 3. 员工角色、记录范围与字段动作

管理员可管理全部；主管限本人团队；运营仅本人负责且同团队；editor/reviewer无CRM权。
additionalRoles沿用现有固定业务角色组合，内容角色不增加业务权。匿名、个人客户、企业联系人、
服务商在A所有CRM员工入口均拒绝，既有客户入口行为保持。

创建：主管只能本团队并选本团队现职且具operations能力的员工为owner；管理员可选团队及合法owner；
运营team取当前员工team、owner固定本人。无团队员工不能创建；管理员可创建owner为空的待分派档案。
owner为空仅管理员或同团队主管可见。A不提供改team／owner动作，B交接实现前不得经普通更新修改。
关联要求同时有客户及咨询写权，且咨询team与客户team一致；管理员也不得绕过同团队一致性。
运营如只负责客户而不负责咨询仍拒绝。转交咨询后关联不自动扩权，显示时按当前咨询权限过滤。

| 字段组                                | 查看               | 创建                     | 更新                         | 导出    |
| ------------------------------------- | ------------------ | ------------------------ | ---------------------------- | ------- |
| reference/id/时间/revision            | 有范围员工         | 仅服务器                 | 仅服务器                     | A无导出 |
| kind/displayName/language/countryCode | 有范围员工         | 有范围员工               | 有范围员工，kind建档后不可改 | A无导出 |
| team/owner                            | 有范围员工         | 按上述创建规则由服务解析 | A禁止                        | A无导出 |
| 联系人name/email/phone/jobTitle       | 有范围员工         | 有范围员工               | 有范围员工，客户关系内更新   | A无导出 |
| isPrimary/status                      | 有范围员工         | 按专用服务               | 专用主联系人／存档动作       | A无导出 |
| 关联及证据／撤销元数据                | 范围内最小业务投影 | 关联专用动作             | 撤销／重关联专用动作         | A无导出 |
| 成本／内部审核／会话／凭据            | A接口均不返回      | 禁止                     | 禁止                         | 禁止    |

A不修改既有导出功能；新CRM数据没有批量导出入口。B如增加导出，须遵守总体字段矩阵。
未知字段、owner/team伪造、嵌套注入均400且整次不写；缺登录401、无角色403、
无记录权限与不存在均统一404、版本／幂等冲突409；不返回隐藏目标的名称、数量或差异提示。

## 4. 明确服务与API契约

新模块`src/lib/crm.ts`定义输入／DTO，`src/server/crm/access.ts`负责现职与范围，
`src/server/crm/service.ts`负责事务动作，`src/server/crm/read.ts`负责白名单读取，
`src/cms/crm/collections.ts`注册私有集合。返回DTO手工白名单，不展开Payload关系对象。
服务签名统一crmRead(p, actor, input): Promise<CrmReadResult>与
crmAction(p, actor, input): Promise<CrmActionResult>；actor只取员工服务端会话，不能从JSON传入。
ID为正安全整数；operationKey为UUID；expectedRevision为正整数，创建除外。

GET /api/crm：action=list|get|contacts|linkedInquiries|inquiryCandidates；
list参数q最多100字符、page正整数、limit默认20上限50，固定createdAt降序＋id稳定分页。
q只搜索授权客户reference/displayName，不支持任意字段、排序或复杂where；候选咨询只按授权范围查。
候选不返回邮箱或内部备注，只返回id/reference/name及已获授权的状态；未授权命中不计数。
POST /api/crm：严格按action区分字段，不使用任意PATCH：

| action            | 必需输入（另含operationKey）                                                       | 输出                              |
| ----------------- | ---------------------------------------------------------------------------------- | --------------------------------- |
| createClient      | kind/displayName/language，countryCode可选，管理员／主管可提交允许的teamID/ownerID | clientID/reference/revision       |
| updateClient      | clientID/expectedRevision，明确允许的displayName/language/countryCode              | clientID/revision                 |
| saveContact       | clientID/expectedClientRevision，创建资料；更新另带contactID/expectedRevision      | contactID/revision/clientRevision |
| setPrimaryContact | clientID/contactID/expectedClientRevision                                          | clientRevision                    |
| archiveContact    | clientID/contactID/expectedRevision/expectedClientRevision/reason                  | revision/clientRevision           |
| archiveClient     | clientID/expectedRevision/reason，无活动关联                                       | clientID/revision                 |
| linkInquiry       | clientID/inquiryID/expectedClientRevision/expectedLinkRevision（首次为0）/reason   | linkID/revision/clientRevision    |
| revokeInquiryLink | linkID/expectedRevision/expectedClientRevision/reason/无其他布尔参数               | linkID/revision/clientRevision    |

saveContact不会修改isPrimary或status；主联系人与存档均独立动作。contact归属由服务核对，
禁止借clientID参数把别的客户联系人读出或改写。所有子项变更递增clientRevision。
link输入reason是员工核对业务归属的证据，不等同登录身份／企业代表权证明。
createClient的teamID/ownerID按角色白名单：运营不得提交；管理员teamID必需、ownerID可空；
主管teamID不接收、ownerID必需；未提countryCode为空。createClient仅countryCode可选，无其他隐式资料字段；saveContact资料仅name/email/phone/jobTitle，
其中name必需，email/phone至少一项。updateClient至少提供一个允许字段，未提供保留、可空字段显式null清空。

GET参数及投影固定如下，所有列表同用page/limit；无任意排序、include、depth或复杂where：

- list：q可选、status可选active/archived（默认active）；返回items和授权过滤后的total/page/limit。
  items只含id/reference/kind/displayName/language/countryCode/teamID/ownerID/status/revision/createdAt。
- get：clientID必需；返回同list单项，不自动展开联系人、业务或统计。
- contacts：clientID必需，status可选默认active；items仅id/clientID/name/email/phone/jobTitle/isPrimary/status/revision。
- linkedInquiries：clientID必需，只列当前活动且有权咨询；items仅linkID/linkRevision/clientRevision、
  inquiryID/reference/name/status，以及有权服务单caseID/title/stage可空；证据理由和历史不随列表返回。
- inquiryCandidates：clientID必需、q可选仅查咨询reference/name；限制当前客户同团队且员工有权咨询，
  排除已有其他活动客户的咨询；返回inquiryID/reference/name/status/expectedLinkRevision（未有行0）。
  已撤销link只提供重关联需要的revision，不泄露原客户、原因或历史；不返回跨范围的占用详情。
  所有GET clientID都先验客户权；候选、关联查询亦验当前咨询权。服务单投影遵循原业务访问判断。
  GET不写审计、幂等表或业务数据；POST检查现有员工认证、同源、请求体限制16KiB，响应no-store。
  内部可信服务使用事务req且深度0；Local API overrideAccess并不构成授权，必须先走服务守卫。
  通用集合读写、versions、REST／GraphQL、直接客户端上传均关闭。

## 5. 锁、撤销兼容与事务

复用现有customerTransaction：业务锁726281→客户锁726283；不新建相反锁序或嵌套事务。
员工／团队／咨询权限变更的相关路径必须审计是否共享业务锁；不共享者在A补最小锁接入与并发测试，
不能仅凭锁后读取就声称能防住提交前并发撤权。新CRM集合也仅在此守卫内写。
锁后先重读员工与当前记录权限，再检查幂等同键同内容回放；只有首次操作才校验状态与revision，
随后写数据、审计及回执同事务提交。成功后旧revision重试仍返回原回执，不能先被版本冲突挡住。
createClient回放也检查已创建客户的当前权限；关联／撤销回放须同时检查当前客户与咨询权限。

A不创建、修改或撤销任何customer-inquiry-links。新CRM关联不改变外部访问范围。
撤销关联时，若咨询存在活动旧外部授权，一律409且整次不写，提示先由有权员工核对访问授权；
不返回其他身份的邮箱、旧授权证据或原客户资料。A不提供全部收回按钮，不假定旧授权依赖CRM关联。
已有独立授权须保留；在既有授权管理流程明确撤销后，可回到CRM重新执行撤销。
D再实现授权来源依赖模型与同事务选择性回收，不能在A用“全部收回”替代来源核验。
检查旧授权必须持现有业务→客户锁，防止检查后并发新增授权；有权员工同时具备旧流程权限才可在原入口处理。
不提取或改写原revokeCustomerInquiry，不新增嵌套事务，不修改已开始报价操作的原锁语义。
关联或撤销不发邮件、不触发CRM通知、不启动worker、不更新跟进、成交、报价或服务单状态。

## 6. 迁移与本地升级

新增四表、外键、唯一与索引：客户reference；team/owner/status；联系人client/status；
活动主联系人部分唯一；link.inquiry唯一；link.client/active；operations.actor/operationKey唯一。
外键RESTRICT，不使用CASCADE；各ID类型按Payload当前迁移生成结果，不手写猜测。
迁移名执行时使用实际时间，不能占用展会迁移时间；注册src/migrations/index.ts并生成payload-types.ts。
无自动客户回填、邮箱合并或外部授权迁移；迁移后新表全空，旧咨询均显示未归档。
新增表有任意业务／操作记录时down明确拒绝，不能以删除幂等记录后回退清空真实客户数据。
空新表down/up验证保留全部原表指纹；不对原演示库执行down或reset。

执行顺序：记录代码SHA与迁移清单→停本站Web／worker→数据库与图片配套备份→
仅构造虚构历史数据的随机隔离库→基线指纹→禁schema push执行up→核对新表与旧表指纹→构建／只读冒烟→
本批不应用原库、不启动演示；将来升级另行授权。失败先停进程，选择修复前进或恢复备份及匹配代码，
不能只降代码继续运行新库。每台电脑独立环境，无新依赖或产品环境变量的默认要求。

## 7. 具体验收测试

| 编号 | 必须断言                                                                                          | 总体映射 |
| ---- | ------------------------------------------------------------------------------------------------- | -------- |
| A01  | 管理员／同团队主管／本人运营正例；他人／跨团队／纯编辑／外部／停用反例                            | P01–P03  |
| A02  | 员工角色与owner/team请求伪造、ID小数／负数／超安全整数、未知字段／嵌套字段400且无写入             | P04/P08  |
| A03  | 个人／企业多联系人正常；同邮箱不同客户不合并；改企业A联系人不改B                                  | P05      |
| A04  | DTO与SSR无成本／审核／凭据；通用REST/GraphQL/Local API CRUD与versions均拒绝                       | P07      |
| A05  | list/q/candidates总数仅授权数据；隐藏目标与不存在同404；GET全表指纹不变                           | P06/P09  |
| A06  | 咨询唯一link；重复请求一次审计，异内容同键409；回放失权404；并发抢关联一胜一冲突                  | P04/P23  |
| A07  | 服务单随原咨询派生；无另存归属；关联不改变原咨询／报价／服务单／旧授权指纹                        | P13      |
| A08  | 旧授权存在默认撤销409无副作用；旧授权完全保持；无旧授权可撤销，审计失败全回滚                     | P13/P23  |
| A09  | 真实PG事务屏障：转交／停职／撤权与建档、联系人更新、link/revoke竞争，锁后拒绝                     | P14      |
| A10  | 主联系人唯一、父ID替换拒绝、版本冲突不覆盖、活跃关联阻止客户存档                                  | P04/P08  |
| A11  | 迁移空库up、旧库克隆up指纹、空表down/up、四类非空down拒绝且无改动                                 | 数据迁移 |
| A12  | 既有客户登录／报价确认／咨询权限／员工范围回归；A不改变旧会话原业务权限；原流程撤销后会话拒绝回归 | P01/P13  |
| A13  | 真实Next GET/POST同源／16KiB／会话校验；无缓存泄露、恶意表单不扩权                                | P07/P08  |
| A14  | 桌面／390宽键盘建档、联系人、关联与撤销；断线重试保留输入，不冒称成功                             | UI验收   |

测试夹具独立随机库：两团队、两运营、主管、管理员、纯编辑／审核及兼岗员工；
两个人客户、两企业同名联系人、两咨询及其服务单、既有验证账户与旧授权，停用／转交场景。
任何拒绝写检查四新表、旧授权、审计及任务队列的前后指纹；不能只断言状态码。
业务证据及联系方式仅在虚构夹具使用，不读真实客户库；日志不得打印完整证据／认证资料。

## 8. 交付门禁与待审阅

建议A1数据／服务／迁移、A2员工最小界面与真实HTTP两个顺序PR，前者合并后才从main开后者。
A1不开放导航，服务已有完整权限测试；A2不是完整B总览，仅列表、资料与关联面板。
本文需审阅确认的实施选择：四私有集合、咨询唯一锚点、关系内联系人、
有旧授权时阻断CRM撤销并保留独立授权、A1/A2两批。客户档案跨团队共享与独立授权来源辨认后置。
阶段完成必须check及相关串行集成通过，中文小结／progress记录实际结果、推送SHA与精确CI；
无业务代码时不运行应用测试，不把本文测试表当通过证据。当前展会任务排期不因本文改变。

## 2026-11-28执行范围修订（优先于原阶段描述）

用户批准A1a→A1b→A2顺序。以2026-11-28-crm-phase-a1a.md为本次实施范围；
A1a不建关联表、不实现咨询关联或HTTP/UI，不操作原演示集群。
负责人沿用validOwner：同团队现职且具operations能力。旧外部授权全程不改。
