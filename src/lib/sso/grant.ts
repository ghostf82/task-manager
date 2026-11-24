import { isActiveLinkStatus, type IdentityLink } from "./contract";

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
  if (!input.link.grantActive) return false;
  if (input.link.linkStatus === "revoked") return false;
  return isActiveLinkStatus(input.link.linkStatus);
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

/** Password fallback is refused once the platform grant is off. */
export function localPasswordLoginAllowed(input: {
  link: IdentityLink | null;
  platformGrant?: boolean;
}): boolean {
  if (!input.link) return true;
  const grant = input.platformGrant ?? input.link.grantActive;
  return canOpenFromPlatformGrant({ link: input.link, platformGrant: grant });
}
