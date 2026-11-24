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

export function applyPlatformRevoke(link: IdentityLink): IdentityLink {
  return {
    ...link,
    grantActive: false,
  };
}

export function applyPlatformGrant(link: IdentityLink): IdentityLink {
  if (link.linkStatus === "revoked") {
    return { ...link, grantActive: false };
  }
  return { ...link, grantActive: true };
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
