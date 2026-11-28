# 全程序体检整改实施计划

**Goal:** 关闭已确认的Next公告命中、路由检查误报和关键模块CI缺口。
**Architecture:** 最小框架补丁，现有CLI提取校验边界，复用CRM隔离运行器。
**Tech Stack:** Node24.22.1、Next16.4.5、Payload3.92.0、PostgreSQL15。
**Spec:** docs/superpowers/specs/2026-11-28-health-remediation-design.md。

## Global Constraints

- 最新origin/main20a9019；codex/health-remediation；独立CRM环境，保留所有已有私有资料。
- 无权限/旧授权/schema/真实发送/部署变更；无阶段C；不强推/reset/clean/自动合并。
- 锁定依赖npm ci；源码Prettier100/max200，原始报告仅.local/health-remediation。
- 按用户明确实施授权由本会话直接执行；一次独立末尾复核，重要项单轮RED→GREEN。

## Review Focus

1. Next补丁后Payload后台/API/客户确认兼容（任务1/3完整build/HTTP/业务回归）。
2. 允许llms不能扩大为任意无语言路径/外站/停用语言（任务2真实校验函数单测及实际HTTP）。
3. APP_URL带凭据/路径/fragment或非回环不能误测其他环境（任务2拒绝边界）。
4. 模块测试bootstrap不能覆盖私有账号或复用旧库（任务3新库守卫/专用管理员/实际清理）。
5. 12套必选数据库/服务层入口不得遗漏失败退出码或因权限/故障而跳过（任务3串行exec抛错与实际CI）。

## Task 1：最小安全补丁

**Files:** package.json、package-lock.json、docs/trial-deployment.md。
**Interfaces:** next16.4.5满足当前Payload peer；不改变应用接口。

- [x] 已有928项基线通过；官方公告/peer核实；只安装精确Next16.4.5，核对锁差异。
- [x] npm ci，npm audit全树/生产树，实际版本与剩余公告留档；最终完整build/HTTP见任务3。

## Task 2：修正可重用路由检查

**Files:** scripts/check-routes.mjs、scripts/lib/route-checks.mjs、tests/route-checks.test.ts。
**Interfaces:** routeCheckOrigin(raw:string):string；sitemapCheckURL(raw:string,origin:string,activeLocales:readonly string[]):URL；
fetchRouteDocument(raw:string|URL,origin:string,activeLocales:readonly string[],followRedirects=true):Promise<Response>。

- [x] RED：精确/llms.txt和有效/en/about放行；外域、停用语言、/llms.txt/extra、凭据/query/hash拒绝；origin只HTTP回环。
- [x] 实现校验并让原脚本用APP_URL；保留119语言页、sitemap、404和root断言。
- [x] 真实CRM HTTP夹具执行原脚本；不依赖模拟fetch或源文本contains断言。

## Task 3：隔离重要模块持续回归与交付

**Files:** scripts/test-crm.mjs、package.json、tests/helpers/isolated-module-bootstrap.ts、
tests/integration/crm-http.ts、.github/workflows/ci.yml；交接与一页中文小结。
**Interfaces:** npm run test:modules→test-crm.mjs modules；bootstrap只接受HUA_CRM_ISOLATED=true和合法随机库。

- [x] 新mode保持原守卫，新库迁移→专用虚构管理员→12套串行；每套非零中止并finally仅清自有库。
- [x] CI原CRM job新增modules步骤、unit job补政策列表render；不扩大产品开关或环境凭据。
- [x] check、25render、完整test:crm（含原路由CLI真实HTTP）、test:modules、审计结果全部核实。
- [ ] 唯一全分支独立复核与修复、中文交接已完成；草稿PR及最终fetch回执待补。
- [x] 自有随机库0，专用PG正常停止保留，原演示不操作；对应最终SHA的CI准确报告，不自动合并。

## 唯一末尾复核与修正

独立gpt-6.2-astra复核0严重/1重要/1轻微。重要项：默认fetch跟随重定向可能访问未经允许的目标，
实际CLI＋双回环HTTP服务器反例先RED（重定向发布URL仍退出0），再逐跳校验/发布URL禁跳转后GREEN，
并补合法同源规范化、停用语言尾斜杠404边界。只有此一次独立复核，修正以测试证明，不二次派审。
轻微项延期：URL解析器会规范化空?/#和origin /path/..，不会访问额外目的地；严格原始字符串拼写留后续。
范围决定：本批模块CI执行数据库/服务层；三套AUTHZ_HTTP_URL可选HTTP分支仍未开启，不能声称覆盖；
代价是对应HTTP专属缺陷仍需后续独立测试。原CRM/API/旧授权完整HTTP回归保持。
