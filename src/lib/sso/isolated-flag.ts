/** Isolated loopback cookie. Edge-safe (no Node-only imports). */
export const ISOLATED_COOKIE = "tm_sso";

export const ISOLATED_COOKIE_CLEAR = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  maxAge: 0,
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function envTruthy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function looksLikeNetlifyUrl(value: string | undefined): boolean {
  return /netlify\.(app|com)/i.test(value ?? "");
}

/** Netlify / hosted preview / production — never isolated memory sessions. */
export function isolatedLoopbackRemotePlatform(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (envTruthy(env.NETLIFY) || envTruthy(env.NETLIFY_DEV)) return true;
  const context = (env.CONTEXT ?? "").trim().toLowerCase();
  if (
    context === "production" ||
    context === "deploy-preview" ||
    context === "branch-deploy"
  ) {
    return true;
  }
  return (
    looksLikeNetlifyUrl(env.URL) ||
    looksLikeNetlifyUrl(env.DEPLOY_PRIME_URL) ||
    looksLikeNetlifyUrl(env.DEPLOY_URL) ||
    looksLikeNetlifyUrl(env.SITE_URL) ||
    looksLikeNetlifyUrl(env.NEXT_PUBLIC_SITE_URL)
  );
}

export function isIsolatedLoopbackHost(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  let host = raw.trim().toLowerCase();
  if (host.startsWith("[") && host.includes("]")) {
    host = host.slice(1, host.indexOf("]"));
  } else if (host.includes(":") && !host.includes("::")) {
    host = host.split(":")[0] ?? host;
  }
  return LOOPBACK_HOSTS.has(host);
}

function isTestRuntime(env: NodeJS.ProcessEnv): boolean {
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  return nodeEnv === "test" || envTruthy(env.VITEST);
}

export type IsolatedHostHeaders = {
  get(name: string): string | null;
};

/**
 * Fail-closed host from the incoming request. A public Host or
 * X-Forwarded-Host wins over loopback so spoofed 127.0.0.1 cannot enable.
 */
export function isolatedLoopbackHostFromHeaders(
  headers: IsolatedHostHeaders | null | undefined
): string | undefined {
  if (!headers) return undefined;
  const candidates = [headers.get("host"), headers.get("x-forwarded-host")?.split(",")[0]]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return undefined;
  return candidates.find((value) => !isIsolatedLoopbackHost(value)) ?? candidates[0];
}

function resolveIsolatedHost(
  hostOrHeaders?: string | IsolatedHostHeaders
): string | undefined {
  if (hostOrHeaders == null) return undefined;
  if (typeof hostOrHeaders === "string") return hostOrHeaders;
  return isolatedLoopbackHostFromHeaders(hostOrHeaders);
}

/**
 * In-memory `tm_sso` bypasses GoTrue. Enable only for Vitest / NODE_ENV=test
 * or an explicit loopback host. Never on production or Netlify (TM-1).
 * Callers must pass the incoming Host (middleware `request.headers`, RSC `headers()`).
 * Omitting host outside test is fail-closed (false).
 */
export function isolatedLoopbackEnabled(
  env: NodeJS.ProcessEnv = process.env,
  hostOrHeaders?: string | IsolatedHostHeaders
): boolean {
  const host = resolveIsolatedHost(hostOrHeaders);
  if (env.HR_IAM_ISOLATED_LOOPBACK !== "1") return false;
  if (isolatedLoopbackRemotePlatform(env)) return false;
  if ((env.NODE_ENV ?? "").trim().toLowerCase() === "production") return false;
  if (host !== undefined && !isIsolatedLoopbackHost(host)) return false;
  if (isTestRuntime(env)) return true;
  return (
    isIsolatedLoopbackHost(env.HR_IAM_ISOLATED_HOST) ||
    isIsolatedLoopbackHost(host)
  );
}

/** Same gate for middleware / route handlers (Host header, then nextUrl). */
export function isolatedLoopbackEnabledForRequest(
  request: { headers: IsolatedHostHeaders; nextUrl: { hostname: string } },
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const fromHeaders = isolatedLoopbackHostFromHeaders(request.headers);
  return isolatedLoopbackEnabled(env, fromHeaders ?? request.nextUrl.hostname);
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
