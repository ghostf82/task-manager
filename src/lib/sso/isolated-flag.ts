/** Isolated loopback cookie. Edge-safe (no Node-only imports). */
export const ISOLATED_COOKIE = "tm_sso";

export const ISOLATED_COOKIE_CLEAR = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  maxAge: 0,
};

export function isolatedLoopbackEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.HR_IAM_ISOLATED_LOOPBACK === "1";
}

export type IsolatedAuthDecision = "next" | "login" | "dashboard";

type PeekRuntime = {
  cookies: Map<string, string>;
  state: {
    sessions: Set<string>;
    links: Array<{
      localUserId: string | null;
      grantActive: boolean;
      linkStatus: string;
    }>;
  };
};

/**
 * Look up a SID in this isolate's maps. Does not create a runtime.
 * `"unknown"` = maps are not in this isolate (Edge vs Node) — do not expire a
 * cookie that the Node server may still hold.
 */
export function peekIsolatedSidLive(sid: string | undefined): boolean | "unknown" {
  if (!sid?.trim()) return false;
  const runtime = (globalThis as { __tmIsolatedLoopback?: PeekRuntime }).__tmIsolatedLoopback;
  if (!runtime) return "unknown";
  const localUserId = runtime.cookies.get(sid.trim());
  if (!localUserId || !runtime.state.sessions.has(localUserId)) return false;
  const link = runtime.state.links.find((row) => row.localUserId === localUserId);
  if (link && (link.grantActive === false || link.linkStatus === "revoked")) return false;
  return true;
}

/**
 * Isolated routing must match requireSession.
 * live true = SID in memory. live false = known stale (clear cookie, allow /login).
 * live unknown + cookie = Edge isolate; allow /dashboard, never bounce /login.
 */
export function isolatedAuthDecision(input: {
  pathname: string;
  tmSso: string | undefined;
  live?: boolean | "unknown";
}): IsolatedAuthDecision {
  const cookie = Boolean(input.tmSso?.trim());
  const live = input.live ?? (cookie ? "unknown" : false);

  if (live === false) {
    if (input.pathname.startsWith("/dashboard") || input.pathname === "/update-password") {
      return "login";
    }
    return "next";
  }

  if (live === true) {
    if (input.pathname === "/update-password") return "next";
    if (input.pathname === "/login" || input.pathname === "/") return "dashboard";
    return "next";
  }

  return "next";
}
