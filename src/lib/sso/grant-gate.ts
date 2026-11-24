import type { IdentityLink } from "./contract";
import { isPlatformGrantBlockingFromLookup } from "./lookup";
import { lookupLinkByLocalUserId } from "./supabase-ports";

export async function loadLocalIdentityLink(
  localUserId: string
): Promise<IdentityLink | null> {
  const lookup = await lookupLinkByLocalUserId(localUserId);
  return lookup.status === "found" ? lookup.link : null;
}

/** True when this local account is blocked because the platform grant is off or lookup failed. */
export async function isPlatformGrantBlocking(localUserId: string): Promise<boolean> {
  return isPlatformGrantBlockingFromLookup(await lookupLinkByLocalUserId(localUserId));
}
