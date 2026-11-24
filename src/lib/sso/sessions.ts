import { getValidatedSupabasePublicEnv } from "@/lib/supabase/public-env";

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
  if (!res.ok && res.status !== 404) {
    throw new Error(`session revoke failed: ${res.status} (${error.message})`);
  }
}
