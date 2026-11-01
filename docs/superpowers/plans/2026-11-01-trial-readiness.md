# Trial Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, or superpowers:subagent-driven-development for independent file scopes after the formatting baseline. Do not run database integration tests concurrently.

**Goal:** 收敛试运行范围并完成用户指定的五项准备任务。

**Architecture:** 延续 Next.js/Payload/PostgreSQL 和现有工作台、权限、worker；增加后台统计/导出，收紧环境默认值，并以容器隔离验证部署配置。

**Tech Stack:** TypeScript、Payload 生成类型、Prettier、ESLint、Node 24、PostgreSQL 15、Docker Compose。

**Spec:** `docs/superpowers/specs/2026-11-01-trial-readiness-design.md`

## Global Constraints

- 功能冻结，仅做任务说明中明确列出的内容；不删除扩展能力、不接入新外部服务。
- 不改变业务和权限边界；相关行为改变必须有拒绝/允许和信息隔离测试。
- 每次提交前 npm run check 通过；格式化独立提交；结果写 docs/progress.md。
- 不购买、不正式发布；真实邮件和试运行环境验收等待用户账户及指定收件人。

## Review Focus

- 非管理员、跨团队、撤销分配后，统计和导出不得泄露记录或内部字段。
- 导出筛选/CSV 注入/审计与实际条数一致，漏斗和响应指标不伪造历史。
- 未配置受信网关时不信任可伪造 IP；代理必须移除重写头，客户端与全局配额分别有效。
- SITE_LOCALES/noindex/高级功能关闭在服务端和构建配置中一致。
- Docker 三进程共享媒体和正确 DB，恢复媒体与 DB 配套，绝不覆盖现有本地卷。

### Task 1: 可维护性基线（首先完成）

- [x] 配置 Prettier/ESLint/check/每 push 与 PR CI，check 通过后提交工具配置。
- [x] 全仓格式化，比较语法/文案并运行 check、全部测试；单独提交“仅格式化”。
- [x] 依用户顺序清理优先服务和 CMS 权限 any，每文件相关集成测试。
- [x] 结构化 copy 数据且验证输出完全一致；清理其余 >200 字符源码行或列明文案例外。
- [x] progress 记录行长、any 剩余清单与测试，check 通过后提交。

### Task 2: 第一版缺口

- [x] 基于现有 staff scope 提供后台经营概览，补授权范围/指标行为测试。
- [x] 增加筛选 CSV 导出、BOM、注入防护、敏感字段限制和审计，补越权/泄露测试。
- [x] 增加分享图、robots/hreflang/noindex 配置与测试，不改变发布快照隔离。
- [x] check 和集成测试，记录 progress，提交任务 2。

### Task 3: 安全稳定

- [x] 为限流写客户端、受信头、全局上限、honeypot 用例后实施；补迁移与网关说明。
- [x] 非破坏性审计修复并移除 node 包，更新脚本对包路径的依赖，记录剩余漏洞范围。
- [x] 评估会话锁测试覆盖并决定保留/改进，记录容量和关键词检索局限。
- [x] check、权限/并发/迁移测试和 progress，提交任务 3。

### Task 4: 试运行清单和配置

- [ ] inventory 根据证据区分已验证/未验证/未实现，列外部依赖与开关。
- [ ] SITE_LOCALES 中英默认、切换器/sitemap/服务端路由一致，高级能力保持关闭。
- [ ] 默认值与语言配置测试、check、progress，提交任务 4。

### Task 5: 部署准备

- [ ] 核验官方托管能力/价格，给出推荐和备选，不购买。
- [ ] Dockerfile/compose、媒体卷、三进程与独立 PG，实际启动并冒烟及配套备份恢复。
- [ ] 账户清单与待用户信息，真实邮件/试运行验证列待执行；更新 README 三份清单。
- [ ] check、compose 冒烟、progress，提交任务 5；推送并核对 CI，交接仍待账户的项目。
