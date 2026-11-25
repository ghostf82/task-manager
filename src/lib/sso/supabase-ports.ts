import { randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { decideAccessSignals, fetchPortalAccessSignals } from "./access-signals";
import {
  PROGRAM_SLUG,
  leastPrivilegeLocalRole,
  type IdentityLink,
  type IdentityLinkStatus,
} from "./contract";
import type { SsoPorts } from "./consume";
import {
  applyPlatformRevoke,
  interpretLiveGrantResponse,
  resolveRevokeWriteAfterCas,
  type LiveGrantDecision,
} from "./grant";
import { resolveAuthSessionMint } from "./sessions";
import {
  classifyIdentityLinkQueryError,
  isMissingRelation,
  type IdentityLinkLookup,
} from "./lookup";
import { revokeSessionsForUserId } from "./sessions";

type LinkRow = {
  platform_user_id: string;
  local_user_id: string | null;
  local_role: string;
  link_status: IdentityLinkStatus;
  grant_active: boolean;
  suggested_by: "jit" | "manual" | null;
  revoked_at: string | null;
};

const LINK_COLUMNS =
  "platform_user_id, local_user_id, local_role, link_status, grant_active, suggested_by, revoked_at";

function fromRow(row: LinkRow): IdentityLink {
  return {
    platformUserId: row.platform_user_id,
    localUserId: row.local_user_id,
    localRole: row.local_role,
    linkStatus: row.link_status,
    grantActive: row.grant_active,
    suggestedBy: row.suggested_by,
    revokedAt: row.revoked_at ? Math.floor(Date.parse(row.revoked_at) / 1000) : null,
  };
}

function toRow(link: IdentityLink): LinkRow {
  return {
    platform_user_id: link.platformUserId,
    local_user_id: link.localUserId,
    local_role: link.localRole || leastPrivilegeLocalRole(),
    link_status: link.linkStatus,
    grant_active: link.grantActive,
    suggested_by: link.suggestedBy,
    revoked_at:
      link.revokedAt != null ? new Date(link.revokedAt * 1000).toISOString() : null,
  };
}

function ssoEnabled(): boolean {
  return process.env.PLATFORM_SSO_ENABLED === "true";
}

async function persistRevokeCas(
  admin: ReturnType<typeof createAdminClient>,
  link: IdentityLink
): Promise<{ link: IdentityLink; dropSession: boolean }> {
  const disabled = applyPlatformRevoke(link);
  const row = toRow(disabled);
  let update = admin
    .from("platform_identity_links")
    .update(row)
    .eq("platform_user_id", link.platformUserId);
  update =
    link.revokedAt == null
      ? update.is("revoked_at", null)
      : update.eq("revoked_at", new Date(link.revokedAt * 1000).toISOString());
  const { data: written, error } = await update.select(LINK_COLUMNS);
  if (error) throw error;
  const wrote = Boolean(written?.length);
  let live: IdentityLink | null = wrote ? fromRow(written![0] as LinkRow) : null;
  if (!wrote) {
    const { data: current, error: readErr } = await admin
      .from("platform_identity_links")
      .select(LINK_COLUMNS)
      .eq("platform_user_id", link.platformUserId)
      .maybeSingle();
    if (readErr && !isMissingRelation(readErr)) throw readErr;
    live = current ? fromRow(current as LinkRow) : null;
  }
  const resolved = resolveRevokeWriteAfterCas({
    snapshot: link,
    wrote,
    live,
  });
  if (resolved.dropSession && resolved.link.localUserId) {
    await revokeSessionsForUserId(admin, resolved.link.localUserId);
  }
  return resolved;
}

async function fetchLiveGrant(platformUserId: string): Promise<LiveGrantDecision> {
  const raw = process.env.PLATFORM_SSO_GRANT_URL?.trim();
  if (!raw) return { status: "skipped" };
  try {
    const url = new URL(raw);
    url.searchParams.set("sub", platformUserId);
    url.searchParams.set("program", PROGRAM_SLUG);
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { status: "unknown" };
    }
    return interpretLiveGrantResponse({ httpOk: res.ok, body });
  } catch {
    return { status: "unknown" };
  }
}

export function createSupabaseSsoPorts(): SsoPorts {
  const admin = createAdminClient();

  return {
    async findLinkByPlatformUserId(platformUserId) {
      const { data, error } = await admin
        .from("platform_identity_links")
        .select(LINK_COLUMNS)
        .eq("platform_user_id", platformUserId)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error)) return null;
        throw error;
      }
      return data ? fromRow(data as LinkRow) : null;
    },

    async listLinks() {
      const { data, error } = await admin
        .from("platform_identity_links")
        .select(LINK_COLUMNS);
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return (data as LinkRow[] | null)?.map(fromRow) ?? [];
    },

    async saveLink(link, cas) {
      const row = toRow(link);
      const { data: current, error: readErr } = await admin
        .from("platform_identity_links")
        .select(LINK_COLUMNS)
        .eq("platform_user_id", link.platformUserId)
        .maybeSingle();
      if (readErr && !isMissingRelation(readErr)) throw readErr;
      if (current) {
        const existing = fromRow(current as LinkRow);
        if (existing.localUserId && existing.localUserId !== link.localUserId) {
          return "exists";
        }
        if (link.grantActive && cas) {
          const actual = existing.revokedAt ?? null;
          if (actual !== cas.expectedRevokedAt || existing.linkStatus === "revoked") {
            return "stale";
          }
        }
        let update = admin
          .from("platform_identity_links")
          .update({ ...row, last_launch_at: new Date().toISOString() })
          .eq("platform_user_id", link.platformUserId);
        update = existing.localUserId
          ? update.eq("local_user_id", existing.localUserId)
          : update.is("local_user_id", null);
        if (link.grantActive && cas) {
          update =
            cas.expectedRevokedAt == null
              ? update.is("revoked_at", null)
              : update.eq(
                  "revoked_at",
                  new Date(cas.expectedRevokedAt * 1000).toISOString()
                );
          update = update.neq("link_status", "revoked");
        }
        const { data: written, error } = await update.select("platform_user_id");
        if (error) throw error;
        if (!written?.length) return "stale";
        return "ok";
      }
      const { error } = await admin.from("platform_identity_links").insert(row);
      if (error) {
        if (error.code === "23505") return "exists";
        throw error;
      }
      await admin
        .from("platform_identity_links")
        .update({ last_launch_at: new Date().toISOString() })
        .eq("platform_user_id", link.platformUserId);
      return "ok";
    },

    async consumeJti(jti, expiresAtSeconds) {
      const { error } = await admin.from("platform_sso_jti").insert({
        jti,
        expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
      });
      if (error) {
        if (error.code === "23505") return "replay";
        if (isMissingRelation(error)) throw error;
        throw error;
      }
      return "ok";
    },

    async createLocalUser(spec) {
      if (spec.copyPassword) {
        throw new Error("SSO JIT refuses password copy");
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: spec.email,
        password: randomBytes(32).toString("base64url"),
        email_confirm: true,
        user_metadata: {
          platform_user_id: spec.platformUserId,
          provisioned_by: "portal_sso",
        },
      });
      if (error || !data.user) {
        throw error ?? new Error("createUser failed");
      }
      const { error: profileErr } = await admin
        .from("users")
        .update({
          email: spec.email,
          full_name: spec.displayName ?? null,
          must_change_password: false,
          is_super_admin: false,
        })
        .eq("id", data.user.id);
      if (profileErr) throw profileErr;
      return { localUserId: data.user.id, email: spec.email };
    },

    async openSession(localUserId) {
      const { data: authData, error: authErr } = await admin.auth.admin.getUserById(
        localUserId
      );
      const mint = resolveAuthSessionMint({
        localUserId,
        authUser: authErr ? null : authData.user,
      });
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: mint.authEmail,
      });
      if (linkErr || !link?.properties?.hashed_token) {
        throw linkErr ?? new Error("generateLink failed");
      }
      const supabase = await createClient();
      const { error: otpErr } = await supabase.auth.verifyOtp({
        type: "email",
        token_hash: link.properties.hashed_token,
      });
      if (otpErr) throw otpErr;
      const { data: sessionUser, error: sessionErr } = await supabase.auth.getUser();
      if (sessionErr || sessionUser.user?.id !== mint.localUserId) {
        await supabase.auth.signOut();
        throw sessionErr ?? new Error("session subject mismatch");
      }
    },

    async signOutLocal(localUserId) {
      await revokeSessionsForUserId(admin, localUserId);
    },

    async checkLiveGrant(platformUserId) {
      return fetchLiveGrant(platformUserId);
    },

    async pollAccessSignals(platformUserId) {
      return fetchPortalAccessSignals(platformUserId);
    },
  };
}

export async function lookupLinkByLocalUserId(
  localUserId: string,
  opts?: { sessionStartedAt?: string | null }
): Promise<IdentityLinkLookup> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_identity_links")
      .select(LINK_COLUMNS)
      .eq("local_user_id", localUserId)
      .maybeSingle();
    if (error) {
      return classifyIdentityLinkQueryError(error, ssoEnabled());
    }
    if (!data) return { status: "missing" };
    const link = fromRow(data as LinkRow);
    if (ssoEnabled()) {
      const live = await fetchLiveGrant(link.platformUserId);
      if (live.status === "unknown") {
        return { status: "unavailable", reason: "live grant unknown" };
      }
      if (live.status === "confirmed" && live.granted === false) {
        const resolved = await persistRevokeCas(admin, link);
        return {
          status: "found",
          link: resolved.link,
          dropSession: resolved.dropSession,
        };
      }
      const poll = await fetchPortalAccessSignals(
        link.platformUserId,
        process.env,
        fetch,
        opts?.sessionStartedAt
      );
      const decision = decideAccessSignals(poll, {
        sessionStartedAt: opts?.sessionStartedAt,
      });
      if (decision.action === "deny") {
        if (decision.persistRevoke) {
          const resolved = await persistRevokeCas(admin, link);
          return {
            status: "found",
            link: resolved.link,
            dropSession: resolved.dropSession,
          };
        }
        if (link.localUserId) {
          await revokeSessionsForUserId(admin, link.localUserId);
        }
        return { status: "found", link, dropSession: true };
      }
    }
    return { status: "found", link };
  } catch (err) {
    const shaped = {
      code:
        typeof err === "object" && err && "code" in err
          ? String((err as { code?: unknown }).code ?? "")
          : undefined,
      message: err instanceof Error ? err.message : String(err),
    };
    if (isMissingRelation(shaped)) {
      return classifyIdentityLinkQueryError(shaped, ssoEnabled());
    }
    if (!ssoEnabled() && /Missing SUPABASE_SERVICE_ROLE_KEY/i.test(shaped.message)) {
      return { status: "missing" };
    }
    return { status: "unavailable", reason: shaped.message || "identity_links lookup failed" };
  }
}

/** @deprecated use lookupLinkByLocalUserId — unexpected errors must not look like a missing link. */
export async function findLinkByLocalUserId(
  localUserId: string
): Promise<IdentityLink | null> {
  const lookup = await lookupLinkByLocalUserId(localUserId);
  if (lookup.status === "found") return lookup.link;
  if (lookup.status === "unavailable") {
    throw new Error(lookup.reason);
  }
  return null;
}
