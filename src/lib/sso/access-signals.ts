import { PROGRAM_SLUG } from "./contract";

/** Isolated mock: GET {url}?user=&since= → `{ signals }`. Never a production admin RPC. */
export const ACCESS_SIGNALS_URL_ENV = "PLATFORM_SSO_ACCESS_SIGNALS_URL" as const;

export type AccessSignal = {
  id?: string;
  platform_user_id: string;
  kind: string;
  program_slug?: string | null;
  at: string;
  detail?: unknown;
};

export type AccessSignalsPoll =
  | { status: "skipped" }
  | { status: "ok"; signals: AccessSignal[] }
  | { status: "unavailable"; reason: string };

export type AccessSignalDecision =
  | { action: "allow" }
  | { action: "deny"; persistRevoke: boolean; signOut: true; reason: string };

/** This Odoo adapter only. `taskmanager` is the other (Almudayfer) product. */
const ODOO_TASKMANAGER_SLUGS = new Set([
  "odoo-taskmanager",
  "odoo_taskmanager",
  "odootaskmanager",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseSignal(value: unknown): AccessSignal | null {
  const row = asRecord(value);
  if (!row) return null;
  const platformUserId = String(row.platform_user_id ?? "").trim();
  const kind = String(row.kind ?? "").trim();
  const at = String(row.at ?? "").trim();
  if (!platformUserId || !kind || !at) return null;
  const slugRaw = row.program_slug;
  const programSlug =
    slugRaw == null || slugRaw === "" ? null : String(slugRaw);
  return {
    id: row.id != null ? String(row.id) : undefined,
    platform_user_id: platformUserId,
    kind,
    program_slug: programSlug,
    at,
    detail: row.detail,
  };
}

export function parseAccessSignalsBody(body: unknown): AccessSignal[] | null {
  if (Array.isArray(body)) {
    const rows = body.map(parseSignal);
    if (rows.some((row) => row == null)) return null;
    return rows as AccessSignal[];
  }
  const obj = asRecord(body);
  if (!obj) return null;
  if (Array.isArray(obj.signals)) {
    const rows = obj.signals.map(parseSignal);
    if (rows.some((row) => row == null)) return null;
    return rows as AccessSignal[];
  }
  return null;
}

/**
 * HTTP 404 is fail-closed: the fan-out list is missing, not "no signals".
 * Same rule as local session revoke 404.
 */
export function interpretAccessSignalsHttp(input: {
  status: number;
  body: unknown;
}): AccessSignalsPoll {
  if (input.status === 404) {
    return { status: "unavailable", reason: "access_signals 404" };
  }
  if (input.status < 200 || input.status >= 300) {
    return { status: "unavailable", reason: `access_signals ${input.status}` };
  }
  const signals = parseAccessSignalsBody(input.body);
  if (!signals) {
    return { status: "unavailable", reason: "access_signals body invalid" };
  }
  return { status: "ok", signals };
}

function signalAfterSession(at: string, sessionStartedAt: string | null | undefined): boolean {
  if (!sessionStartedAt) return true;
  const signalMs = Date.parse(at);
  const sessionMs = Date.parse(sessionStartedAt);
  if (!Number.isFinite(signalMs) || !Number.isFinite(sessionMs)) return true;
  return signalMs > sessionMs;
}

/** Inclusive skip: consumed events at the seen cursor must not fire again. */
export function signalAtOrBeforeCursor(
  at: string,
  cursor: string | null | undefined
): boolean {
  if (!cursor) return false;
  const signalMs = Date.parse(at);
  const cursorMs = Date.parse(cursor);
  if (!Number.isFinite(signalMs) || !Number.isFinite(cursorMs)) return false;
  return signalMs <= cursorMs;
}

export function laterSignalAt(
  current: string | null,
  candidate: string
): string | null {
  const candMs = Date.parse(candidate);
  if (!Number.isFinite(candMs)) return current;
  if (!current) return candidate;
  const curMs = Date.parse(current);
  if (!Number.isFinite(curMs) || candMs > curMs) return candidate;
  return current;
}

function signalTargetsThisProgram(
  signal: AccessSignal,
  programSlug: string
): boolean {
  const slug = (signal.program_slug ?? "").trim();
  if (!slug) return true;
  if (ODOO_TASKMANAGER_SLUGS.has(slug) && ODOO_TASKMANAGER_SLUGS.has(programSlug)) {
    return true;
  }
  return slug === programSlug;
}

export function accessSignalsAffectingProgram(
  signals: AccessSignal[],
  input: {
    programSlug?: string;
    sessionStartedAt?: string | null;
    signalsSeenAt?: string | null;
  } = {}
): { logout: boolean; revokeGrant: boolean; cursorAt: string | null } {
  const programSlug = input.programSlug ?? PROGRAM_SLUG;
  let logout = false;
  let revokeGrant = false;
  let cursorAt: string | null = null;
  for (const signal of signals) {
    if (signalAtOrBeforeCursor(signal.at, input.signalsSeenAt)) continue;
    if (!signalAfterSession(signal.at, input.sessionStartedAt)) continue;
    if (!signalTargetsThisProgram(signal, programSlug)) continue;
    if (signal.kind === "logout" || signal.kind === "logout_all") {
      logout = true;
      cursorAt = laterSignalAt(cursorAt, signal.at);
    }
    if (signal.kind === "disable_membership") {
      logout = true;
      revokeGrant = true;
      cursorAt = laterSignalAt(cursorAt, signal.at);
    }
    if (signal.kind === "revoke_grant") {
      logout = true;
      revokeGrant = true;
      cursorAt = laterSignalAt(cursorAt, signal.at);
    }
  }
  return { logout, revokeGrant, cursorAt };
}

export type PendingLaunchSignals =
  | { action: "allow"; cursorAt: string | null }
  | { action: "logout"; cursorAt: string }
  | { action: "revoke"; cursorAt: string }
  | { action: "deny"; reason: string };

/** Launch-time consume: fail-closed on poll errors / revoke; logout is applied then launch may continue. */
export function decidePendingLaunchSignals(
  poll: AccessSignalsPoll,
  input: { programSlug?: string; signalsSeenAt?: string | null } = {}
): PendingLaunchSignals {
  if (poll.status === "skipped") return { action: "allow", cursorAt: null };
  if (poll.status === "unavailable") {
    return { action: "deny", reason: poll.reason };
  }
  const fx = accessSignalsAffectingProgram(poll.signals, {
    programSlug: input.programSlug,
    signalsSeenAt: input.signalsSeenAt,
  });
  if (fx.revokeGrant && fx.cursorAt) {
    return { action: "revoke", cursorAt: fx.cursorAt };
  }
  if (fx.logout && fx.cursorAt) {
    return { action: "logout", cursorAt: fx.cursorAt };
  }
  return { action: "allow", cursorAt: null };
}

export function decideAccessSignals(
  poll: AccessSignalsPoll,
  input: { programSlug?: string; sessionStartedAt?: string | null } = {}
): AccessSignalDecision {
  if (poll.status === "skipped") return { action: "allow" };
  if (poll.status === "unavailable") {
    return {
      action: "deny",
      persistRevoke: false,
      signOut: true,
      reason: poll.reason,
    };
  }
  const fx = accessSignalsAffectingProgram(poll.signals, input);
  if (fx.revokeGrant) {
    return {
      action: "deny",
      persistRevoke: true,
      signOut: true,
      reason: "access_signals revoke",
    };
  }
  if (fx.logout) {
    return {
      action: "deny",
      persistRevoke: false,
      signOut: true,
      reason: "access_signals logout",
    };
  }
  return { action: "allow" };
}

export async function fetchPortalAccessSignals(
  platformUserId: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  since?: string | null
): Promise<AccessSignalsPoll> {
  const raw = env[ACCESS_SIGNALS_URL_ENV]?.trim();
  if (!raw) return { status: "skipped" };
  try {
    const url = new URL(raw);
    url.searchParams.set("user", platformUserId);
    if (since) url.searchParams.set("since", since);
    const res = await fetchImpl(url, { method: "GET", cache: "no-store" });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return interpretAccessSignalsHttp({ status: res.status, body });
  } catch {
    return { status: "unavailable", reason: "access_signals fetch failed" };
  }
}
