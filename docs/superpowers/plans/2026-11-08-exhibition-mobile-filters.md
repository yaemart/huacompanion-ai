# 展会筛选手机体验实施计划（D6）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 展会列表默认先看到现有“即将举办”结果，按“筛选”展开条件，月份用下拉框。

**Architecture:** 原生details／summary包住现有GET筛选表单，初始收起，桌面同样可展开；不依赖新增客户端JS。月份根据本语已发布展会的日期范围生成去重、排序的YYYY-MM选项，覆盖跨月并保留有效链接选中值。保留默认upcoming（含进行中、待公布／延期）及过去／全部规则、咨询与发布权限、清除和分页行为。

**Tech Stack:** Node24.22.1、Next16.4／React19、既有CSS，无新依赖。

**Spec:** docs/tasks/customer-fixes.md第6条；PR35合并main c743ab4，用户明确继续D6。

## Global Constraints

- 只做D6，不做D7／8／9或改展会状态、咨询规则；不改种子、权限、schema、迁移、环境键。
- 源码单行≤200、业务新增＋删除≤400、lint警告≤465；check、相关SSR和HTTP实核。
- 复用当前checkout新任务分支；构建用独立克隆及缓存，3100普通重启保留数据，不reset；原55438不写。
- 外部服务和worker关闭，不购买／部署／自动合并；截图只忽略目录，未上传如实说明。

## Review Focus

- 390窄屏初始筛选收起、键盘及指针可展开／提交／清除，1440桌面同入口可操作，无JS也可用。
- 选中月份／城市／行业／关键词／过去范围在GET提交、空结果和分页中不丢，表单提交回第一页。
- 月份跨年跨月、重复日期／未定日期、无本语内容、已选无匹配月份均有可理解的下拉选项。
- 默认结果不含已结束／取消；进行中、延期、未定日期和详情咨询仍按原规则，不伪造未来日期。
- 保留中英文及其他现有语言标签、RTL布局、空结果恢复入口和单一完整页脚。

### Task 1: 原生筛选与月份下拉

**Files:** src/components/exhibitions/ExhibitionPage.tsx、src/lib/exhibitions.ts、src/lib/exhibition-copy.ts、globals.css；新月份纯测试／真实ExhibitionPage SSR及只读HTTP、CI；一页小结、指南、进度和交接。

**Interfaces:** exhibitionMonths(items: {kind:string;exhibition?:Exhibition}[], selected?:string): string[]；只传本语言items。已有ExhibitionQuery／filterExhibitions／GET参数名保持。summary用新filters文案、allMonths，其他文案原样。

- [x] RED：月份枚举（跨年／重叠／重复／未定／选中值）；SSR初始closed／月份select／默认upcoming及过去全部、空结果、筛选分页保留。
- [x] GREEN：新增月份函数，details／summary和月份select；用范围内CSS保证窄屏点击及长内容换行，既有过滤与详情逻辑不改。
- [x] check与SSR；备份源数据库／图片恢复到随机克隆，仅只读生产build及中英HTTP验收，源不写测试内容。
- [x] 3100普通重启保留数据，1440／390前后图、实际展开／选月提交／清除／切语及无横溢；真机／新人未验。
- [ ] 提交推送唯一草稿PR；一次独立整分支复核并修确定阻塞项，更新小结；核对最终head CI，清理自建副本保留备份／日志／证据。
