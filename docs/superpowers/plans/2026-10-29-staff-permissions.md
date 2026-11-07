# 员工权限第一批实施计划

用户已批准五角色、团队/负责人隔离、字段保护、审核分工、账号停用撤权方案并要求开始实施。当前仓库本地开发分支就地升级，保留管理员与历史数据。第二批临时授权、外部账号、AI身份、敏感操作审批不包含在本批。

## Shared contract

src/cms/access.ts owns Staff structural type {id, role?, additionalRoles?:string[]|null, active?:boolean|null, team?:number|string|{id}, contentKinds?:string[]|null}. Primary role stays backward compatible admin|operations|editor plus manager|reviewer. additionalRoles allows same five values. Existing active missing treated true; migration active true. No contentKinds = no editorial board access for new staff; migrate legacy admin/editor to all kinds. Admin bypasses scopes. Role combinations union permissions but each capability still requires its corresponding scope.
Exports hasRole(user,role), isAdmin, isOperator (admin/manager/operations), isManager, inquiryScope (admin true; manager assigned team if valid, operations owner=self AND team=current staff team (nonnull); union OR for both), providerScope same, canManageContent(user), canReviewContent(user), canAccessContentKind(user,kind), contentScope(user) returns false/true/{kind:{in:...}}.
Staff roles/status/team/contentKinds changes revoke sessions, active=false cannot login or access protected endpoints. Payload jwt strategy currently loads current DB user on every request; use this and clear sessions to invalidate old tokens. Ensure collection=staff, never trust client role values. Untrusted Local API callers always overrideAccess:false.

## Tasks

- [x] Backup dedicated local database before schema changes.
- [x] Shared role helpers, staff fields, team collection, scoped inquiry/provider access and owner/team guards, field permissions, disabled login/session revocation and migration draft instructions.
- [x] Content board scopes on drafts/history/media/tasks/preview and custom APIs, separate editor vs reviewer capabilities, last edited/submitted IDs, disallow self review unless administrator explicit reason; audit reason.
- [x] Admin UI adapts capabilities and boards, shows reason when admin self-review; team/role explanations and auth state.
- [x] Migration additive schema preserving existing data; legacy editor grants migrated, records remain unassigned; generated types and future deployment migration.
- [x] Unit and local HTTP integration authorization tests across teams/fields/history/preview/files/direct API/session revoke. Regression existing publishing/intake, build restart and verification.

## Important constraints

Business supervisor only own non-null team; unassigned records admin only unless assigned team without owner (team manager queue). Owner must active staff with operations role and same team. Only admin can change record team; manager may assign own-team operators. No employee destructive deletes in phase1 (disable staff rather than remove). Password/account provisioning remains admin only. Audit log immutable, admin only. Ordinary staff exports disabled.
Content authors may save drafts; review state frozen for edit until returned. published modification stays draft. Reviewers cannot read customer/provider private contacts. Public API unchanged. Native content-published raw body private to admin. Every custom API must enforce board scope even if Local API bypasses ACL internally. Media private access only admin or uploader/permitted content references, public published references remain readable.

## 实施裁定

新增contributors保留全部已知编辑/提交者，避免换人保存绕过自审限制。业务历史版本仅管理员可读，防止转交后历史联系方式泄露。没有安装导出功能，不向普通员工增加导出入口。管理员字段和团队权限变更立即清除账号会话；自身密码恢复沿用框架身份验证机制（当前邮件未配置），不开放公开员工注册。
