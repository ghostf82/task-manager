/**
 * Portal launch JWT (HS256). Isolated preview adapter — not a production cutover.
 *
 *   iss = hr-portal
 *   aud = hr-program:{slug}  (this app: hr-program:taskmanager)
 *   sub = platform_user_id (portal auth.users.id, UUID)
 *   slug = taskmanager
 *   jti = one-time
 *   exp-iat ≤ 60s
 *
 * Form POST {origin}/auth/hr-launch  field launch_token
 * Email/username are never the join key. Passwords are never copied.
 */

export const PROGRAM_SLUG = "taskmanager" as const;
export const PORTAL_ISSUER = "hr-portal" as const;
export const PROGRAM_AUDIENCE = `hr-program:${PROGRAM_SLUG}` as const;
export const LAUNCH_PATH = "/auth/hr-launch" as const;
export const LAUNCH_TOKEN_FIELD = "launch_token" as const;
export const LEAST_PRIVILEGE_LOCAL_ROLE = "employee" as const;
export const DEFAULT_JWT_MAX_TTL_SECONDS = 60;
export const SYNTHETIC_EMAIL_DOMAIN = "sso.taskmanager.local";

export const ACTIVE_LINK_STATUSES = ["linked", "provisioned"] as const;

export type IdentityLinkStatus =
  | "none"
  | "suggested"
  | "linked"
  | "provisioned"
  | "not_ready"
  | "revoked";

export type LaunchErrorCode =
  | "unconfigured"
  | "missing_token"
  | "invalid"
  | "expired"
  | "replay"
  | "grant"
  | "conflict"
  | "failed";

export type LaunchJwtClaims = {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
  jti: string;
  slug: typeof PROGRAM_SLUG;
  program: typeof PROGRAM_SLUG;
  /** Portal launch tokens omit this; issuance implies grant. Explicit false is a revoke token. */
  grant: boolean;
  /** Display only. Never used to find or merge a local account. */
  email?: string;
  /** Display only. */
  name?: string;
};

export type IdentityLink = {
  platformUserId: string;
  localUserId: string;
  localRole: string;
  linkStatus: IdentityLinkStatus;
  grantActive: boolean;
  suggestedBy: "jit" | "manual" | null;
};

export type JitUserSpec = {
  platformUserId: string;
  displayName?: string;
  email: string;
  localRole: typeof LEAST_PRIVILEGE_LOCAL_ROLE;
  isSuperAdmin: false;
  mustChangePassword: false;
  copyPassword: false;
  joinKey: "platform_user_id";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPlatformUserId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function leastPrivilegeLocalRole(): typeof LEAST_PRIVILEGE_LOCAL_ROLE {
  return LEAST_PRIVILEGE_LOCAL_ROLE;
}

export function isPrivilegedLocalRole(role: string): boolean {
  return /^(admin|super_admin|owner|manager|tenant_admin)$/i.test(role.trim());
}

export function isActiveLinkStatus(status: string): boolean {
  return (ACTIVE_LINK_STATUSES as readonly string[]).includes(status);
}

export function syntheticSsoEmail(platformUserId: string): string {
  return `sso.${platformUserId.replace(/-/g, "").toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function audienceList(aud: string | string[] | undefined): string[] {
  if (!aud) return [];
  return Array.isArray(aud) ? aud : [aud];
}

export function programAudience(slug: string = PROGRAM_SLUG): `hr-program:${string}` {
  return `hr-program:${slug}`;
}

export const LOCAL_ACCOUNT_TAKEN_MESSAGE =
  "هذا الحساب المحلي مرتبط بهوية مركزية أخرى.";
