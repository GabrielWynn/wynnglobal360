// ---------------------------------------------------------------------------
// User roles — the values allowed in ifas.role.
// Dependency-free so it can be imported from both server and client code.
// ---------------------------------------------------------------------------

export const USER_ROLES = ["admin", "ifa", "compliance"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return (USER_ROLES as readonly unknown[]).includes(value);
}
