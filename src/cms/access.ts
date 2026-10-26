export type Staff = { id: number | string; role?: string } | null | undefined;
export function isAdmin(user: Staff): boolean {
  return user?.role === "admin";
}
export function isOperator(user: Staff): boolean {
  return isAdmin(user) || user?.role === "operations";
}
export function inquiryScope(
  user: Staff,
): boolean | { owner: { equals: string | number } } {
  if (isAdmin(user)) return true;
  return user?.role === "operations" ? { owner: { equals: user.id } } : false;
}
