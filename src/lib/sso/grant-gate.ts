import type { IdentityLink } from "./contract";
import { localPasswordLoginAllowed } from "./grant";
import { findLinkByLocalUserId } from "./supabase-ports";

export async function loadLocalIdentityLink(
  localUserId: string
): Promise<IdentityLink | null> {
  return findLinkByLocalUserId(localUserId);
}

/** True when this local account is blocked because the platform grant is off. */
export async function isPlatformGrantBlocking(localUserId: string): Promise<boolean> {
  const link = await loadLocalIdentityLink(localUserId);
  if (!link) return false;
  return !localPasswordLoginAllowed({ link });
}
