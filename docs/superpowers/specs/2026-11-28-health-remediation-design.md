# 全程序体检整改短设计

用户已认可并授权实施：Next.js安全补丁、路由检查修正、重要模块CI补齐；阶段C后续再做。
基线：PR137合并20a90191c1e2daf8b54db69cde5a8f591947eb64，独立CRM worktree/分支codex/health-remediation。

## 方案与决定

采用最小补丁＋复用现有隔离测试运行器；大版本框架/数据库重构会扩大兼容面，本轮不采用。
Next精确锁定16.4.5（官方修复版本，当前@payloadcms/next3.92.0 peer允许>=16.3.3 <17）。
不升级Payload/React或无关工具链，不使用audit fix --force；对比完整锁文件的实际变化与残余公告。

路由检查复用APP_URL，默认127.0.0.1:3000保持旧用法；只允许显式端口的HTTP回环origin，
按URL解析结果拒绝凭据/路径/查询/fragment；空?/#与规范化/path/..属于已登记轻微项。sitemap仍严格同源，精确允许语言中立/llms.txt，
其余必须属于启用语言；发布URL和sitemap本身不跟随重定向，其他页面每跳先复核同源/启用语言；不放行未知中立路径、停用语言、外站、账号密码、query/fragment。
集成进入CRM实际HTTP夹具，使用3201而不是临时替换脚本内容。

新增test:modules，复用scripts/test-crm.mjs的集群/用户/随机库守卫；每次全新虚构库，
迁移后创建专用虚构管理员，不输出或写入本地凭据文件。关闭schema push、真实邮件、AI与材料收集。
串行跑内容权限、目录、机构、生活、家政、内容agent、客服agent/voice/calls/operations/retention、客户工作流12套；
政策列表渲染加入unit job。CI原CRM job继续原test:crm，再运行新test:modules，各用自有随机库。
这是实施者在已批准范围内选定的具体落地；不改原全站串行集成/订阅/展会测试。

## 边界与验收

不修改任何客户/业务权限、旧客户对外授权、审核、写锁、持久恢复、发送门禁；不改schema，不部署、不自动合并。
独立PG15/55443、测试3201；原演示3100/55442、归档、图片及账号不操作。
路由失败/放行边界单测RED→GREEN；真实生产build/HTTP验证原脚本运行、有效和停用语言、404/根跳转。
check、全部render、完整test:crm、新test:modules、npm审计；唯一独立最终复核后处理重要项，再交接/推送/草稿PR。
残余上游依赖公告、真人/真实网关/原归档恢复不冒称解决；准确记录最终SHA/CI状态。

复核补充：模块回归覆盖数据库/服务层及原模块内部断言；permissions-content/lifestyle/housekeeping中
由AUTHZ_HTTP_URL控制的可选HTTP分支本轮未开启，不冒称这些HTTP断言已通过。
