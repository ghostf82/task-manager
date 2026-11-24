import type { IdentityLink } from "./contract";
import { localPasswordLoginAllowed } from "./grant";

export type IdentityLinkLookup =
  | { status: "found"; link: IdentityLink }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

/** Unexpected lookup failures deny access. Confirmed missing links do not. */
export function isPlatformGrantBlockingFromLookup(
  lookup: IdentityLinkLookup
): boolean {
  if (lookup.status === "unavailable") return true;
  if (lookup.status === "missing") return false;
  return !localPasswordLoginAllowed({ link: lookup.link });
}
