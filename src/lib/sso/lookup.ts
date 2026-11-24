import type { IdentityLink } from "./contract";
import { localPasswordLoginAllowed } from "./grant";

export type IdentityLinkLookup =
  | { status: "found"; link: IdentityLink; dropSession?: boolean }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

export type RelationError = { code?: string; message?: string };

/**
 * PostgREST/Postgres "table is not in this database":
 * 42P01 (undefined_table) and PGRST205 (schema cache miss).
 * Not permission, network, or row-level failures.
 */
export function isMissingRelation(error: RelationError | null | undefined): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205") return true;
  const message = error.message ?? "";
  return /could not find the table|relation .+ does not exist/i.test(message);
}

/**
 * Missing adapter tables with SSO off → unlinked (password login still works).
 * Fail-closed when SSO is on, or when the table exists and the query fails.
 */
export function classifyIdentityLinkQueryError(
  error: RelationError,
  ssoEnabled: boolean
): IdentityLinkLookup {
  if (isMissingRelation(error) && !ssoEnabled) {
    return { status: "missing" };
  }
  const reason = isMissingRelation(error)
    ? "identity_links table missing"
    : error.message || "identity_links query failed";
  return { status: "unavailable", reason };
}

/** Unexpected lookup failures deny access. Confirmed missing links do not. */
export function isPlatformGrantBlockingFromLookup(
  lookup: IdentityLinkLookup
): boolean {
  if (lookup.status === "unavailable") return true;
  if (lookup.status === "missing") return false;
  if (lookup.dropSession) return true;
  return !localPasswordLoginAllowed({ link: lookup.link });
}
