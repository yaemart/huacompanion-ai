import type { Where } from "payload";
/** Shared server-side staff capabilities. JWT authentication loads these from the DB. */
export type Staff =
  | {
      id: number | string;
      collection?: string;
      role?: string;
      additionalRoles?: string[] | null;
      active?: boolean | null;
      team?: number | string | { id: number | string } | null;
      contentKinds?: string[] | null;
    }
  | null
  | undefined;
export const staffRoles = ["admin", "manager", "operations", "editor", "reviewer"] as const;
export const contentKinds = [
  "service",
  "guide",
  "faq",
  "page",
  "partner",
  "provider-profile",
  "service-project",
  "exhibition",
  "institution",
  "venue",
  "activity",
] as const;
export function relationID(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "id" in value) return relationID(value.id);
  return undefined;
}
export function isActiveStaff(user: Staff): boolean {
  return !!user && user.active !== false && (!user.collection || user.collection === "staff");
}
export function hasRole(user: Staff, role: string): boolean {
  return isActiveStaff(user) && (user!.role === role || !!user!.additionalRoles?.includes(role));
}
export const isAdmin = (user: Staff): boolean => hasRole(user, "admin");
export const isManager = (user: Staff): boolean => isAdmin(user) || hasRole(user, "manager");
export const isOperator = (user: Staff): boolean => isManager(user) || hasRole(user, "operations");
type Scope = boolean | Where;
export function inquiryScope(user: Staff): Scope {
  if (isAdmin(user)) return true;
  const scopes: Where[] = [];
  const team = relationID(user?.team);
  if (hasRole(user, "manager") && team !== undefined) scopes.push({ team: { equals: team } });
  if (hasRole(user, "operations") && team !== undefined)
    scopes.push({ and: [{ owner: { equals: user!.id } }, { team: { equals: team } }] });
  return scopes.length > 1 ? { or: scopes } : scopes[0] || false;
}
export const providerScope = inquiryScope;
export const canManageContent = (user: Staff): boolean =>
  isAdmin(user) || hasRole(user, "editor") || hasRole(user, "reviewer");
export const canReviewContent = (user: Staff): boolean =>
  isAdmin(user) || hasRole(user, "reviewer");
export function canAccessContentKind(user: Staff, kind: string): boolean {
  return (
    isAdmin(user) ||
    ((canManageContent(user) || canReviewContent(user)) &&
      contentKinds.includes(kind as (typeof contentKinds)[number]) &&
      !!user?.contentKinds?.includes(kind))
  );
}
export function contentScope(user: Staff): boolean | { kind: { in: string[] } } {
  if (isAdmin(user)) return true;
  const kinds = contentKinds.filter((kind) => canAccessContentKind(user, kind));
  return kinds.length ? { kind: { in: kinds } } : false;
}
