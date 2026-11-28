# CRM阶段B：客户总览与同团队责任转交

日期：2026-11-28。状态：用户确认B1→B2→B3、首期仅同团队；本文件为待审细化设计，未实施。
基线：A2 PR133已合并，origin/main39f78f1ebc69875d69c6681638970bcf140965ca包含90305f8。
总体已确认决定沿用2026-11-26客户/服务商设计；本文件优先说明B的具体边界。

## 1. 目标、范围与交付顺序

员工在一个客户页了解客户资料、主负责人、当前有权业务及现有跟进日期；主管处理失效负责人，
对客户主负责人及选中的咨询逐项明确转交，避免自动把全部业务转走。
B1只读服务及真实HTTP，B2转交服务及真实HTTP，B3员工界面，三个顺序PR，前一个合并后再从最新main开始。
B1/B2服务先交付可独立验收，B3前A2界面保持原能力；每批早建草稿PR，不叠PR、不自动合并。

包含：个人/企业客户总览、现有主联系人、本人/类型/团队/待分派/进行中业务/今日到期/逾期筛选，
现有咨询/服务单/报价状态投影、最近更新、失效负责人待分派、显式同团队转交。
不含：跨团队迁移/共享、批量全选全库转交、跟进事项新模型或完成动作、客户登录改造、服务商门户、导出、部署。
不生成旧跟进历史；“下一步”只展示现有未关闭咨询的nextFollowUp，独立事项闭环留C。

## 2. 现状与方案选择

A已有四个私有CRM集合、严格DTO、现职范围、客户revision、业务726281→客户726283锁、
事务审计及actor+UUID/HMAC操作回执。A2已接原生会话并在锁后复核。
客户有team/owner；咨询另有team/owner/updatedAt；service-cases无team或owner，沿咨询鉴权。
咨询旧后台仍有受guardBusinessAssignment保护的负责人编辑；员工权限变化会清会话且持业务锁。

用户选择：顺序B1→B2→B3，同团队优先。考虑过整批交付（一次覆盖面过大）、
客户转交自动级联全部业务（违背已确认逐项选择）及跨团队一并迁移（权限变化更大），均不采用。
B延续原技术栈/数据来源，不建立另一份客户或业务负责人表。

## 3. 只读总览与筛选契约（B1）

新增crmOverview(p,user,input)，经真实会话/currentActor及READ ONLY事务、原锁序后读取。
HTTP GET /api/crm由严格查询白名单分派overviewList、overview、assignmentQueue；其余A动作保持。
公共分页默认20、limit1–50、page1–100000，排序createdAt DESC/id DESC；q最多100字，只搜客户编号/名称。
overviewList接受q/status(active|archived)/kind(individual|company)/owner(mine|unassigned)/teamID/
work(active|dueToday|overdue)及page/limit。teamID仅管理员可显式选，其他角色拒绝注入；筛选取交集。
owner=mine按实际actor.id；owner=unassigned只管理员/主管，运营不能用它扩大范围。
所有客户先clientScope，咨询先inquiryScope，再聚合、筛选、计数、分页；隐藏业务不影响结果排序/筛选/计数。
不能先取固定200/1000条后过滤，也不能把所有客户/咨询拉到浏览器。
实现采用参数化SQL的EXISTS/聚合及分页，复用现有范围语义，SQL与Payload权限结果须做一致性反例；
不能通过任意客户端where/SQL/角色参数。读取均手工DTO，不调用通用集合开放权限。

每行：A客户基本DTO、ownerState(valid|unassigned|inactive|ineligible)、安全ownerDisplay、
可见进行中咨询数/进行中服务单数、最早现有跟进时间、可见最近更新时间。
有效负责人沿validOwner（现职operations含additionalRoles且同团队），无效不显示“本人”。
ownerDisplay只含id/name/state，不含邮箱/角色/会话；同团主管/管理员可见旧负责人名，
运营仅其当前有权客户；不因负责人失效给运营新增读权。

咨询进行中=status!=closed；服务单进行中=stage不在completed/cancelled，paused/aftercare仍算。
现有跟进取可见未关闭咨询的非空nextFollowUp最早值。dueToday为北京时间当日[00:00,次日00:00)，
overdue为早于当前时刻；两条件可能同时成立，不人为互斥。内部UTC，响应包含asOf与Asia/Shanghai标签。
日期空/无效不伪造到期；无效数据返回安全异常状态并列管理员排查，不能静默当正常时间。

客户详情overview接受clientID与独立咨询分页，返回基本信息、主联系人、可见咨询页及聚合。
咨询项只含id/reference/name/status/ownerDisplay/nextFollowUp/updatedAt；
派生serviceCase只含id/title/stage/revision及latestQuote的id/revision/status，金额/成本/明细/内部安排均不带。
报价必须属于已授权咨询对应服务单，损坏/跨父关系503，不沿裸latestQuote ID直接泄露。
联系人沿A范围与DTO；主联系人只取active且isPrimary，异常多条503。
最近更新只合并客户建立/当前updatedAt及可见咨询/服务单当前更新时间，最多20项，时间降序、稳定id打破平局；
标为“最近更新”，不是完整历史。不读取跟进正文、原始审计、旧授权或隐藏对象事件，不计隐藏事件剩余数。
B2转交历史只投影本批结构化事件，不能把管理员原始审计公开给其他角色。

## 4. 待分派是动态视图，不改写历史（B1）

assignmentQueue仅管理员/主管，按当前团队范围读active客户及其活动CRM关联的未关闭咨询。
负责人为空、停用、移出团队或失去operations能力即出现；恢复有效后自动退出，不新增守护进程/定时任务。
保留原owner字段，队列不清空旧owner、不迁移/修复旧记录、不撤销关系；存档客户不进入客户待分派。
咨询需有当前可见客户与咨询双范围，隐藏关系不返回占位/数量；无CRM关联的旧咨询仍走原后台，B不接管。
队列支持target=client|inquiry、page/limit，返回各自独立total，不混排后截断。
无有效团队/跨团队旧关联：只在原有权范围提示“需管理员核对”，禁止B2跨团队修复。
咨询已关闭但服务单仍进行中，B标为“状态需核对”，不自动改状态，也不把它当正常待转未完咨询。

## 5. 转交事务与明确单位（B2）

POST /api/crm新增transferAssignments，原同源/16KiB/严格schema/会话/错误缓存保护不变。
输入：clientID、expectedClientRevision、recipientID、reason（trim后10–2000字）、operationKey(UUIDv4)、
transferClient:boolean、inquiries:[{inquiryID,expectedUpdatedAt,expectedOwnerID,expectedCaseRevision:number|null}]。
至少选客户或一条咨询；咨询最多20条、ID唯一、按ID排序规范化；不能传team/force/外部授权字段。
expectedUpdatedAt须为服务端原样ISO，ownerID可null；有服务单须带其revision，无服务单明确null。
超16KiB或20条拒绝整批；用户分批时每批明确提示独立事务，不宣称跨批原子。

只管理员或本团队主管；运营无转交能力（包括本人），不新增“请求转交”持久流程。
所有参与客户/咨询/接收者必须同一个客户team；管理员也不得在B变更team。
接收者必须同团队现职validOwner；不能解除负责人设null；客户必须active。
transferClient只改客户owner；未选择咨询不改咨询。选择咨询必须活动CRM关联、当前双范围且status!=closed，
有已完成/取消服务单则拒绝该咨询转交以保留历史；已关闭咨询+未完服务单先在原流程核对。
“咨询＋其派生服务单”为同一责任单位：服务单无独立owner，因此界面不能提供独立服务单选择。
转咨询会改变该咨询/派生服务单/原报价工作台的内部可见范围，但不改变旧客户外部访问授权。
只转客户时明确提醒：新负责人可能看不到未转咨询；旧咨询负责人仍可按原规则处理咨询，
但不会因此获得客户档案访问权。普通CRM写入始终要求当时客户范围。

锁后原生会话、现职/角色/团队/客户/咨询/关联/接收者全部复读；READ COMMITTED，原726281→726283。
涉及咨询更新走原p.update及原hooks，不skipAudit/skipWorkflow，不创建新发送路径。
沿原hooks仅给新负责人生成owner-changed通知，保留既有发送门禁，不另通知旧负责人；
不承诺真实送达，不迁移旧通知收件人或重发历史消息。
单事务校验全部版本→写选中owner→客户revision只加1（即使只转咨询）→结构化审计→操作回执；任一步失败全回滚。
咨询expectedUpdatedAt+旧owner检测旧后台编辑；serviceCase revision检测预览后派生业务变化。
空变更（全部已是接收者）409，不制造转交历史。未选中业务、服务单/报价内容、关联、外部授权全部不写。

幂等沿actor+operationKey与规范化摘要/epoch；重放先核实当前管理角色、客户/所选咨询范围和活动关联，
关系已撤销或换客户则404；不跳过当前权限。相同键/输入返回原回执，不重复owner更新/审计/工作流。
同键异输入/epoch变化409；已提交后版本变化不阻断仍具当前权限的原回执查询，历史回执不是当前归属证明。
回执含clientID/revision、transferID(审计ID)、transferredClient及inquiryIDs，不含reason/联系方式/他人历史。
即使当前已另行转交，原回执只确认历史成功，界面必须重新读当前状态。

审计只管理员原样读取，before/after记录客户与选中咨询ownerID、原/新版本、操作人/时间/原因；
不复制客户名称/联系信息/报价正文。B3管理角色可读独立安全投影（id/time/actorName/接收人名/目标类别），
仅当前有权客户和咨询，原因仍留管理员原始审计，隐藏目标不返回计数或摘要。
GET assignmentHistory(clientID/page/limit)仅管理员/主管，事件白名单transferAssignments；
仅投影该事件明确转过客户或至少一个目前仍活动关联于该客户且可见的咨询，其他事件在计数/分页前排除。
多目标只投影当前可见目标，不返回原总目标数、原始JSON或已撤销关系的历史客户信息。

## 6. 角色与字段矩阵

| 能力/字段                           | 管理员               | 主管           | 运营           | 内容角色/个人客户/企业联系人/服务商 |
| ----------------------------------- | -------------------- | -------------- | -------------- | ----------------------------------- |
| 客户基本资料/联系人                 | 原全范围             | 原本团队       | 原同团本人     | 拒绝                                |
| 业务状态/报价状态/跟进日期/最近更新 | 先业务权限           | 先本团业务权限 | 先本人业务权限 | 拒绝                                |
| 待分派/有效接收人姓名               | 全范围，B转交仍同团  | 本团队         | 拒绝           | 拒绝                                |
| 专用转交客户/咨询owner              | 同团专用动作         | 同团专用动作   | 拒绝           | 拒绝                                |
| team/联系方式/业务内容随转交修改    | 拒绝，原独立流程不变 | 拒绝           | 拒绝           | 拒绝                                |
| 原始转交原因/审计                   | 原管理员只读         | 不返回原因     | 不返回         | 拒绝                                |
| 成本/金额/内部安排/外部凭证         | 总览DTO不返回        | 总览DTO不返回  | 总览DTO不返回  | 拒绝                                |

现有其他工作台权限不削弱也不扩张。固定角色含additionalRoles沿当前isAdmin/isManager/isOperator，
不同角色叠加时按现有管理员优先规则。HTML/SSR/API/计数/筛选/历史投影均执行同一范围。

## 7. B3界面与错误恢复

扩展/crm-center为总览，保留A建档/联系人/关联操作；B状态和转交组件分文件，避免继续堆大组件。
列表有明确范围和筛选，详情有主负责人、可见业务、跟进日期、“最近更新”及管理角色待分派入口。
转交先选接收人，再选客户/逐条咨询（显示派生服务单及影响范围），默认均不勾选；
显示选中数量、版本、原/新负责人、原因和同团队说明，提交前核对，禁止“一键转走全部”。
B3预览由服务端只读transferPreview返回当前可转项目及上述版本；不返回隐藏业务数量，分页选项最多20条。
复用A2原请求/键冻结、未知只重试、409保留输入、401/403清除资料、离开提醒；转交成功刷新当前可见资料。
字段名称渲染为文本，不用HTML；无数据/读取失败/权限变化分别展示，原稿不写URL/localStorage/日志。
桌面、390宽、键盘/焦点/错误播报验收；“一分钟定位下一步”为真人待验，不用自动测试冒称完成。

## 8. 环境、迁移与验收门禁

独立CRM worktree，Node24.22.1/PG15/55443及锁定依赖；只运行器自建hua_crm_test_<uuid>。
先核对目标及集群真实目录，再加载Payload；schema push关闭、禁.env继承，真实发送/采集/驻留/部署不启用。
原演示3100/55442、备份、五份原草稿不启动/更新/迁移/清理。分支隔离不等于数据库隔离。
B1预计只增加查询索引（客户team/owner/status及咨询team/owner/status/nextFollowUp），以EXPLAIN与已有索引核对，
无重复索引；迁移仅加明确命名索引、down仅删本批索引，不回填owner、不修旧身份；旧表全字段指纹不变。
B2沿现有text action/JSON receipt/audit无需新表；如实施发现需新结构，先更新设计及迁移计划，不能schema push替代。
验收编号：B01双范围聚合/隐藏不变量；B02筛选分页/UTC边界；B03失效负责人动态队列；
B04角色/字段/父子关系；B05同团队逐项原子转交；B06锁等待撤权/停职/竞争；
B07回执丢失/重放/关联变更；B08审计/工作流失败回滚；B09迁移与旧授权指纹；B10真实HTTP/浏览器。
每批npm run check及相关CRM/customer/business/权限回归、生产build，实际结果更新progress，
唯一末尾独立复核、中文小结、提交推送/fetch核对与精确CI，保持草稿由用户合并。

## 9. 本轮状态与实施者决定

当前仅设计。B1/B2/B3详细计划一并供审，用户确认前不实施；历史920项不是B验收证据。
实施者选择：动态队列不改owner；咨询是最小业务转交单位；20条上限；不自动转历史通知；
最近更新不伪装完整时间线；B只覆盖已有CRM关联的业务；失效旧数据走原管理核对。

独立可实施性检查一次：仅指出通知收件人措辞歧义；依据现有inquiryWorkflowHook明确为
新负责人通知，不加旧负责人通知。其他关键约束无需新增用户决定，无业务代码或环境操作。
