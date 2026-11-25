import { isActiveLinkStatus, leastPrivilegeLocalRole, type IdentityLink } from "./contract";

/**
 * Direct URL / leftover local session is not enough. Platform grant is the gate.
 * Revoke keeps the identity row (historical local data) and sets canOpen false.
 */
export function canOpenFromPlatformGrant(input: {
  link: IdentityLink | null;
  platformGrant: boolean;
}): boolean {
  if (!input.platformGrant) return false;
  if (!input.link) return false;
  if (!input.link.localUserId) return false;
  if (!input.link.grantActive) return false;
  if (input.link.linkStatus === "revoked") return false;
  return isActiveLinkStatus(input.link.linkStatus);
}

/** Persist revoke for a platform_user_id that has never launched (no local user). */
export function revokedPlatformTombstone(
  platformUserId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): IdentityLink {
  return {
    platformUserId,
    localUserId: null,
    localRole: leastPrivilegeLocalRole(),
    linkStatus: "none",
    grantActive: false,
    suggestedBy: null,
    revokedAt: nowSeconds,
  };
}

export function applyPlatformRevoke(
  link: IdentityLink,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): IdentityLink {
  return {
    ...link,
    grantActive: false,
    revokedAt: nowSeconds,
  };
}

/**
 * After a revoke write that CASed on `revoked_at`: keep a concurrent grant
 * restore; drop the session only if the row is still revoked.
 */
export function resolveRevokeWriteAfterCas(input: {
  snapshot: IdentityLink;
  wrote: boolean;
  live: IdentityLink | null;
}): { link: IdentityLink; dropSession: boolean } {
  if (input.wrote) {
    return { link: applyPlatformRevoke(input.snapshot), dropSession: true };
  }
  const live = input.live;
  if (live && live.grantActive && live.linkStatus !== "revoked") {
    return { link: live, dropSession: false };
  }
  if (live) {
    return {
      link: live.grantActive ? applyPlatformRevoke(live) : live,
      dropSession: true,
    };
  }
  return { link: applyPlatformRevoke(input.snapshot), dropSession: true };
}

export function applyPlatformGrant(link: IdentityLink): IdentityLink {
  if (link.linkStatus === "revoked") {
    return { ...link, grantActive: false };
  }
  return { ...link, grantActive: true, revokedAt: null };
}

/**
 * Unused JWTs issued before the persisted revoke cannot restore access.
 * `link_status=revoked` still needs an admin re-link.
 */
export function grantBlockedByStaleLaunch(link: IdentityLink, iat: number): boolean {
  if (link.linkStatus === "revoked") return true;
  if (link.revokedAt != null && iat < link.revokedAt) return true;
  return false;
}

/** Portal live check: membership must be active AND program grant true. */
export function livePlatformAllowsAccess(body: {
  grant?: unknown;
  granted?: unknown;
  membership?: unknown;
  active?: unknown;
  disabled?: unknown;
}): boolean {
  if (body.disabled === true) return false;
  if (body.membership === false || body.active === false) return false;
  if (body.grant === false || body.granted === false) return false;
  return body.grant === true || body.granted === true;
}

/**
 * HTTP/JSON failures are unknown — deny the session, do not persist revoke.
 * Persist `grant_active=false` / `revoked_at` only on confirmed false (or grant=false JWT).
 */
export type LiveGrantDecision =
  | { status: "skipped" }
  | { status: "unknown" }
  | { status: "confirmed"; granted: boolean };

export function interpretLiveGrantResponse(input: {
  httpOk: boolean;
  body: unknown;
}): LiveGrantDecision {
  if (!input.httpOk) return { status: "unknown" };
  if (!input.body || typeof input.body !== "object" || Array.isArray(input.body)) {
    return { status: "unknown" };
  }
  const body = input.body as Record<string, unknown>;
  if (typeof body.grant !== "boolean" && typeof body.granted !== "boolean") {
    return { status: "unknown" };
  }
  return {
    status: "confirmed",
    granted: livePlatformAllowsAccess(body),
  };
}

/** Password fallback is refused once the platform grant is off. */
export function localPasswordLoginAllowed(input: {
  link: IdentityLink | null;
  platformGrant?: boolean;
}): boolean {
  if (!input.link) return true;
  const grant = input.platformGrant ?? input.link.grantActive;
  return canOpenFromPlatformGrant({ link: input.link, platformGrant: grant });
}
