# 华伴 · Hua Companion

中英文来华服务网站。当前交付为**完整页面预览阶段**，不是已上线的业务系统。

## 本地查看

- 中文：http://127.0.0.1:3000/zh
- English：http://127.0.0.1:3000/en

```sh
npm ci
npm run dev
```

生产方式预览：`npm run build` 后执行 `npm run start`。仅监听本机。关闭进程后链接将不可用；重新运行上述命令即可。

## 当前已实现

- 46 个双语页面：主页、服务目录、7 类服务详情、指南目录、6 篇指南、合作招募、关于、联系、两套表单、隐私和服务边界。
- 墨绿、暖白响应式界面；原创上海 SVG 插画和图标。
- 保留路径的中英文切换；手机导航、指南分类、FAQ。
- 四步咨询及合作申请，多选类别、分类问题、短住和长租分支、输入校验、核对信息。
- 页面标题、服务器端渲染；当前预览全部 noindex。

## 当前未接入

- Payload 中文后台、PostgreSQL、账号与权限。
- 真实表单保存、咨询编号、通知与邮件。
- 咨询及服务商管理、报价版本与客户导出、统计。
- AI 客服、人工留言持久化、AI 信息整理。
- 正式隐私告知、公司与联系方式、域名和托管。
- 数据导出及备份恢复演练。

表单仅在浏览器页面内暂存输入，刷新或切换页面可能丢失。最终按钮只检查预览，不提交、不发送、不生成编号。请勿填写真实客户或敏感资料。没有隐藏的后台演示或模拟 AI。

## 内容与结构

- `src/lib/content.ts`：当前双语服务、FAQ 与指南内容，下一阶段由 CMS 读取替代。
- `src/components/Site.tsx`：页面布局。
- `src/components/InquiryForm.tsx`：两套表单。
- `src/lib/forms.ts`：校验与核对页字段筛选。
- `src/app/globals.css`：响应式样式。
- `public/shanghai.svg`：本项目原创插画，无第三方素材下载。
- `docs/original-brief.txt`：原始任务书。
- `docs/superpowers/`：确认方案与阶段实施计划。
- `docs/preview-verification.md`：本阶段实际验证结果。

## 检查命令

```sh
npm test
npm run typecheck
npm run build
# 启动服务后：
node scripts/check-routes.mjs
```

## 下一阶段

在不购买服务的前提下，可先继续搭建 Payload 与 PostgreSQL 的本地开发配置，实现认证、内容发布及真实表单。接入外部账户前集中确认数据地区、主体与账户归属，密钥通过环境变量配置，不进入仓库。正式上线须另行批准。
