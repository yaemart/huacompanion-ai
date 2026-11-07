# 家政与居家服务第一批实施计划

用户已批准本轮九项具体方案并要求实施。沿用本地开发分支；保留现有未提交的 Next 自动生成文件。

**Goal:** 在现有服务商体系接入家政服务申请、公开展示、华伴咨询与内部履约。
**Architecture:** 新类别 housekeeping，三子类 regular/deep/move-in；公开 Catalog.housekeeping 白名单与内部 Provider/Inquiry 家政分组分离；沿用员工团队/负责人权限与独立审核。
**Tech Stack:** Next.js、React、Payload、PostgreSQL。
**Spec:** 对话中已批准的家政九项实施方案。

## Global Constraints

八城市、七语言；首次询问不收门牌/门禁；不自动公开申请；不自动派单或传输客户资料；无新增支付、托育、医疗照护。

## Review Focus

暂停服务商及陈旧版本不可预约；伪造内部字段不得进入数据库；公开输出不可包含客户地址或合作资料；仅家政需求不强制填写来华行程；信息转交记录必须包含明确授权和接收方。

## Tasks

- [x] 1. shared housekeeping types, public whitelist, form validation and failing→passing tests.
- [x] 2. seven-language application/request form, service category, public catalog editor/details/filters.
- [x] 3. internal verification and fulfilment fields, consent guard, additive migration after backup.
- [x] 4. source revision and subcontract compatibility, published-only API, AI preservation.
- [x] 5. integration/HTTP/build/regression verification, independent review and usage docs.
