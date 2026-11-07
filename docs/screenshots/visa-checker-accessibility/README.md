> 2026-11-07归档：本目录图片和JSON已移出当前版本；[查看/下载原始证据](https://github.com/yaemart/huacompanion-ai/tree/43413046a886ee58bb7e8bfd4928f151cad01be2/docs/screenshots/visa-checker-accessibility)。下文是历史记录，不代表最新界面。50份原件在本机忽略目录完成SHA256校验；不重写Git历史。

# 1.3c FAQ、可访问性与本机生产移动报告

2026-11-01，Node24.22.1/Next16.4.3生产build，工具仅在本机临时进程开启；实际.env未改。每个语言有3条虚构正式政策（一般/240小时/已过期）、1条虚构正式FAQ和指南，全部example.invalid来源，不得用于出行。默认配置仍仅en,zh，临时数据最终清理。

## Lighthouse

用户明确批准临时下载运行官方Lighthouse13.6.0，安装在忽略的.local/lighthouse-tool，不改变项目package或锁文件。按[官方CLI说明](https://github.com/GoogleChrome/lighthouse/blob/main/readme.md)使用独立临时Chrome资料，不读取个人浏览器Cookie。关闭错误遥测，报告留本机/仓库，不上传服务。原始HTML另存.local/visa-a11y-*-final.report.html，JSON随本目录交付。

| 报告                   | 运行UTC时间              | 移动性能 | 可访问性 |
| ---------------------- | ------------------------ | -------: | -------: |
| en-initial.report.json | 2026-11-01T14:33:19.228Z |      100 |       97 |
| en-final.report.json   | 2026-11-01T14:35:28.330Z |      100 |      100 |
| zh-final.report.json   | 2026-11-01T14:36:17.495Z |      100 |      100 |

实际URL为http://127.0.0.1:3000/en或/zh/tools/china-visa-free-checker，精确设置/版本/时间见lighthouse-summary.json及完整JSON。mobile412×823、deviceScaleFactor1.75、默认模拟移动网络RTT150ms/1638.4Kbps与CPU4倍放慢，throttlingMethod=simulate；只选择performance/accessibility两个完整类别，skipAudits=null，无自定义降节流。不是开发服务器/桌面分数。构建源码随后提交为2d1fb0664cb3bce3267cce14838151be0390492b，summary已关联该源码提交，源码指纹涵盖src、package/锁和next.config.mjs；构建后未更改这些文件再记录最终评分。

初次对比度审计0：正文#6e7770在#faf9f5上4.39:1<4.5。局部.policy-reference内--muted改用既有--ink，不改其他页面配色。初次label-content-name-mismatch为0：Header的aria-label覆盖中文可见品牌，移除覆盖，让朗读名称由原可见文字生成；视觉不变。两项最终均1，没有跳过或修改审计。保留初始报告作为RED→GREEN证据，bf-cache的no-store诊断保持，不为得分放松快照缓存边界。

## 手工证据与限制

- en-desktop-keyboard.jpg：桌面1440×1000，空字段错误及关联、可见FAQ原生Enter展开，summary焦点3px；语言English后Tab到中文，国籍后Tab到日期。完整截图可能显示离屏fixed跳转链接的截屏位置，页面实测top=-100px、仅聚焦时显示。
- zh-mobile-faq.jpg：390×844中文，原生Space展开FAQ，来源/核实日期可读；文档clientWidth/scrollWidth均390。
- zh-320-nojs.jpg：320CSS像素窄屏重排与禁用脚本重新加载，政策表3行保留、查询disabled、FAQ仍可Space展开，文档宽/内容宽均320，表格仅内部横滚。
- manual-evidence.json：上述实际DOM/焦点/错误/无JS检查结果。操作只走CUA；临时设备模拟和脚本禁用已撤销，自己创建的标签已关闭，未操作用户原标签。

这是本机自动审计及有限手工验收，不是全面WCAG认证。未实际跑VoiceOver/NVDA端到端，也未遍历所有系统字体缩放和浏览器组合；320CSS像素检查不是声称所有200%/400%缩放设置通过。当前只有虚构小数据样本，真实政策/FAQ上齐后及托管环境仍须重测，不能外推所有网络或大数据量。完整FAQPage不保证搜索引擎展示富摘要；真实部署/备份恢复和停止点B仍待完成。
