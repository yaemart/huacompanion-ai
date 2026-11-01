# 医疗与康养机构第一批实施计划

用户已在具体实施步骤后授权“实施”。沿用现有 Payload 内容中心、事务发布和咨询入口，新增 institution 内容类型。第二批 AI 抓取、机构自助更新和统计不在本批范围。

## 数据约定

ContentBody.institution: Institution。独立 src/lib/institutions.ts。
字段全为 string：type(medical|rehabilitation|wellness), city, address, addressEn, directions, audience, appointment, preparation, fees, foreignAcceptance(pending|confirmed|paused), acceptanceConditions, interpretation, officialURL, verifiedAt, qualification, unresolved。
languages:string[] 使用七种服务语言代码；projectKeys:string[]。无内部联系人进入公开 body。关联内部机构使用现有 providerRef（后台私有）。发布需 institutionReviewed=true、完整必要信息及与 officialURL/verifiedAt 匹配的来源，qualification 作为公开核验说明，不作虚假资质声明。仅 confirmed 可接受机构咨询。

## 任务

- [x] 数据模型/校验/公开字段白名单/发布审核/只读 API，验证非法字段和发布门槛。
- [x] 后台编辑、筛选、预览、复用合作档案，核验声明与私有字段隔离。
- [x] 七语言机构列表详情、导航、SEO、翻译路由、关联服务与华伴 CTA。
- [x] 咨询归因 institution + institutionRevision，服务端锁内校验状态和修订，保存快照，表单最小信息；后台已有状态流程评估并复用。
- [x] 整理有官方来源的候选机构草稿，绝不自动发布或编造接待能力。
- [x] 单元、类型、构建与本地集成验证；停止旧服务后重建并重新启动。

## 路由与接口

/[locale]/institutions 和 /[locale]/institutions/[slug]。
/api/public/institutions 查询 locale/city/type/language/q/key/slug；公开已发布资料；文档说明 pending 不等于不接待，空语言不等于支持所有语言。

## 验收关注

草稿和内部字段不得泄露；机构下架/暂停阻止新咨询；篡改快照不得入库；翻译与接待语言隔离；无资质/官方来源不得发布。

## 实施裁定

协调进度使用独立 coordinationStage 字段，保留原有商业处理状态，迁移新增主表和历史版本字段。机构的可选内部合作关联允许管理员发布后补充，服务商公开档案原有不可更改规则不变。后台公开状态计算扩展为全部七语言。候选共6家12份中文/英文草稿，其余语言需人工整理，首批不发布。
