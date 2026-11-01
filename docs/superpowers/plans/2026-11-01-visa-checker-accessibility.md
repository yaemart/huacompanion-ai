# 免签工具1.3c FAQ与可访问性 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans，当前会话直接实施，最后一次独立整轮只读复核。沿用已批准阶段1.3c；不重复询问既定设计。

**Goal:** 为中英文工具加入后台正式FAQ及一致FAQPage，验证键盘/错误/焦点/手机与生产移动Lighthouse性能和可访问性≥90。

**Architecture:** 复用listPublished及现有faq内容，不新增schema；VISA_FAQ_CONTENT_KEYS可选逗号精确标识只在服务端选择，纯文本问答和安全来源/核实日投影同时驱动SSR可见FAQ与JSON-LD。缺配置/未发布不造数据，不输出空FAQPage。查询仍局部state，完整表保留；只修审计发现的实际障碍。

**Tech Stack:** 现有Node24/Next16/React19/Payload/PostgreSQL。用户已明确批准临时官方Lighthouse，不进入package/锁文件；其余依赖仍禁新增。

**Spec:** docs/traffic-entry-task.md1.3；docs/traffic-entry-phase1-plan.md1.3c。

## Global Constraints

- 仅本地测试，VISA_CHECKER_ENABLED默认false，noindex，B前不公开、不部署/购买/接统计。
- 一步独立草稿PR依赖PR13，业务源码<=400行，新代码无any，行<=200，无新schema/服务/实际.env变化。
- FAQ政策信息不写死，来源有核实日；只取同语言正式faq，键名精确配置，不取所有首页FAQ。
- 查询国籍/日期不得网络/URL/日志/存储；政策规则、客户权限和报价不变。
- 生产build停dev，check/build串行，DB夹具停workers并finally清理，截图使用虚构资料。

## Review Focus

- 草稿/下架/错语言/错类型/重复标识/未配置FAQ不会显示或生成JSON-LD；缺来源/无效或未来核实日拒绝。
- 可见问答和acceptedAnswer使用同一投影，恶意</script>/HTML不能突破JSON-LD或正文；不输出空FAQPage。
- 键盘可到跳转、语言、控件、错误、结果和FAQ，Enter/空输入/改值行为正确；焦点/状态播报不误导。
- 无JS仍有完整政策表与FAQ，手机/放大无整页横向溢出；过境小时和来源/核实信息完整。
- Lighthouse必须生产移动配置和真实报告≥90，不能通过空数据/禁用审计/降低节流取巧，不当作真实部署或全面辅助技术认证。

### Task 1: 正式FAQ投影、SSR与结构化数据

**Files:** src/lib/immigration-policy-faq.ts，src/components/immigration/PolicyFAQ.tsx，工具page.tsx及policy-query.css，.env.example，tests/immigration-policy-faq.test.ts，tests/integration/immigration-faq-render.tsx，package.json/CI，tests/integration/immigration-page-http.ts。

**Interfaces:** selectPolicyFAQs(published:readonly ContentBody[],locale:"en"|"zh",keys:string|undefined,asOf:string):PolicyFAQItem[]；PolicyFAQItem={key,question,answer,sources:{title,url,checkedAt}[]}。FAQ仅接受非空纯文本paragraph/heading/list块，缺信息整条拒绝；来源必须https无凭据且checkedAt合法且<=asOf。PolicyFAQ({items,locale})静态输出原生details/summary与同问答FAQPage，JSON.stringify替换<为\u003c，空列表无script。

- [x] 先写纯投影RED（缺模块）；覆盖精确选择/语言/重复/安全来源日期/纯文本/空及不变性。实现最小投影，单元GREEN。
- [x] 先写渲染RED；验证双语可见问答/来源/日期与JSON一致、恶意文本转义、原生details无JS/空态无schema。实现SSR组件与路由仅一次listPublished读取、可选配置，渲染及check GREEN。
- [x] 扩真实HTTP FAQ草稿→提交→发布→改稿快照保留→下架/语言隔离，CI传虚构key并运行渲染；本地生产HTTP GREEN。

### Task 2: 生产移动审计、复核与交接

**Files:** 必要的局部可访问性修复与对应测试；docs/screenshots/visa-checker-accessibility及报告，README/progress/handoff/feature-inventory/immigration-policies/阶段计划。

**Interfaces:** 沿用Task1投影和1.3b查询；官方Lighthouse仅临时工具，报告记录URL/版本/构建SHA/时间/mobile节流配置/得分与手工检查限制。

- [ ] 生产build，临时中英正式虚构政策+FAQ+指南，Lighthouse mobile两语性能/可访问性>=90；不通过先定位、补失败测试及最小修复后复测，原始失败报告也保留证据。
- [ ] CUA桌面/390手机、键盘错误/焦点/FAQ展开/无JS/放大检查，截图；如有屏幕阅读器未实测须明示，不能冒称全面认证。
- [ ] 生产开关HTTP/FAQ链路及原query DB/trial HTTP回归，清理夹具/原稿116/开关核对，恢复dev和两workers。
- [ ] check及行长/any，更新文档，代码提交后一次独立整轮复核；重要问题一轮RED→GREEN，记录所有裁定。
- [ ] 最终提交、推送草稿PR并关联；fetch核对SHA/clean tree，当前head push/PR CI实核。下一步1.4，部署和B仍未完成。
