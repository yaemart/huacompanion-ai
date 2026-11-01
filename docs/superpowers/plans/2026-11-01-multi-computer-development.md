# 多电脑开发协作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已接受的多电脑协作流程保存到仓库，并用 GitHub CI 验证共享代码。

**Architecture:** 保留现有干净任务分支与本地运行环境；文档约定交接和任务分支，PR 自动运行只读 CI。CI 以临时 PostgreSQL 15 隔离数据库检查。

**Tech Stack:** Markdown、Git、GitHub Actions、Node.js 24.22.1、PostgreSQL 15。

**Spec:** `docs/superpowers/specs/2026-11-01-multi-computer-development-design.md`

## Global Constraints

- 保留 Next.js 自动维护的 AGENTS 块，不改业务代码。
- Node.js 24.22.1、临时 PostgreSQL 15。
- 无部署、真实供应商密钥、私有数据上传或自动合并。
- 文档与配置使用实际命令及云端运行验证，不新增镜像实现的测试。

## Review Focus

- 未提交修改或分叉时不得覆盖本地数据；文档明确停止并检查。
- 没有 PR 的分支不触发 CI；明确触发条件以免误认通过。
- 迁移/构建与 local schema 同步范围须分别说明，不声称生产迁移验收。
- 管理员凭据和数据库不能作为 CI 产物上传。
- 远程状态及文档自身提交哈希不能在提交前伪造。

### Task 1: 交接约定与自动检查

**Files:** 修改 `AGENTS.md`、`README.md`；创建 `docs/multi-computer-development.md`、`docs/handoff.md`、`.github/pull_request_template.md`、`.github/workflows/ci.yml`、`.nvmrc`。

**Interfaces:** 消费现有 npm 脚本与 local 数据库防护；产出 PR/main 事件触发的 CI 和跨电脑交接入口。

- [x] 保存协作规则、环境基准与当前交接说明。
- [x] 配置只读 CI、临时数据库与串行核心集成测试。
- [x] 验证 YAML/actionlint、npm test、typecheck、git diff --check；全部通过（115 项单元测试）。
- [x] 新上下文复核文档与 workflow 的边界；已修正从本地 main 建分支可能夹带未发布提交的问题，改从刚获取的 origin/main 创建且不跟踪 main。
- [ ] 提交、推送任务分支，核对远程提交一致，创建 PR 并读取对应 CI 结果；不自动合并。
