> 2026-11-07归档：本目录图片和JSON已移出当前版本；[查看/下载原始证据](https://github.com/yaemart/huacompanion-ai/tree/43413046a886ee58bb7e8bfd4928f151cad01be2/docs/screenshots/visa-search)。下文是历史记录，不代表最新界面。50份原件在本机忽略目录完成SHA256校验；不重写Git历史。

# 阶段 1.6 本地界面验收

2026-11-02，Node24.22.1 本地生产构建，APP_ENV=trial。实际环境文件未改；临时进程启用工具并开启七语以检查工具仍只支持中英。测试后恢复默认关闭。

- disabled-desktop.png：关闭时首页无工具入口。
- enabled-en-desktop.png、enabled-zh-desktop.png：中英工具与导航，默认品牌/空正式数据状态。
- enabled-en-mobile.png、enabled-zh-mobile.png：390×844 手机视口；无横向页面溢出。
- enabled-zh-mobile-menu.png：移动菜单工具入口，点击可导航并关闭菜单。
- admin-desktop.png、admin-mobile.png：现有管理员查看 Google 验证码、工具固定页 SEO、语言及分享图字段；临时行仅用于截图，未保存，已退出登录。保存/重读/权限/恢复由集成测试验证。

本轮没有填写真实 Google 验证码、发布政策或部署。没有重跑 Lighthouse，也不把本地截图视为正式上线验收。
