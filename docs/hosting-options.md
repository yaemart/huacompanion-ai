# 试运行托管选择

核对日期：2026-11-01，以下美元月费为预算估算，不是报价；未开通任何账户、订阅、域名或外部接入。两种方案都使用同一个 Docker 镜像，运行一个网站与两个常驻任务。试运行先中英、noindex、关闭模型／客户中心／语音／通话，完成账户和验收后再开放表单。

用户于2026-11-01确认[流量入口任务书](traffic-entry-task.md)停止点A选择Render，但当下仅本地开发测试；未授权购买、创建账户或部署。以下保留推荐与备选比较。推荐先选 Render 新加坡区，网站、两个 worker 和数据库均在同一区域私网；欧洲或美洲用户占多数时，可在开通前改选法兰克福或美国区。均为境外托管，地域选择后更换需迁移，参见 [Render 地域说明](https://render.com/docs/regions)。备选也须选择境外应用与数据库地域，不在中国大陆部署。统计另见[方案比较](analytics-options.md)。

## 推荐：Render Pro + Render 托管 PostgreSQL

选 Pro 工作区用于多人协作；网站起步 `1c-2g`（1 CPU／2GB），两个 background worker 各 `0.5c-512mb`。三个服务使用同一已测试的 Git 提交／镜像，命令分别为 `npm run start:host`、`npm run support:worker`、`npm run workflow:worker`。同区数据库用私网连接；先在维护窗口运行一次迁移，再发布三个服务，失败停止发布，不让三个进程同时迁移。付费 worker 是常驻服务，不把轮询任务改成临时函数。平台计划和规格见[官方计算计划](https://render.com/docs/compute-plans)。

图片盘挂载到 Docker 的 `/app/.local/content-media`，起步 5GB，仅网站进程写图片；当前两个 worker 的图片来源是数据库内容投影，不读写图片文件，因此不需要跨服务共享 Render 磁盘。磁盘只能挂载到单个服务，试运行维持一个网站副本；附盘部署有中断，不能承诺零停机。自动盘快照不能代替与数据库同一窗口的配套备份。若以后需多网站副本，再另立任务接对象存储，本阶段不接。[官方磁盘能力与限制](https://render.com/docs/disks)。

数据库选择付费 `0.5c-1g` PostgreSQL，起步按 5GB 存储预算。Pro 的数据库连续备份／PITR 窗口为 7 天，恢复创建隔离的新实例，确认后再切应用；免费库没有该恢复能力。额外保留停写窗口导出的数据库与图片配套副本，避免两个独立时间点不一致。[官方数据库备份](https://render.com/docs/postgresql-backups)。

域名在 Render 配置并按其控制台修改 DNS，平台自动签发和续期 TLS、HTTP 重定向 HTTPS。Pro 包含 15 个自定义域名；域名本身注册费另算。[域名与 HTTPS](https://render.com/docs/custom-domains)。

| 项目                            |      假设月费 |
| ------------------------------- | ------------: |
| Pro 工作区                      |           $25 |
| 网站 1c-2g                      |           $25 |
| 两个 512MB worker               |           $14 |
| PostgreSQL 1GB RAM              |           $19 |
| PostgreSQL 存储预算 5GB × $0.30 |         $1.50 |
| 图片盘 5GB × $0.25              |         $1.25 |
| 合计预算                        | **约 $86/月** |

按存储标价保守计全部 5GB；实际包含容量和账单以控制台为准。预算不含税、汇率、域名注册、Resend、异地备份存储及流量／构建超额，建议先批准约 $100–120/月上限；不会自行购买。服务／存储和工作区价格来自[官方价格表](https://render.com/pricing)。

适合非技术团队的原因：网站、worker、数据库、日志、重启、版本和恢复集中在一个后台，Pro 可分别邀请团队成员，无需共享主账户密码。仍需指定维护负责人处理升级、失败告警和恢复，不等于完全免维护。

网关必须另做部署验收：Render Pro 的入站 IP 规则不包含 Web 服务，不能声称已通过防火墙封闭源站。默认保持表单关闭；只有用户现有网关能覆盖客户端地址与秘密头、应用拒绝没有有效秘密证明的直接提交，且真实验证通过后，才启用 `TRUSTED_PROXY`。能使用网络隔离时再叠加限制；若现有账户做不到，先与用户确认可行部署调整和费用。参见[平台计划权限](https://render.com/docs/platform-features-by-plan)及 [网关要求](trial-deployment.md)。

## 备选：Railway Pro + Neon Launch 托管 PostgreSQL

Railway 建立网站及两个常驻服务，使用同一 Docker 镜像和上述三个启动命令。仅网站绑定公网端口和域名；两个 worker 无公网服务。网站挂载独立 5GB volume 到 `/app/.local/content-media`，保留配套导出及平台卷备份。当前 worker 不需要挂载图片盘，不依赖跨服务共享卷。[Railway 卷说明](https://docs.railway.com/volumes)。

PostgreSQL 使用 Neon Launch，选接近 Railway 的地域，按现有 pg 连接协议连接并启用 TLS；迁移使用直连端点，网站／worker 连接池预算总量控制在数据库限额内。Neon 自动保留 WAL 供时间点恢复，Launch 默认仅一天，应在提供账户后明确调整为七天并实测恢复；历史存储另计费。[Neon 恢复窗口](https://neon.com/docs/postgres/backup-restore/history-window)。不把 Railway 的数据库模板当作全托管 PostgreSQL。

Railway 配置自定义域名并维护 TLS；DNS 由域名管理者按平台生成的记录配置。[公网与域名](https://docs.railway.com/networking/public-networking)。网关的秘密覆盖及防绕过要求同推荐方案，部署前确认账户能力。

按 730 小时／月示例估算：三个应用平均常驻内存合计 3GB 约 $30；平均 CPU 合计 0.3 vCPU 约 $6；图片 5GB 约 $0.75。Railway Pro 最低 $20 包含等额用量，因此此例约 $36.75，**不是再加 $20**。以[官方 Pro 规则](https://railway.com/pricing)及[资源单价](https://docs.railway.com/pricing/plans)为依据。

两个 worker 持续轮询会使 Neon 难以休眠，不能套用“间歇负载典型 $15”。按最低 0.25 CU 持续运行、$0.106/CU 小时估算计算约 $19.35，5GB 数据约 $1.75，假设 1GB 恢复历史约 $0.20，总数据库约 $21.30。与应用合计约 **$58/月**，建议预算 $70–100/月并设置用量告警；CPU、内存、历史数据与跨平台流量增加会提高账单。[Neon 价格](https://neon.com/pricing)。

它提供可视化服务／卷管理和托管数据库恢复，不需自行维护数据库服务器；但两个控制台、跨平台网络及按量账单让交接比 Render 更复杂，因此作为备选。此估算不含税、域名、邮件、异地副本和流量；容量是假设，实际压力测试和账户账单后再定规格。

本机隔离容器一次空闲观察（不是压力测试）：网站约 95MiB、两个 worker 各约 311–314MiB。512MB worker 只有有限余量，真实数据量、部署地域和负载验收后再决定是否上调；不得把这个单点观察当作承诺容量。
