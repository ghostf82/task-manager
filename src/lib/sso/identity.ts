import {
  LOCAL_ACCOUNT_TAKEN_MESSAGE,
  isActiveLinkStatus,
  isPlatformUserId,
  type IdentityLink,
} from "./contract";

/**
 * Resolve the local account for a launch. Email/username matches never auto-link.
 */
export function resolveLinkForLaunch(input: {
  platformUserId: string;
  jwtEmail?: string | null;
  links: readonly IdentityLink[];
  localUsersByEmail?: ReadonlyMap<string, string>;
}): IdentityLink | null {
  if (!isPlatformUserId(input.platformUserId)) return null;
  const bySub = input.links.find(
    (l) => l.platformUserId === input.platformUserId && isActiveLinkStatus(l.linkStatus)
  );
  if (bySub) return bySub;

  const email = String(input.jwtEmail || "")
    .trim()
    .toLowerCase();
  if (email && input.localUsersByEmail?.has(email)) {
    return null;
  }
  return null;
}

export function assertLocalAccountAvailable(
  links: readonly IdentityLink[],
  localUserId: string,
  platformUserId: string
): void {
  const taken = links.find(
    (l) =>
      l.localUserId === localUserId &&
      isActiveLinkStatus(l.linkStatus) &&
      l.platformUserId !== platformUserId
  );
  if (taken) throw new Error(LOCAL_ACCOUNT_TAKEN_MESSAGE);
}

export function suggestEmailMatch(input: {
  jwtEmail?: string | null;
  localUsersByEmail: ReadonlyMap<string, string>;
}): { localUserId: string; autoLinked: false } | null {
  const email = String(input.jwtEmail || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  const localUserId = input.localUsersByEmail.get(email);
  if (!localUserId) return null;
  return { localUserId, autoLinked: false };
}
