> 2026-11-07归档：本目录图片和JSON已移出当前版本；[查看/下载原始证据](https://github.com/yaemart/huacompanion-ai/tree/43413046a886ee58bb7e8bfd4928f151cad01be2/docs/screenshots/visa-checker-ssr)。下文是历史记录，不代表最新界面。50份原件在本机忽略目录完成SHA256校验；不重写Git历史。

# 1.3a 本机生产构建截图

2026-11-01，Node24.22.1，`APP_ENV=trial npm run build`后本机3000生产进程验收。截图时仅进程临时启用VISA_CHECKER_ENABLED，实际.env未改；全部政策是明确标识的虚构测试资料，来源为example.invalid，不是现实政策。截图夹具已清理，最后恢复默认关闭的开发站及两个worker。

CDP关闭页面脚本后重新加载，所有政策行仍显示；中英文语言链接不依赖脚本。浏览器viewport高级接口等待/超时，手机改用同一CUA浏览器的CDP设备模拟，无其他浏览器技术。临时标签的脚本及设备模拟已撤销并关闭；高级viewport.reset请求超时，未将其计为已验证的重置结果。

| 文件                       | 内容                                                |
| -------------------------- | --------------------------------------------------- |
| en-empty-desktop.jpg       | 无正式政策时的英文空态；不生成示例结论              |
| en-desktop-nojs.jpg        | 英文桌面完整表格：一般方式、240小时、已截止         |
| zh-desktop-nojs.jpg        | 中文桌面完整表格，含来源/核实日期/免责提示          |
| en-mobile-nojs.jpg         | 390×844手机英文，页面clientWidth/scrollWidth均390   |
| zh-mobile-nojs.jpg         | 390×844手机中文，三条正式夹具均存在，表格局部横滚   |
| zh-mobile-sources-nojs.jpg | 无JS键盘右移后可读条件、来源及核实日期；焦点轮廓3px |

桌面视口1440×1000，实际可用宽度1425且document.scrollWidth同为1425。手机文档宽度390、表格区域333、内部表格850；横滚限制在表格区域，没有整个页面横向溢出。手机原生表格保持完整行，横滚阅读其余列；1.3b将补浏览器筛选。

当前仅为1.3a视觉证据，不代表完整工具、现实政策、移动Lighthouse或公网试运行通过。FAQ及生产Lighthouse性能/可访问性≥90留1.3c，不以截图或开发模式代替。页面当前强制noindex，发现入口后续1.6统一接入，B前不公开。
