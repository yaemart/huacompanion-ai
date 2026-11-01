# 入境政策 1.1a：数据契约与类型基础

依据 docs/traffic-entry-task.md 和 docs/traffic-entry-phase1-plan.md。用户于2026-11-01确认停止点A：Render，Cloudflare Web Analytics加站内每日业务汇总；当下仅本地开发测试。不得开通服务、购买、部署或接统计代码。

## 范围与决定

本PR只交付1.1a：政策发布数据校验/公开白名单契约、将触及的内容服务类型清理及架构文档；不建集合、不迁移、不提供查询工具。后续1.1b单独PR。

当前main尚未合入前置PR；为满足用户先本地开发的选择，继续已验证PR #4基础，在独立分支/草稿PR先行，合并须按依赖顺序并重验。不自动合并。

### Task 1: 发布数据与公开输出契约

Files: src/lib/immigration-policy.ts; tests/immigration-policy.test.ts; docs/immigration-policies.md。

先写测试再实现：合法数据、非法日历日期/区间/未来核实日期、字段类型/国籍编码形状/停留天数/来源URL/核实人、过境区域必填、白名单排除内部备注和核实人、数组隔离。Expected: RED契约缺失，GREEN全部契约测试与npm test通过。

只验证发布完整数据；草稿允许不完整由后续集合处理；不提供政策事实，不判断真实法律适用性。countryCode检查两位大写格式，ISO实际分配及来源权威性由审核核实，不伪称联网核验。

### Task 2: 内容服务去any及回归

Files: src/server/content/service.ts; eslint.config.mjs。

用PayloadRequest、ContentDraft/ContentPublished及unknown输入字段替换显式any，不变更角色/权限/事务锁/修订规则/公开字段。原内容/板块权限/目录/展会/机构/生活/家政/复核集成逐项运行；与基线比较。

Expected: npm run check通过，内容服务无any，相关集成全部通过。源码改动含新契约尽量小于400行，超出先拆。不变更UI，截图不适用。

### Task 3: 记录、审查与交接

更新docs/progress.md和handoff/feature-inventory，记录A已通过但只本地、实际命令和未完成项。独立只读复核、完整check后提交/推送独立草稿PR，核对远程head；不合并不部署。

Expected: 工作区干净、远程提交一致，明确CI真实状态。下步1.1b政策集合，不冒称免签工具已可使用。
