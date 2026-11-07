# 验收证据索引

复核备注：browser-summary.json先于Lighthouse生成，其中“no new Lighthouse score yet”是当时状态。随后完整报告和lighthouse-summary.json记录两语100/100；此处元数据不一致列为延期Minor，上传前需整理。目前仍未上传，不把旧提示当成缺测。

图片和原始报告已从当前版本移出，避免每次审阅混入大文件；Git历史仍保留原件，因此这次不会缩小既有历史对象。各目录README开头链接到固定提交，历史评分/截图不能当成最新head的验证。

旧证据统一来自[归档提交4341304](https://github.com/yaemart/huacompanion-ai/tree/43413046a886ee58bb7e8bfd4928f151cad01be2/docs/screenshots)。50份文件共4,966,606字节，移出前在本机.local/evidence/pre-consolidation-20261107逐份SHA256核对。数据库、图片上传目录、密钥不在此归档中。

本轮新增手机/桌面/无JS截图、浏览器摘要、两语Lighthouse JSON在.local/evidence/review-consolidation，仅含虚构资料。PR19说明记录测试结果与证据状态；连接器不支持附件上传，GitHub网页未登录，本轮未把新文件上传。可用本机review-consolidation-evidence.zip手动附在PR19；本机路径不是远端下载链接。

之后每阶段只在docs保留一页中文小结及必要的验证摘要，图片/原报告使用PR附件或经核实的CI产物链接，不再提交Git。没有实测或上传的项目明确写未验/未上传。
