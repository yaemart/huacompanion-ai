# D7 客服入口与白话文案实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans；本轮原地任务分支执行，不新建工作树。

**Goal:** 文字客服关闭时服务器跳同语言联系页；开启时说明当前浏览器访问、共享设备及换设备联系人工。

**Architecture:** 客服page复用getPublicFeatures的textChat开关，在PublicPage／SupportChat前redirect。保留API、会话凭证、授权与所有其他开关；只改已有七语隐私提示，中英等待／AI不可用提示白话化。

**Tech Stack:** Node24.22.1、Next16.4.3 App Router、Payload3、PostgreSQL15。

**Spec:** docs/tasks/customer-fixes.md 第7条及验收；docs/tasks/master-plan.md。

## Global Constraints

- 只做D7；顺序PR，用户合并；业务增删小于400行，lint警告≤465，源码行≤200。
- 源55442与原55438保留，不reset、不启用外部服务／worker。开启只在随机隔离克隆。
- 无schema／依赖／环境键／种子变化；截图放PR附件，原图和备份留.local。

## Review Focus

- 设置读取失败：关闭处理，不展示聊天；沿用getPublicFeatures既有失败关闭逻辑。
- 旧链接及旧会话cookie：同语言联系页，不包含聊天表单或会话数据，不颁新cookie。
- 切换开关：下一次服务器请求立即反映；非永久跳转、不缓存为正式地址。
- 隐藏语言与无效语言：仍404，不意外跳到不可用语言联系页。
- 提示准确性：浏览器凭证和跨设备核实规则不变；不承诺实时在线，不暗示AI已开启。

## Task 1：D7 独立可验收交付

**Files:** 修改src/app/(frontend)/[locale]/support/page.tsx、src/lib/support-copy.ts；tests/support.test.ts、tests/integration/support-http.ts、public-footer-http.ts及CI；更新进度、交接、指南和一页小结。浏览器发现开启客服英文页头1px横溢，globals.css仅手机header-actions间距15→10px并重验。

**Interfaces:** 消费getPublicFeatures():Promise<PublicFeatures>；textChat严格true才渲染。无新API或权限。

- [x] 先添加隐私提示断言，观察旧credential文案失败；隔离运行support-http新增关闭请求期待307／Location和API启动503，观察旧页面200失败。
- [x] page加isSiteLocale校验及getPublicFeatures／redirect，同语言/contact；中英文隐私说明当前浏览器可读、共享设备勿留私密信息、换设备联系人工，不改凭证；其他五语同义简化。
- [x] 相关纯测试GREEN；HTTP覆盖先关→开→关和已启用语言、未知语言404、关闭无聊天／无set-cookie、开启隐私说明、既有cookie／Origin／越权回归。页脚测试明确跟随本次跳转到联系页。
- [x] npm run check；隔离生产build，CI已有生产两模式接support-http；浏览器1440／390前后图和联系页／启用提示验收；3100普通重启、test:demo确认数据保留。
- [x] 更新实际记录、一页中文小结，提交push并尽早草稿PR；一次全分支独立复核，按验收裁定；只补阻塞修复，最终精确headCI／远端核对。不替真人或真机计时。
