# 待核对批量审计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。沿用主执行原生实施，末尾一次新上下文只读复核，不分派实现。

**Goal:** 来源失效可直接回归，整页一次批量审计并实测大表性能。
**Architecture:** 原withCampaignDraft和安全投影不变；本页目标VALUES集合JOIN审计、分组排名限21。测试观察真实pg SQL及随机库大表计划。
**Tech Stack:** Node24.22.1、现有pg/Payload/PostgreSQL15，无依赖、环境变量、索引或迁移变化。
**Spec:** [设计](../specs/2026-11-23-subscription-review-audit-batch-design.md)。用户已完整指定范围，沿用原生执行。

## Global Constraints

- local、权限/归属/版本/同源、只读及隐私保持，不真实发送/清除/强制重试。
- 页25、每任务20展示/21探测、按原审计ID顺序；空页0次审计，非空页1次。
- 100000无关＋10000集中审计、5轮交错中位数及真实EXPLAIN；只对已测夹具作结论，不设绝对时间硬阈值。
- Node24.22.1、业务≤400行、行≤200、lint≤445；原3100/55442/图片保留，所有临时变体逐字恢复。

## Review Focus

1. 来源失效后原任务/尝试/审计与快照仍可读，临时事实引用finally恢复，查询无写入。
2. 25/5/0页均有界，缺租约/无审计不丢任务，多任务不共用全局LIMIT21。
3. 相同数字的不同实体、错误recordId/slotId/动作不混入；取20条顺序/截断与旧实现一致。
4. 大表含集中历史，SQL实际扫描1次、查询1次，旧新结果等价及原权限/隐私回归；计数代理不吞真实请求。
5. 指标来自真实预热/交错样本及计划，不把生成夹具时间或缓存偏差冒充查询耗时；大表删除仅本次生成行。

### Task 1：真实回归与批量查询

**Files:** Modify src/server/subscription-campaign-review.ts、tests/helpers/campaign-review-details.ts、tests/integration/subscription-campaign-status.ts；Create tests/helpers/observe-pg-queries.ts。
**Interfaces:** observePGQueries(run)返回result/statements/elapsedMs，透传真实pg查询并finally恢复；服务响应类型保持。

- [ ] 先加来源失效服务/POST/全表指纹及真实审计查询计数；原实现25!=1 RED。
- [ ] 本页VALUES目标集单次关联、逐占位排名取21，旧投影20条及顺序保持；无数据不查审计。
- [ ] 源失效拒绝错误控制得到指定RED，逐字恢复后完整33组GREEN并提交。

### Task 2：大表性能与交付

**Files:** Create tests/helpers/campaign-review-performance.ts；Modify campaign-review-details.ts；中文小结/handoff/progress及旧明细小结当前遗留说明。
**Interfaces:** assertReviewAuditPerformance(p,db,actor,input,expectedPage)在原30项夹具内测量实际查询、旧谓词等价基线和计划，输出不含私密数据的PERF摘要。

- [ ] 先加扫描/等价/安全投影/集中历史断言，再实测10万＋1万夹具；预热后5轮交错对比，保留指标与原始计划本机归档。
- [ ] 完整check/33组及生产构建由CI核实；不追加无关UI验收，原站点200、随机库及夹具清理。
- [ ] 一次独立只读复核、重要项RED/GREEN修正，不追加复审；中文记录与原历史保留，最终SHA推送及精确CI成功，可审阅不合并。
