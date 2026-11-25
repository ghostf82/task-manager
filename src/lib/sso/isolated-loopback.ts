import { cookies, headers } from "next/headers";
import { type NextRequest, type NextResponse } from "next/server";

import type { ExecutiveMorningBrief } from "@/lib/executive-intelligence/types";
import { decideAccessSignals } from "./access-signals";
import type { SsoPorts } from "./consume";
import {
  applyPlatformRevoke,
  localPasswordLoginAllowed,
  resolveRevokeWriteAfterCas,
} from "./grant";
import {
  ISOLATED_COOKIE,
  ISOLATED_COOKIE_CLEAR,
  isolatedLoopbackEnabled,
  isolatedLoopbackEnabledForRequest,
} from "./isolated-flag";
import { handleHrLaunch } from "./launch-handler";
import { createMemoryPorts, type MemorySsoState } from "./memory-ports";

export {
  ISOLATED_COOKIE,
  isolatedLoopbackEnabled,
  isolatedLoopbackEnabledForRequest,
} from "./isolated-flag";

/** RSC / Server Actions: same TM-1 gate as middleware, using incoming Host. */
export async function isolatedLoopbackEnabledNow(
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  return isolatedLoopbackEnabled(env, await headers());
}

type IsolatedSessionUser = {
  id: string;
  email: string | undefined;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
};

type IsolatedRuntime = {
  ports: SsoPorts;
  state: MemorySsoState;
  cookies: Map<string, string>;
  passwords: Map<string, string>;
  lastOpened: string | null;
};

const g = globalThis as typeof globalThis & { __tmIsolatedLoopback?: IsolatedRuntime };

export function getIsolatedRuntime(): IsolatedRuntime {
  if (!g.__tmIsolatedLoopback) {
    const mem = createMemoryPorts();
    const runtime: IsolatedRuntime = {
      ports: mem.ports,
      state: mem.state,
      cookies: new Map(),
      passwords: new Map(),
      lastOpened: null,
    };
    const origCreate = mem.ports.createLocalUser.bind(mem.ports);
    mem.ports.createLocalUser = async (spec) => {
      const created = await origCreate(spec);
      const password = process.env.HR_IAM_ISOLATED_LOCAL_PASSWORD || "";
      if (password) {
        runtime.passwords.set(created.email.toLowerCase(), password);
      }
      return created;
    };
    const origOpen = mem.ports.openSession.bind(mem.ports);
    mem.ports.openSession = async (localUserId) => {
      await origOpen(localUserId);
      runtime.lastOpened = localUserId;
    };
    g.__tmIsolatedLoopback = runtime;
  }
  return g.__tmIsolatedLoopback;
}

export async function isolatedSessionFromCookies(): Promise<IsolatedSessionUser | null> {
  const runtime = getIsolatedRuntime();
  const jar = await cookies();
  const sid = jar.get(ISOLATED_COOKIE)?.value;
  if (!sid) return null;
  const localUserId = runtime.cookies.get(sid);
  if (!localUserId || !runtime.state.sessions.has(localUserId)) return null;
  const link = runtime.state.links.find((row) => row.localUserId === localUserId) ?? null;
  if (link && !localPasswordLoginAllowed({ link })) return null;
  if (link && runtime.ports.pollAccessSignals) {
    const started = runtime.state.sessionStartedAt.get(localUserId) ?? null;
    const poll = await runtime.ports.pollAccessSignals(link.platformUserId);
    const decision = decideAccessSignals(poll, { sessionStartedAt: started });
    if (decision.action === "deny") {
      if (decision.persistRevoke) {
        const idx = runtime.state.links.findIndex(
          (row) => row.platformUserId === link.platformUserId
        );
        const current = idx >= 0 ? runtime.state.links[idx]! : null;
        const wrote =
          current != null && (current.revokedAt ?? null) === (link.revokedAt ?? null);
        if (wrote && idx >= 0) {
          runtime.state.links[idx] = applyPlatformRevoke(link);
        }
        const live = idx >= 0 ? runtime.state.links[idx]! : null;
        const resolved = resolveRevokeWriteAfterCas({
          snapshot: link,
          wrote,
          live,
        });
        if (!resolved.dropSession) {
          const user = runtime.state.users.get(localUserId);
          return {
            id: localUserId,
            email: user?.email,
            isSuperAdmin: false,
            mustChangePassword: false,
          };
        }
      }
      revokeIsolatedSid(sid);
      return null;
    }
  }
  const user = runtime.state.users.get(localUserId);
  return {
    id: localUserId,
    email: user?.email,
    isSuperAdmin: false,
    mustChangePassword: false,
  };
}

export function mintIsolatedCookie(localUserId: string): string {
  const runtime = getIsolatedRuntime();
  runtime.state.sessions.add(localUserId);
  runtime.state.sessionStartedAt.set(localUserId, new Date().toISOString());
  const sid = crypto.randomUUID();
  runtime.cookies.set(sid, localUserId);
  return sid;
}

export function revokeIsolatedSid(sid: string | undefined): void {
  const runtime = getIsolatedRuntime();
  if (!sid) return;
  const localUserId = runtime.cookies.get(sid);
  if (localUserId) {
    runtime.state.sessions.delete(localUserId);
    runtime.state.signedOut.push(localUserId);
  }
  runtime.cookies.delete(sid);
}

export async function clearIsolatedBrowserSession(): Promise<void> {
  const jar = await cookies();
  revokeIsolatedSid(jar.get(ISOLATED_COOKIE)?.value);
  try {
    jar.set(ISOLATED_COOKIE, "", ISOLATED_COOKIE_CLEAR);
  } catch {
    /* Server Component render cannot mutate cookies; middleware / actions do. */
  }
}

export function emptyIsolatedBrief(): ExecutiveMorningBrief {
  return {
    generatedAt: new Date().toISOString(),
    health: "stable",
    tenantCount: 0,
    headlineKey: "brief.headlineStable",
    headlineParams: { companies: 0 },
    narrativeKeys: [],
    narrativeParams: [],
    priorityKeys: [],
    priorityParams: [],
    riskKeys: [],
    riskParams: [],
    interventionKeys: [],
    interventionParams: [],
    myDayPreview: [],
    myDayItems: [],
    warRooms: [],
    insights: [],
    complianceHotspots: [],
    counts: {
      actionToday: 0,
      criticalRisks: 0,
      overdueCorporate: 0,
      overdueOdoo: 0,
      complianceCritical: 0,
      pendingApprovals: 0,
      emailFollowUps: 0,
      eventsToday: 0,
    },
  };
}

export async function handleIsolatedHrLaunch(request: NextRequest): Promise<NextResponse> {
  if (!isolatedLoopbackEnabledForRequest(request)) {
    return handleHrLaunch(request);
  }
  const runtime = getIsolatedRuntime();
  runtime.lastOpened = null;
  const response = await handleHrLaunch(request, { ports: runtime.ports });
  const location = response.headers.get("location") ?? "";
  const landedDashboard = /\/dashboard(?:\?|$)/.test(location) && !/login/.test(location);
  if (landedDashboard && runtime.lastOpened && runtime.state.sessions.has(runtime.lastOpened)) {
    const sid = mintIsolatedCookie(runtime.lastOpened);
    response.cookies.set(ISOLATED_COOKIE, sid, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
  } else {
    response.cookies.set(ISOLATED_COOKIE, "", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 0,
    });
  }
  return response;
}

export function isolatedPasswordLogin(
  email: string,
  password: string
): { ok: true; localUserId: string } | { ok: false; code: "invalid" | "sso_grant" } {
  const runtime = getIsolatedRuntime();
  const expected = runtime.passwords.get(email.trim().toLowerCase());
  if (!expected || expected !== password) return { ok: false, code: "invalid" };
  const match = [...runtime.state.users.entries()].find(
    ([, user]) => user.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!match) return { ok: false, code: "invalid" };
  const [localUserId] = match;
  const link = runtime.state.links.find((row) => row.localUserId === localUserId) ?? null;
  if (!localPasswordLoginAllowed({ link })) return { ok: false, code: "sso_grant" };
  runtime.state.sessions.add(localUserId);
  return { ok: true, localUserId };
}
