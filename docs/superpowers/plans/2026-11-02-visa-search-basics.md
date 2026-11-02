# 阶段1.6 搜索基础补齐

按 executing-plans 执行。规格：../../traffic-entry-phase1-plan.md 1.6 及停止点 B。

目标：管理员配置工具SEO/分享图片/Google验证码；只有已启用中英工具出现在导航、sitemap、语言替代及llms。
架构：共用纯工具可用性函数；复用seo-settings及现有媒体权限；GSC只允许验证码文本并用Next Metadata输出。
约束：不新增依赖、账户、统计、部署、购买或自动合并；实际.env开关保持关闭。沿已批准的阶段依赖链从1.5建立分支，前置未合并不从旧main重复实现。

- [x] 1. 纯函数和设置校验RED→GREEN：启停/七语矩阵、验证码注入、私有页noindex。
- [x] 2. 元数据/导航/sitemap/llms接入，工具图片仅启用时按既有权限公开；默认品牌分享PNG不含政策事实。
- [x] 3. SEO字段迁移及类型生成；先停进程、配套备份；空库与备份克隆验证，原数据不覆盖。
- [x] 4. check、构建、权限/媒体/HTTP开关矩阵及桌面手机截图；复核；恢复关闭的开发站与workers。
- [x] 5. 更新交接；推送1.5前置及1.6任务分支、创建依赖草稿PR，核对远程提交及当前head CI，不自动合并。

决定：保持现有正式收录条件(APP_ENV=production且SEARCH_ENGINE_INDEXING=true)，本地/trial强制noindex。
B确认与上线冒烟是操作门禁，不由SEO文字字段绕过。验证token配置本身不启用索引或统计。

交接：草稿 PR17 已建立；完整远端 head 与 CI 状态在最终交接核对，不将进行中视为成功。
