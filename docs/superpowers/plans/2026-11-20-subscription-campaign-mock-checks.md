# 群发 B3：本地模拟测试与手动确认条件

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 实现前写失败测试，最后独立只读复核。

**Goal:** 获授权主管对本人已保存草稿生成本地模拟邮件，逐语言确认可读后记录模拟确认；任何绑定条件变化即失效。

**Architecture:** 复用同一内容→业务锁及最新本人草稿校验。新增私有检查记录，绑定草稿版本、正式来源版本、语言、授权版本和发件配置摘要，测试和确认各自幂等、与审计原子提交。观察到条件变化时追加 mock-reset，串联新绑定，避免配置恢复后复活旧结论。页面只展示本地模拟状态，绝不生成真实发送资格。

**Tech Stack:** Node 24.22.1、Next.js/React、Payload、PostgreSQL 15；使用已有组件/接口。

**Spec:** 已批准 `docs/tasks/2026-11-19-subscription-broadcast-options.md` 第 6–8 节；用户明确本批只做本地模拟测试与手动确认条件。基线为 PR85 合并 `c20b923d45d28a06732f433bac0bec054fc87d47`。

## Global Constraints

- 管理员也须明确主题授权；只能测试、确认和读取本人活动；逐次检查当前员工、主题权限及版本，禁止普通运营与跨主管操作。
- 本地检查仅 APP_ENV=local，固定虚构收件地址，不调用邮件适配器或供应商，不创建原确认队列或新发件队列；不是送达验证或真实发送批准。
- 每个可用语言分别确认可读；缺语言不能冒认，未测试/过期测试/旧测试编号不能确认。草稿修改、来源重发或下架、授权撤销重授、发件配置变化均失效。
- 未保存的政策选择变化时，页面禁用模拟测试和确认并提示先保存；服务端继续拒绝旧草稿版本，不能依靠前端按钮保护。
- 只做模拟确认门槛；内容和收件资格冻结、逐人任务及额度在下批，不把本批模拟确认用于真实发送。
- 新迁移只在独立临时库验证，原 3100/55442 演示及图片保留。无新外部服务、依赖、环境变量或原种子。应用/集合源码控制在 400 行内；本批新增 396 行，配套迁移和注册另 44 行、生成类型另计；不拆开有依赖的迁移与使用者。沿用任务分支。

## Review Focus

跳过测试直接确认、客户端伪造语言和测试编号、来源相同内容重发仍误用旧测试、撤权重授后复活旧结论、审计 COMMIT 失败却显示成功。新集成测试逐项覆盖；手机/键盘及中文文案做本地浏览器检查。

### Task 1: 私有检查记录与版本绑定服务

**Files:** `src/cms/subscriptions/collections.ts`、新迁移及注册、生成类型；新 `src/server/subscription-campaign-mock-checks.ts`；现有 drafts 服务增加同事务校验回调；订阅集成测试。

**Interfaces:** 集合 `subscription-campaign-checks`，draft/kind/binding/contextHash/actor/languages/test；唯一 draft+kind+binding。`campaignMockChecks(payload,actor,action,{campaignKey,revision,testId?,readable?})` 的 action 为 status/test/confirm；返回 enabled/tested/mockConfirmed/testId/messages（仅固定虚构收件地址），不含配置密钥、订阅邮箱或原始配置。

- [x] RED：私有 CRUD、迁移往返/保留数据回滚拒绝；更新既有草稿迁移测试，先撤销依赖的新检查表再撤草稿表，往返指纹不变。
- [x] RED：无授权/跨主管/旧身份拒绝，直接确认失败，测试后逐语言确认，重复请求幂等、并发只一份；新草稿及相同事实新版本/下架/过期、配置及授权版本变化失效；审计失败无残留，不入邮件队列。
- [x] 实现最小模型/服务，运行 `npm run test:subscriptions`；Expected: 既有 15 组和新增检查通过。测试自己设置恢复政策开关，不依赖本机默认值。

### Task 2: 接口、页面与模拟预览

**Files:** 现有 campaigns POST/page，新增 `CampaignMockChecks.tsx`；Workspace 仅增加未保存标志和检查面板。

- [x] RED：同源/未知参数拒绝，接口测试→读状态→逐语言确认→改稿失效；渲染未测试、已测试、已模拟确认、来源失效、未保存禁用及缺语言状态。
- [x] 实现页面按钮和明确模拟邮件视图，不使用“已发送/已送达”状态。`npm run check` 和订阅集成通过，警告不超过 445。
- [x] 3186 浏览器用虚构政策：授权→保存→先确认被阻止→生成模拟邮件→逐语言勾选→模拟确认→修改选择先保存且旧测试失效→重新测试。手机布局及越权由浏览器/接口分别验证，截图只本机忽略目录。

### Task 3: 交付

- [x] 独立只读复核，重要问题先补 RED 再修复；更新实际记录、交接和一页中文亲测。
- [ ] 单独 PR、检查确切提交的 CI、核对远端 SHA。用户决定合并；真实测试/发送、费用和部署均未授权。
