import { getValidatedSupabasePublicEnv } from "@/lib/supabase/public-env";

/**
 * Mint a GoTrue session only for the linked auth user id.
 * `public.users.email` is ignored — it is caller-writable and must not select the session.
 */
export function resolveAuthSessionMint(input: {
  localUserId: string;
  authUser: { id: string; email?: string | null } | null | undefined;
  profileEmail?: string | null;
}): { localUserId: string; authEmail: string } {
  void input.profileEmail;
  const authUserId = input.authUser?.id?.trim() ?? "";
  const authEmail = input.authUser?.email?.trim() ?? "";
  if (!authUserId || authUserId !== input.localUserId || !authEmail) {
    throw new Error("session mint requires linked auth user id");
  }
  return { localUserId: authUserId, authEmail };
}

type RpcError = { code?: string; message?: string } | null;

type AdminRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => unknown;
};

/**
 * auth.admin.signOut() requires a session JWT, not a user UUID.
 * Delete GoTrue sessions/refresh tokens by user id (RPC, then admin REST).
 */
export async function revokeSessionsForUserId(
  admin: AdminRpc,
  localUserId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const { error } = (await admin.rpc("sso_revoke_local_sessions", {
    p_user: localUserId,
  })) as { error: RpcError };
  if (!error) return;

  const { url } = getValidatedSupabasePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(error.message || "session revoke failed");
  }
  const res = await fetchImpl(
    `${url.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(localUserId)}/sessions`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
    }
  );
  // 404 means the admin sessions route is missing, not that the user has no sessions.
  if (!res.ok) {
    throw new Error(`session revoke failed: ${res.status} (${error.message})`);
  }
}
