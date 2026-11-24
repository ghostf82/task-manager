import { randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  leastPrivilegeLocalRole,
  type IdentityLink,
  type IdentityLinkStatus,
} from "./contract";
import type { SsoPorts } from "./consume";
import type { IdentityLinkLookup } from "./lookup";
import { revokeSessionsForUserId } from "./sessions";

type LinkRow = {
  platform_user_id: string;
  local_user_id: string;
  local_role: string;
  link_status: IdentityLinkStatus;
  grant_active: boolean;
  suggested_by: "jit" | "manual" | null;
};

function fromRow(row: LinkRow): IdentityLink {
  return {
    platformUserId: row.platform_user_id,
    localUserId: row.local_user_id,
    localRole: row.local_role,
    linkStatus: row.link_status,
    grantActive: row.grant_active,
    suggestedBy: row.suggested_by,
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
  };
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

export function createSupabaseSsoPorts(): SsoPorts {
  const admin = createAdminClient();

  return {
    async findLinkByPlatformUserId(platformUserId) {
      const { data, error } = await admin
        .from("platform_identity_links")
        .select(
          "platform_user_id, local_user_id, local_role, link_status, grant_active, suggested_by"
        )
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
        .select(
          "platform_user_id, local_user_id, local_role, link_status, grant_active, suggested_by"
        );
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return (data as LinkRow[] | null)?.map(fromRow) ?? [];
    },

    async saveLink(link) {
      const row = toRow(link);
      const { error } = await admin.from("platform_identity_links").upsert(row, {
        onConflict: "platform_user_id",
      });
      if (error) throw error;
      await admin
        .from("platform_identity_links")
        .update({ last_launch_at: new Date().toISOString() })
        .eq("platform_user_id", link.platformUserId);
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
      const { data: profile, error: profileErr } = await admin
        .from("users")
        .select("email")
        .eq("id", localUserId)
        .maybeSingle();
      if (profileErr || !profile?.email) {
        throw profileErr ?? new Error("local user missing");
      }
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
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
    },

    async signOutLocal(localUserId) {
      await revokeSessionsForUserId(admin, localUserId);
    },

    async checkLiveGrant(platformUserId) {
      const raw = process.env.PLATFORM_SSO_GRANT_URL?.trim();
      if (!raw) return null;
      const url = new URL(raw);
      url.searchParams.set("sub", platformUserId);
      url.searchParams.set("program", "taskmanager");
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (!res.ok) return false;
      const body = (await res.json()) as { grant?: unknown };
      return body.grant === true;
    },
  };
}

export async function lookupLinkByLocalUserId(
  localUserId: string
): Promise<IdentityLinkLookup> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_identity_links")
      .select(
        "platform_user_id, local_user_id, local_role, link_status, grant_active, suggested_by"
      )
      .eq("local_user_id", localUserId)
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error)) {
        return process.env.PLATFORM_SSO_ENABLED === "true"
          ? { status: "unavailable", reason: "identity_links table missing" }
          : { status: "missing" };
      }
      return { status: "unavailable", reason: error.message || "identity_links query failed" };
    }
    return data ? { status: "found", link: fromRow(data as LinkRow) } : { status: "missing" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "identity_links lookup failed";
    if (
      process.env.PLATFORM_SSO_ENABLED !== "true" &&
      /Missing SUPABASE_SERVICE_ROLE_KEY/i.test(message)
    ) {
      return { status: "missing" };
    }
    return { status: "unavailable", reason: message };
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
