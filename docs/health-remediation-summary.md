# 体检整改一页小结

2026-11-28；基线PR137合并20a9019，分支codex/health-remediation；阶段C不在本批。
[草稿PR138](https://github.com/yaemart/huacompanion-ai/pull/138)，不自动合并。

Next.js精确升级16.4.5；当前Payload3.92.0 peer兼容，锁文件仅Next/SWC/@next/env版本变化。
Node24.22.1下npm ci完成；原7份Next根公告已不再命中。审计仍有全树14、生产树5个moderate节点，
根源为esbuild迁移工具链与minimatch开发工具链；0high/critical。没有跨大版本强制修复或隐藏告警。

原路由检查器不再把sitemap的/llms.txt误判为停用语言；APP_URL可指向独立3201，保持旧3000默认。
限制回环HTTP origin、同源sitemap及有效语言；发布URL/sitemap不跟随跳转，其余每跳先验证目标。
增加真实CLI＋双HTTP夹具，验证合法中立/同源跳转、拒绝外部/停用语言跳转及无外部访问。
该原CLI进入CRM生产HTTP回归，不再临时改脚本端口才能测。

新增npm run test:modules：沿CRM集群身份/随机库守卫，全新虚构库迁移与专用管理员后，
串行跑内容权限、目录、机构、生活、家政、内容agent、客服agent/语音/通话/运营/保留、客户通知12套。
政策列表渲染纳入unit job；原CRM job随后运行新modules（另一随机库），原全站/订阅测试不裁减。
模块覆盖数据库/服务层；三套AUTHZ_HTTP_URL控制的可选HTTP断言未开启，后续仍需补测。

最终check933/933、lint0/445既有警告、960源码行长无例外，25套渲染通过；
完整test:crm退出0，含原47组、JWT/业务/客户/权限8项、Next16.4.5生产build、实际HTTP与原路由CLI154项；
随后串行test:modules退出0，12套通过。最终云端CI以对应提交实核回执为准，不冒称已通过。
独立复核0严重/1重要/1轻微；跳转重要项真实RED→GREEN修正，无二次复核。
延期轻微项：URL解析器规范化空?/#及origin/path/..；当前不访问额外目的地，原始拼写严格校验后续处理。

不修改客户/业务权限、旧客户对外授权、审核、写锁/恢复/真实发送门禁；无schema迁移/产品环境变量/.env。
仅独立CRM PG55443与3201虚构测试，原演示/私有归档不操作。截图和原始日志仅.local/health-remediation，未上传。
自有随机库0、独立CRM集群正常停止/目录保留、四端口无监听。
完成交接、提交推送与草稿PR后仍由用户决定合并；真实网关/原归档恢复、剩余依赖公告不冒称解决。
