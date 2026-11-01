# 医疗与康养机构第一批交付与验证

日期：2026-10-29。本地部署，未对外发布。

## 入口

- 前台：/zh/institutions（支持 zh/en/es/fr/de/it/ar）
- 后台：/content-center?kind=institution
- 公开接口：/api/public/institutions；使用说明：/api/public/institutions/docs
- 咨询：/admin/collections/inquiries

## 已实现

三类机构（医疗/康复/康养）、八城市、实际接待语言与页面翻译分离。列表筛选、分页、详情、来源与核验日期、七语言界面、阿拉伯语方向、同一内容标识的翻译切换、结构化 Place 信息和站点地图。

后台草稿、预览、审核、人工核验声明、发布与下架；可选私有合作档案关联允许管理员发布后补充。公开信息不输出内部联系人、providerRef 或审核记录。机构接待状态与内容发布状态独立，只有 confirmed 接受机构定向咨询；pending/paused 提供一般咨询。

机构咨询包含服务器核实的身份、版本、城市、接待状态、地址和核验日期。旧版本、暂停、下架、跨语言或不匹配关联项目拒绝提交；重试保持幂等。医疗服务默认勾选，普通表单已有不提交病历/详细病史提示。内部咨询增加独立协调进度：待受理、联系客户、机构确认、方案待确认、完成、关闭，保留原有业务状态。

## 首批候选资料

6家、12份中英文草稿。source.checkedAt 是检索官方来源的日期，institution.verifiedAt 保持空白，不能误认为完成了资质与接待能力核验。未翻译其他五语种正文，不自动发布，不宣称合作或接待能力。

候选官方来源：

- 上海嘉会：https://jiahui.com/en/locations/JIH
- 邵逸夫国际医疗中心：https://www.srrsh.com/articleInfo/128
- 北京和睦家：https://beijing.ufh.com.cn/locations/main-campus
- 广州和睦家：https://guangzhou.ufh.com.cn/locations/guangzhou-united-family-hospital
- 北京和睦家康复：https://beijing.ufh.com.cn/locations/rehabilitation-hospital
- 泰康之家申园：https://sy.taikangzhijia.com/

## 验证

- npm test：59/59。
- npm run typecheck：通过。
- npm run build：通过，最终版本已启动本地3000端口。
- npm run test:institutions：权限/人工审核/官方来源日期/资质说明/白名单/语言隔离/版本/幂等/接待状态/下架/项目匹配/发布后关联内部档案/协调进度读写通过。
- node --import tsx tests/integration/institutions-http.ts：七语言/RTL/导航/列表详情/重复筛选参数/SEO转义/来源/接口/咨询预填/暂停与下架通过。测试虚构机构最终全部下架。
- npm run test:migrations：在独立空数据库应用全部迁移成功；主库未被迁移测试改动。local 模式开发数据库通过已有 schema push 添加字段。
- 认证后台HTTP检查：内容工作台200，真实候选草稿12份且均为draft。
- 浏览器截图：中文列表、八城市、三分类、七语言筛选和未发布空状态正常。
- 独立复核问题已修复并回归：发布后内部关联更新；重复查询参数500；后台可见状态计算覆盖七语言。

## 后续

上线前运营人员核验并完成草稿，人工审核发布。第二批自动资料采集/翻译/变更监测、机构自助入口、运营统计尚未启用。AI目前仅能读取公开接口；自动内容发布不在本批范围。
