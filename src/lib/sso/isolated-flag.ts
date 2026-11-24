/** Isolated loopback cookie. Edge-safe (no Node-only imports). */
export const ISOLATED_COOKIE = "tm_sso";

export function isolatedLoopbackEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.HR_IAM_ISOLATED_LOOPBACK === "1";
}

export type IsolatedAuthDecision = "next" | "login" | "dashboard";

/**
 * Isolated routing must follow tm_sso the same way requireSession does.
 * A leftover Supabase cookie is ignored — it must not send /login to /dashboard
 * or bounce /dashboard to /login.
 */
export function isolatedAuthDecision(input: {
  pathname: string;
  tmSso: string | undefined;
}): IsolatedAuthDecision {
  const hasIsolatedSession = Boolean(input.tmSso?.trim());
  if (!hasIsolatedSession) {
    if (input.pathname.startsWith("/dashboard") || input.pathname === "/update-password") {
      return "login";
    }
    return "next";
  }
  if (input.pathname === "/update-password") return "next";
  if (input.pathname === "/login" || input.pathname === "/") return "dashboard";
  return "next";
}
