# 群发 B4b：手动冻结入口与人数汇总

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 先观察失败测试，最后一次只读复核。

**Goal:** 获授权主管在本人草稿页面手动保存本地名单快照，只见时间和人数，状态明确为暂存未发送。

**Architecture:** 重用 PR87 冻结服务及 PR86 模拟确认。抽出相同的当前收件资格函数，预估与冻结都用现有 customerEmail 规则识别每个邮箱的最新同意。新增本人历史快照的只读汇总及同源 freeze-local 操作；不接 worker、配额或真实邮件。

**Tech Stack:** Node 24.22.1、Next.js 安装版、React、Payload、PostgreSQL15，沿用依赖。

**Spec:** 已批准 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第6–8节；PR87 合并 `eb042befa53a77170919319f38f9fceb330c63eb`；前批小结明确下一批手动冻结及汇总。

## Global Constraints

- 用户已批准 B 和默认口径，本批按既有顺序推进；只在本地模拟。真实邮件、AI、语音、通话和正式评分保持关闭。
- 沿用管理员显式授权、主管本人活动、当前身份/授权/版本/来源/配置校验；未保存、未测试或未逐语言确认不得冻结。
- 冻结人数按当前资格确定，最多1,000；重复不补新人，改版续发暂不支持，旧快照保留。历史快照不能冒充当前草稿成果或发送资格。
- 主管只读快照编号、版本、冻结时间及中英文人数；不返回名单/任务/邮箱/内部配置。当前预估与历史冻结时间分开标注，统计变化不改写历史。
- 预估与冻结共用同一最新同意/隐私/规范化规则；缺语言仍计排除，不改用其他语言。保留既有同主题全量读取的规模限制，不擅自换数据库规范化规则。
- 无新迁移、环境变量、依赖或原演示种子。只在随机临时库、3186副本验证，保留原3100/55442和图片。
- 业务改动控制在400行内；截图和原始报告只在本机忽略归档，未上传如实说明。

## Review Focus

来源或确认失效后绕过按钮；跨主管读历史快照；新草稿错误显示旧冻结已完成；请求中编辑丢失或报错清空选择；历史邮箱空白/大小写重复导致预估和冻结不一致。两项任务各加真实测试。

### Task 1: 统一资格计算

**Files:** 新 `src/server/subscription-campaign-audience.ts`，修改 preview/freezing 服务及既有 freeze 集成。

**Interfaces:** `campaignAudience(payload,req)` 返回仅供服务器使用的当前合资格、每规范化邮箱一份记录，locale保留以便缺语言排除；预估和冻结消费同一函数。

- [x] 先在既有冻结夹具断言预估 `{zh:1,en:1,excluded:1}`，运行订阅集成观察重复/退订记录导致的实际 RED。
- [x] 抽出 PR87 最新同意逻辑；共享函数仍按JS trim/lower/邮箱校验、有效确认时间/整数同意版本/当前隐私筛选。冻结保留1,000门槛和原子性，预估无截断。
- [x] `npm run test:subscriptions` 17组全部通过，保留历史tab/NBSP退订回归。

### Task 2: 页面、接口与交付

**Files:** freeze服务只读汇总；已有 campaigns route/page、CampaignWorkspace、CampaignMockChecks；新 `tests/integration/subscription-campaign-freeze-ui.ts` 并接集成入口；中文小结/交接/记录。

**Interfaces:** `readCampaignFreeze(p,actor,{campaignKey,revision})` 返回 null 或严格白名单的 `{id,frozenAt,counts:{zh,en},revision,current}`。POST action `freeze-local` 调用既有冻结服务，只返回白名单快照。客户端新 frozen prop 仅JSON数据。

- [x] 先写失败集成：无确认冻结409→测试/双语确认→同源冻结→读本人汇总→重复不增加→改版显示旧快照并拒绝续发；匿名/运营/跨主管/撤权/未知参数和伪造人数拒绝、no-store/noindex、邮箱/任务不泄露。
- [x] 组件验证未测试/未保存/忙碌禁用、冻结成功/旧版/来源失效状态、北京日期、英文正文lang；然后接入最小页面与同源分支。
- [x] Node24 `npm run check`353项与18组订阅集成，lint不超过445；3186浏览器完整操作及390像素无横向溢出。截图只本机。
- [x] 一次新上下文只读复核；重要项RED→GREEN修复，轻微项记录。更新一页指南和交接。
- [ ] 单独草稿PR、核对远端SHA及确切CI；用户决定合并，交付结果在PR最终记录核对。
