import "server-only";

import { decryptCredentialSecret } from "@/lib/crypto/credentials-cipher";
import {
  defaultOpenTaskDomain,
  odooAuthenticate,
  odooListDatabases,
  odooReadOne,
  odooSearchRead,
  sanitizeOdooBaseUrl,
  odooWrite,
  type OdooTaskRecord,
} from "@/lib/integrations/odoo-xmlrpc";

export type OdooCredentialBundle = {
  baseUrl: string;
  databaseName: string | null;
  username: string;
  passwordEncrypted: string;
  traceId?: string;
};

export type OdooWebTaskLite = {
  id: number;
  name: string;
  stage_id?: [number, string] | false;
  project_id?: [number, string] | false;
  date_deadline?: string | false;
  create_uid?: [number, string] | false;
  user_id?: [number, string] | false;
  user_ids?: number[];
  description?: string | false;
  priority?: string | false;
  active?: boolean;
};

export type OdooWebProjectLite = {
  id: number;
  name: string;
  active?: boolean;
  create_date?: string;
  create_uid?: [number, string] | false;
  user_id?: [number, string] | false;
  privacy_visibility?: string;
};

export type OdooCalendarAgendaLineLite = {
  id: number;
  summary: string;
  notePlain: string;
  state: string;
  dateDeadline: string;
};

export type OdooWebCalendarEventLite = {
  id: number;
  name: string;
  start?: string;
  stop?: string;
  allday?: boolean;
  create_uid?: [number, string] | false;
  user_id?: [number, string] | false;
  partner_ids?: number[];
  description?: string | false;
  location?: string | false;
  active?: boolean;
  /** Linked business record when the meeting mirrors e.g. Time Off (`hr.leave`). */
  res_model?: string | false;
  res_id?: number | false;
  /** Odoo meeting "Activities" / agenda rows linked via `calendar_event_id` on `mail.activity`. */
  agendaLines?: OdooCalendarAgendaLineLite[];
};

export type OdooWebDocumentLite = {
  id: number;
  name: string;
  type?: string;
  mimetype?: string | false;
  create_date?: string;
  create_uid?: [number, string] | false;
};

export type OdooGatewayErrorCode =
  | "OdooSessionAuthFailed"
  | "OdooSessionExpired"
  | "OdooCallKwHtmlRedirect"
  | "OdooRateLimited"
  | "OdooNetworkTimeout"
  | "OdooInvalidCredentials"
  | "OdooDatabaseNotFound"
  | "OdooUnknown";

class OdooGatewayError extends Error {
  code: OdooGatewayErrorCode;
  constructor(code: OdooGatewayErrorCode, message: string) {
    super(message);
    this.name = "OdooGatewayError";
    this.code = code;
  }
}

const TASK_MODEL = process.env.ODOO_TASK_MODEL?.trim() || "project.task";
const ODOO_CALL_TIMEOUT_MS = Number(process.env.ODOO_CALL_TIMEOUT_MS || 8_000);
const ODOO_SETTINGS_HINT =
  "تحقق من إعدادات Odoo في صفحة الإعدادات > التكاملات.";

const TASK_FIELDS = [
  "id",
  "name",
  "date_deadline",
  "stage_id",
  "user_ids",
  "user_id",
  "project_id",
  "description",
] as const;

function readSetCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const raw = res.headers.get("set-cookie");
  if (!raw) return [];
  // Some runtimes collapse multiple Set-Cookie headers into one comma-joined string.
  return raw
    .split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function mergeCookieHeaders(...cookieGroups: string[][]): string {
  const pairs = new Map<string, string>();
  for (const group of cookieGroups) {
    for (const c of group) {
      const kv = c.split(";")[0]?.trim();
      if (!kv) continue;
      const eq = kv.indexOf("=");
      if (eq <= 0) continue;
      const k = kv.slice(0, eq).trim();
      const v = kv.slice(eq + 1).trim();
      if (!k) continue;
      pairs.set(k, v);
    }
  }
  return [...pairs.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function parseJsonOrThrow(raw: string, context: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const sample = raw.slice(0, 220).toLowerCase();
    if (sample.includes("<!doctype") || sample.includes("<html")) {
      throw new OdooGatewayError(
        "OdooCallKwHtmlRedirect",
        `${context}: خادم Odoo أعاد HTML بدل JSON (غالباً إعادة توجيه لجلسة تسجيل الدخول أو مسار غير صحيح).`
      );
    }
    throw new OdooGatewayError("OdooUnknown", `${context}: استجابة غير JSON: ${raw.slice(0, 220)}`);
  }
}

function htmlToPlainText(html: string): string {
  const t = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return t.replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

async function fetchMailActivitiesForCalendarEvents(params: {
  bundle: OdooCredentialBundle;
  eventIds: number[];
}): Promise<Map<number, OdooCalendarAgendaLineLite[]>> {
  const out = new Map<number, OdooCalendarAgendaLineLite[]>();
  const ids = [...new Set(params.eventIds.filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return out;
  try {
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "mail.activity",
        method: "search_read",
        args: [[["calendar_event_id", "in", ids]]],
        kwargs: {
          context: { active_test: false },
          fields: ["id", "calendar_event_id", "summary", "note", "state", "date_deadline"],
          order: "date_deadline asc, id asc",
          limit: Math.min(4000, ids.length * 250),
        },
      })
    );
    const rows = Array.isArray(json.result) ? json.result : [];
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const cal = r.calendar_event_id;
      const eventId =
        Array.isArray(cal) && typeof cal[0] === "number" ? Number(cal[0]) : 0;
      if (!eventId) continue;
      const line: OdooCalendarAgendaLineLite = {
        id: Number(r.id),
        summary: typeof r.summary === "string" ? r.summary : "",
        notePlain: typeof r.note === "string" ? htmlToPlainText(r.note) : "",
        state: typeof r.state === "string" ? r.state : "",
        dateDeadline: typeof r.date_deadline === "string" ? r.date_deadline : "",
      };
      const arr = out.get(eventId) ?? [];
      arr.push(line);
      out.set(eventId, arr);
    }
  } catch {
    /* Older Odoo / restricted mail.activity: skip agenda enrichment */
  }
  return out;
}

const irModelIdCache = new Map<string, number>();

function parseOdooNaiveLocalDateTime(s: string): Date | null {
  const txt = String(s || "").trim();
  if (!txt) return null;
  const d = new Date(txt.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole calendar days between the dates implied by two Odoo-style datetimes (local). */
function calendarDayDelta(sourceStart: string, targetStart: string): number {
  const a = parseOdooNaiveLocalDateTime(sourceStart);
  const b = parseOdooNaiveLocalDateTime(targetStart);
  if (!a || !b) return 0;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / 86400000);
}

function shiftIsoDateByDays(ymd: string, delta: number): string {
  const [y, m, d] = String(ymd || "").trim().split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

async function getIrModelIdForModelViaWebLogin(
  bundle: OdooCredentialBundle,
  model: string
): Promise<number | null> {
  const key = `${sanitizeOdooBaseUrl(bundle.baseUrl)}|${model}`;
  const cached = irModelIdCache.get(key);
  if (cached) return cached;
  try {
    const json = await callKwWithSessionRetry(bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "ir.model",
        method: "search_read",
        args: [[["model", "=", model]]],
        kwargs: { fields: ["id"], limit: 1 },
      })
    );
    const rows = Array.isArray(json.result) ? json.result : [];
    const id = rows[0] && typeof rows[0] === "object" ? Number((rows[0] as { id?: unknown }).id) : 0;
    if (id) irModelIdCache.set(key, id);
    return id || null;
  } catch {
    return null;
  }
}

async function readCalendarEventStartStopViaWebLogin(
  bundle: OdooCredentialBundle,
  eventId: number
): Promise<{ start: string; stop: string } | null> {
  const parseRow = (r: Record<string, unknown> | undefined) =>
    r
      ? {
          start: typeof r.start === "string" ? r.start : "",
          stop: typeof r.stop === "string" ? r.stop : "",
        }
      : null;
  try {
    const json = await callKwWithSessionRetry(bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "calendar.event",
        method: "read",
        args: [[Number(eventId)], ["start", "stop"]],
      })
    );
    const rows = Array.isArray(json.result) ? json.result : [];
    const out = parseRow(rows[0] as Record<string, unknown> | undefined);
    if (out?.start) return out;
  } catch {
    /* fall through */
  }
  try {
    const json = await callKwWithSessionRetry(bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "calendar.event",
        method: "search_read",
        args: [[["id", "=", Number(eventId)]]],
        kwargs: { fields: ["start", "stop"], limit: 1 },
      })
    );
    const rows = Array.isArray(json.result) ? json.result : [];
    return parseRow(rows[0] as Record<string, unknown> | undefined);
  } catch {
    return null;
  }
}

async function searchReadMailActivitiesForCalendarEventClone(
  bundle: OdooCredentialBundle,
  eventId: number
): Promise<Record<string, unknown>[]> {
  const json = await callKwWithSessionRetry(bundle, async (session) =>
    webCallKw({
      baseUrl: session.baseUrl,
      cookieHeader: session.cookieHeader,
      model: "mail.activity",
      method: "search_read",
      args: [[["calendar_event_id", "=", Number(eventId)]]],
      kwargs: {
        context: { active_test: false },
        fields: ["id", "activity_type_id", "summary", "note", "date_deadline", "user_id", "calendar_event_id"],
        order: "date_deadline asc, id asc",
        limit: 500,
      },
    })
  );
  return Array.isArray(json.result) ? (json.result as Record<string, unknown>[]) : [];
}

function buildAgendaFallbackDescription(lines: { summary: string; notePlain: string }[]): string {
  const body = lines
    .map((l, i) => {
      const t = [l.summary?.trim(), l.notePlain?.trim()].filter(Boolean).join(" — ");
      return t ? `${i + 1}. ${t}` : null;
    })
    .filter(Boolean)
    .join("\n");
  return `\n\n---نسخ أجندة (نصّي — تعذّر إنشاء أنشطة Odoo)---\n${body}`;
}

/**
 * After `calendar.event` copy/create, recreate `mail.activity` rows linked to the source meeting.
 * Odoo's default `copy()` on meetings does not duplicate agenda activities.
 */
export async function duplicateCalendarMeetingAgendaViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  sourceEventId: number;
  targetEventId: number;
  targetEventStart: string;
  /** If omitted, `start` is read from the source `calendar.event` in Odoo. */
  sourceEventStart?: string;
  /** Appended to `description` if every `mail.activity` create fails (e.g. ACL). */
  targetDescriptionForFallback?: string;
}): Promise<{ created: number; skipped: number; fallbackDescriptionUpdated: boolean }> {
  let created = 0;
  let skipped = 0;
  let fallbackDescriptionUpdated = false;
  let srcStart = params.sourceEventStart?.trim() || "";
  if (!srcStart) {
    const rd = await readCalendarEventStartStopViaWebLogin(params.bundle, params.sourceEventId);
    srcStart = (rd?.start || "").trim();
  }
  const delta = calendarDayDelta(srcStart || params.targetEventStart, params.targetEventStart);
  const defaultDeadline =
    String(params.targetEventStart || "")
      .trim()
      .slice(0, 10) || new Date().toISOString().slice(0, 10);

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await searchReadMailActivitiesForCalendarEventClone(params.bundle, params.sourceEventId);
  } catch {
    return { created: 0, skipped: 0, fallbackDescriptionUpdated: false };
  }
  if (!rows.length) return { created: 0, skipped: 0, fallbackDescriptionUpdated: false };

  const calendarIrModelId = await getIrModelIdForModelViaWebLogin(params.bundle, "calendar.event");
  if (!calendarIrModelId) return { created: 0, skipped: rows.length, fallbackDescriptionUpdated: false };

  const linesForFallback = rows.map((r) => ({
    summary: typeof r.summary === "string" ? r.summary : "",
    notePlain: typeof r.note === "string" ? htmlToPlainText(String(r.note)) : "",
  }));

  for (const r of rows) {
    const type = r.activity_type_id;
    const activityTypeId =
      Array.isArray(type) && typeof type[0] === "number" ? Number(type[0]) : 0;
    const user = r.user_id;
    const userId = Array.isArray(user) && typeof user[0] === "number" ? Number(user[0]) : 0;
    if (!activityTypeId || !userId) {
      skipped += 1;
      continue;
    }
    let dateDeadline = typeof r.date_deadline === "string" ? r.date_deadline : "";
    if (dateDeadline && /^\d{4}-\d{2}-\d{2}$/.test(dateDeadline)) {
      dateDeadline = shiftIsoDateByDays(dateDeadline, delta);
    }

    const vals: Record<string, unknown> = {
      res_model_id: calendarIrModelId,
      res_id: Number(params.targetEventId),
      activity_type_id: activityTypeId,
      summary:
        typeof r.summary === "string" && r.summary.trim()
          ? r.summary.trim()
          : "—",
      user_id: userId,
      date_deadline: dateDeadline && /^\d{4}-\d{2}-\d{2}$/.test(dateDeadline) ? dateDeadline : defaultDeadline,
      calendar_event_id: Number(params.targetEventId),
    };
    if (typeof r.note === "string" && r.note.trim()) vals.note = r.note;

    try {
      const json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "mail.activity",
          method: "create",
          args: [vals],
        })
      );
      const newId = Number(json.result ?? 0);
      if (newId) created += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  if (!created && linesForFallback.length) {
    const appendix = buildAgendaFallbackDescription(linesForFallback);
    const base = String(params.targetDescriptionForFallback ?? "").trimEnd();
    try {
      const json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "calendar.event",
          method: "write",
          args: [[Number(params.targetEventId)], { description: `${base}${appendix}` }],
        })
      );
      if (json.result === true) fallbackDescriptionUpdated = true;
    } catch {
      /* ignore */
    }
  }

  return { created, skipped, fallbackDescriptionUpdated };
}

function asGatewayError(error: unknown): OdooGatewayError {
  if (error instanceof OdooGatewayError) return error;
  const msg = error instanceof Error ? error.message : String(error);
  const low = msg.toLowerCase();
  if (low.includes("wrong login/password") || low.includes("invalid password")) {
    return new OdooGatewayError("OdooInvalidCredentials", msg);
  }
  if (low.includes("database") && low.includes("does not exist")) {
    return new OdooGatewayError("OdooDatabaseNotFound", msg);
  }
  if (low.includes("timeout")) {
    return new OdooGatewayError("OdooNetworkTimeout", msg);
  }
  if (low.includes("429")) {
    return new OdooGatewayError("OdooRateLimited", msg);
  }
  if (low.includes("session") && low.includes("expired")) {
    return new OdooGatewayError("OdooSessionExpired", msg);
  }
  return new OdooGatewayError("OdooUnknown", msg);
}

async function createWebSession(bundle: OdooCredentialBundle): Promise<{
  ok: true;
  baseUrl: string;
  uid: number;
  cookieHeader: string;
}> {
  const traceId = bundle.traceId || `odoo-${Date.now().toString(36)}`;
  const trace = (stage: string, data?: Record<string, unknown>) => {
    console.error("[odoo-trace] handshake", { traceId, stage, ...(data ?? {}) });
  };
  const baseUrl = sanitizeOdooBaseUrl(bundle.baseUrl);
  const login = bundle.username.trim();
  const password = decryptCredentialSecret(bundle.passwordEncrypted);
  const rpcBaseCandidates = [baseUrl, baseUrl.replace(/\/odoo$/i, "")].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  );
  let lastAuthErr = "تعذر إنشاء جلسة Odoo عبر المتصفح.";
  trace("start", { baseUrl, rpcBaseCandidates });

  for (const rpcBase of rpcBaseCandidates) {
    let loginPage: Response;
    try {
      loginPage = await withTimeout(
        fetch(`${rpcBase}/web/login`, { method: "GET", cache: "no-store" }),
        ODOO_CALL_TIMEOUT_MS,
        "odoo_web_login_page"
      );
    } catch (e) {
      lastAuthErr = `[handshake_login_page] ${e instanceof Error ? e.message : String(e)}`;
      trace("login_page_exception", { rpcBase, error: lastAuthErr.slice(0, 240) });
      continue;
    }
    const loginHtml = await loginPage.text();
    const dbFromPage =
      loginHtml.match(/name=["']db["'][^>]*value=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
    const pageCookies = readSetCookies(loginPage);
    trace("login_page_ok", {
      rpcBase,
      status: loginPage.status,
      dbFromPage,
      setCookieCount: pageCookies.length,
    });

    const listedDbs = await withTimeout(
      discoverDatabasesFromWebList(rpcBase),
      Math.min(ODOO_CALL_TIMEOUT_MS, 4_000),
      "odoo_web_database_list_for_session"
    ).catch(() => []);
    const dbCandidates = [
      ...listedDbs,
      dbFromPage,
      bundle.databaseName?.trim() ?? "",
      (() => {
        try {
          const u = new URL(rpcBase);
          return (u.hostname.split(".")[0] ?? "").trim();
        } catch {
          return "";
        }
      })(),
      "",
    ].filter((v, i, arr) => v !== "__browser_session__" && arr.indexOf(v) === i);

    let cookieHeader = mergeCookieHeaders(pageCookies);
    let authenticated = false;
    trace("auth_candidates", {
      rpcBase,
      listedDbs,
      dbCandidates,
      initialCookieBytes: cookieHeader.length,
    });
    for (const db of dbCandidates) {
      let authRes: Response;
      try {
        authRes = await withTimeout(
          fetch(`${rpcBase}/web/session/authenticate`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-requested-with": "XMLHttpRequest",
              cookie: cookieHeader,
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "call",
              params: {
                db: db || undefined,
                login,
                password,
              },
              id: Date.now(),
            }),
            cache: "no-store",
          }),
          ODOO_CALL_TIMEOUT_MS,
          "odoo_web_session_authenticate"
        );
      } catch (e) {
        lastAuthErr = `[handshake_auth] ${e instanceof Error ? e.message : String(e)}`;
        trace("auth_exception", { rpcBase, db, error: lastAuthErr.slice(0, 240) });
        continue;
      }
      const authRaw = await authRes.text();
      let authJson: Record<string, unknown>;
      try {
        authJson = parseJsonOrThrow(authRaw, "odoo_web_session_authenticate");
      } catch (e) {
        lastAuthErr = `[handshake_auth_parse] ${e instanceof Error ? e.message : String(e)}`;
        trace("auth_parse_exception", {
          rpcBase,
          db,
          status: authRes.status,
          error: lastAuthErr.slice(0, 240),
        });
        continue;
      }
      const authCookies = readSetCookies(authRes);
      const mergedCookies = mergeCookieHeaders([cookieHeader], authCookies);
      const resultObj =
        authJson.result && typeof authJson.result === "object"
          ? (authJson.result as Record<string, unknown>)
          : null;
      const uidFromAuth = Number(resultObj?.uid ?? 0);
      trace("auth_response", {
        rpcBase,
        db,
        status: authRes.status,
        uidFromAuth,
        setCookieCount: authCookies.length,
        hasSessionCookie: mergedCookies.includes("session_id="),
      });
      if (uidFromAuth > 0) {
        cookieHeader = mergedCookies || cookieHeader;
        authenticated = true;
        break;
      }
      const errObj =
        authJson.error && typeof authJson.error === "object"
          ? (authJson.error as Record<string, unknown>)
          : null;
      const errData =
        errObj?.data && typeof errObj.data === "object"
          ? (errObj.data as Record<string, unknown>)
          : null;
      lastAuthErr =
        (typeof errData?.message === "string" && errData.message) ||
        (typeof errObj?.message === "string" && errObj.message) ||
        "فشل المصادقة في Odoo.";
      lastAuthErr = `[handshake_auth] ${lastAuthErr}`;
    }

    if (!authenticated || !cookieHeader.includes("session_id=")) {
      if (authenticated && !cookieHeader.includes("session_id=")) {
        lastAuthErr =
          "[handshake_cookie] authenticated لكن لم يتم استخراج session_id من Set-Cookie.";
        trace("cookie_missing_after_auth", { rpcBase, cookieHeaderBytes: cookieHeader.length });
      } else {
        trace("auth_not_authenticated", { rpcBase });
      }
      continue;
    }

    let sessionInfoRes: Response;
    try {
      sessionInfoRes = await withTimeout(
        fetch(`${rpcBase}/web/session/get_session_info`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-requested-with": "XMLHttpRequest",
            cookie: cookieHeader,
          },
          body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
          cache: "no-store",
        }),
        ODOO_CALL_TIMEOUT_MS,
        "odoo_web_session_info"
      );
    } catch (e) {
      lastAuthErr = `[handshake_session_info] ${e instanceof Error ? e.message : String(e)}`;
      trace("session_info_exception", { rpcBase, error: lastAuthErr.slice(0, 240) });
      continue;
    }
    const sessionInfoRaw = await sessionInfoRes.text();
    let sessionInfo: Record<string, unknown>;
    try {
      sessionInfo = parseJsonOrThrow(sessionInfoRaw, "odoo_web_session_info");
    } catch (e) {
      lastAuthErr = `[handshake_session_info_parse] ${e instanceof Error ? e.message : String(e)}`;
      trace("session_info_parse_exception", {
        rpcBase,
        status: sessionInfoRes.status,
        error: lastAuthErr.slice(0, 240),
      });
      continue;
    }
    const sessionCookies = readSetCookies(sessionInfoRes);
    const refreshedCookieHeader = mergeCookieHeaders([cookieHeader], sessionCookies);
    const resultObj =
      sessionInfo.result && typeof sessionInfo.result === "object"
        ? (sessionInfo.result as Record<string, unknown>)
        : null;
    const uid = Number(resultObj?.uid ?? 0);
    trace("session_info_response", {
      rpcBase,
      status: sessionInfoRes.status,
      uid,
      setCookieCount: sessionCookies.length,
      hasSessionCookie: (refreshedCookieHeader || cookieHeader).includes("session_id="),
    });
    if (uid) {
      trace("success", { rpcBase, uid });
      return {
        ok: true,
        baseUrl: rpcBase,
        uid,
        cookieHeader: refreshedCookieHeader || cookieHeader,
      };
    }
    lastAuthErr = "[handshake_session_info] لم يتم الحصول على uid من get_session_info بعد المصادقة.";
  }

  trace("failed", { lastAuthErr: lastAuthErr.slice(0, 240) });
  throw new OdooGatewayError("OdooSessionAuthFailed", lastAuthErr);
}

async function webCallKw(params: {
  baseUrl: string;
  cookieHeader: string;
  model: string;
  method: string;
  args?: unknown[];
  kwargs?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      model: params.model,
      method: params.method,
      args: params.args ?? [],
      kwargs: params.kwargs ?? {},
    },
    id: Date.now(),
  };
  const res = await withTimeout(
    fetch(`${params.baseUrl}/web/dataset/call_kw/${params.model}/${params.method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
        cookie: params.cookieHeader,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }),
    ODOO_CALL_TIMEOUT_MS,
    `odoo_call_kw_${params.model}_${params.method}`
  );
  const raw = await res.text();
  const json = parseJsonOrThrow(raw, `odoo_call_kw_${params.model}_${params.method}`);
  if (json.error && typeof json.error === "object") {
    const e = json.error as Record<string, unknown>;
    const msg =
      (typeof e.message === "string" && e.message) ||
      (typeof (e.data as Record<string, unknown> | undefined)?.message === "string"
        ? String((e.data as Record<string, unknown>).message)
        : "Odoo call_kw error");
    throw new OdooGatewayError("OdooUnknown", `[call_kw] ${msg}`);
  }
  return json;
}

function resolveDatabase(bundle: OdooCredentialBundle): string {
  return bundle.databaseName?.trim() ?? "";
}

function candidateDatabases(baseUrl: string, preferred: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (!out.includes(t)) out.push(t);
  };
  push(preferred);
  push(process.env.ODOO_DATABASE_NAME ?? "");
  try {
    const u = new URL(baseUrl);
    const hostFirst = u.hostname.split(".")[0] ?? "";
    push(hostFirst);
  } catch {
    // ignore malformed URL here; validator will handle later
  }
  return out;
}

async function callKwWithSessionRetry(
  bundle: OdooCredentialBundle,
  run: (session: { baseUrl: string; cookieHeader: string; uid: number }) => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const session = await createWebSession(bundle);
      return await run(session);
    } catch (e) {
      last = e;
      const ge = asGatewayError(e);
      if (
        attempt === 0 &&
        (ge.code === "OdooCallKwHtmlRedirect" || ge.code === "OdooSessionExpired" || ge.code === "OdooSessionAuthFailed")
      ) {
        continue;
      }
      throw ge;
    }
  }
  throw asGatewayError(last);
}

async function discoverDatabaseFromLoginPage(baseUrl: string): Promise<string | null> {
  try {
    const url = `${baseUrl}/web/login`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html) return null;

    // Odoo often embeds current db in a hidden login input.
    const hiddenDb =
      html.match(/name=["']db["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
      html.match(/value=["']([^"']+)["'][^>]*name=["']db["']/i)?.[1] ??
      null;
    if (hiddenDb && hiddenDb.trim()) return hiddenDb.trim();

    // Some bundles expose current DB in boot payload.
    const jsDb =
      html.match(/["']db["']\s*:\s*["']([^"']+)["']/i)?.[1] ??
      html.match(/odoo\.db\s*=\s*["']([^"']+)["']/i)?.[1] ??
      null;
    if (jsDb && jsDb.trim()) return jsDb.trim();
    return null;
  } catch {
    return null;
  }
}

async function discoverDatabasesFromWebList(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/web/database/list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {},
        id: Date.now(),
      }),
    });
    const raw = await res.text();
    const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const result = payload?.result;
    if (!Array.isArray(result)) return [];
    return result.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function jsonRpcCall(baseUrl: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}/jsonrpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(raw.slice(0, 220));
  }
}

async function discoverDatabasesFromJsonRpc(baseUrl: string): Promise<string[]> {
  try {
    const payload = await jsonRpcCall(baseUrl, {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "db",
        method: "list",
        args: [],
      },
      id: Date.now(),
    });
    const result = payload.result;
    if (!Array.isArray(result)) return [];
    return result.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function authenticateViaJsonRpc(params: {
  baseUrl: string;
  login: string;
  password: string;
  preferredDatabase: string;
}): Promise<{ uid: number; database: string }> {
  const dbCandidates = candidateDatabases(params.baseUrl, params.preferredDatabase);
  const listed = await discoverDatabasesFromJsonRpc(params.baseUrl);
  const ordered = [...listed, ...dbCandidates].filter((v, i, arr) => v && arr.indexOf(v) === i);
  const rpcBaseCandidates = [params.baseUrl, params.baseUrl.replace(/\/odoo$/i, "")].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  );
  console.error("[odoo-debug] jsonrpc start", {
    baseUrl: params.baseUrl,
    login: params.login,
    preferredDatabase: params.preferredDatabase,
    rpcBaseCandidates,
    ordered,
  });
  let lastErr = "Unknown Odoo jsonrpc auth error";

  for (const rpcBase of rpcBaseCandidates) {
    for (const db of ordered) {
      try {
        const payload = await jsonRpcCall(rpcBase, {
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "common",
            method: "login",
            args: [db, params.login, params.password],
          },
          id: Date.now(),
        });
        const uid = Number(payload.result ?? 0);
        console.error("[odoo-debug] jsonrpc response", {
          rpcBase,
          db,
          hasResult: "result" in payload,
          resultType: typeof payload.result,
          hasError: "error" in payload,
        });
        if (uid > 0) {
          return { uid, database: db };
        }
        const errObj =
          payload && typeof payload.error === "object" && payload.error
            ? (payload.error as Record<string, unknown>)
            : null;
        const errData =
          errObj && typeof errObj.data === "object" && errObj.data
            ? (errObj.data as Record<string, unknown>)
            : null;
      console.error("[odoo-debug] jsonrpc parsed-error", {
        rpcBase,
        db,
        errObjectMessage: typeof errObj?.message === "string" ? errObj.message : "",
        errDataMessage: typeof errData?.message === "string" ? errData.message.slice(0, 160) : "",
        errDataDebug:
          typeof errData?.debug === "string" ? errData.debug.slice(0, 160) : "",
      });
        lastErr =
          (typeof errData?.message === "string" && errData.message) ||
          (typeof errObj?.message === "string" && errObj.message) ||
          `jsonrpc login failed for db '${db}'`;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        console.error("[odoo-debug] jsonrpc exception", {
          rpcBase,
          db,
          error: lastErr.slice(0, 220),
        });
      }
    }
  }
  throw new Error(lastErr);
}

async function authenticateViaWebSession(params: {
  baseUrl: string;
  login: string;
  password: string;
  preferredDatabase: string;
}): Promise<{ uid: number; database: string }> {
  const dbCandidates = candidateDatabases(params.baseUrl, params.preferredDatabase);
  console.error("[odoo-debug] web-session start", {
    baseUrl: params.baseUrl,
    login: params.login,
    preferredDatabase: params.preferredDatabase,
    candidateCount: dbCandidates.length,
  });
  // On some Odoo deployments, sending empty db can auto-resolve mono-db.
  const ordered = ["", ...dbCandidates].filter((v, i, arr) => arr.indexOf(v) === i);
  let lastErr = "Unknown Odoo web auth error";

  for (const db of ordered) {
    try {
      const res = await fetch(`${params.baseUrl}/web/session/authenticate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            db,
            login: params.login,
            password: params.password,
          },
          id: Date.now(),
        }),
      });

      const raw = await res.text();
      console.error("[odoo-debug] web-session response", {
        db,
        status: res.status,
        rawPreview: raw.slice(0, 200),
      });
      const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const result =
        payload && typeof payload === "object" && payload.result && typeof payload.result === "object"
          ? (payload.result as Record<string, unknown>)
          : null;
      const uid = Number(result?.uid ?? 0);
      const dbName =
        typeof result?.db === "string" && result.db.trim()
          ? result.db.trim()
          : typeof result?.db_name === "string" && result.db_name.trim()
            ? result.db_name.trim()
            : db.trim();

      if (uid > 0 && dbName) {
        return { uid, database: dbName };
      }

      const errObj =
        payload && typeof payload === "object" && payload.error && typeof payload.error === "object"
          ? (payload.error as Record<string, unknown>)
          : null;
      const errData =
        typeof errObj?.data === "object" && errObj?.data
          ? (errObj.data as Record<string, unknown>)
          : null;
      const detailedMessage =
        typeof errData?.message === "string" && errData.message.trim()
          ? errData.message.trim()
          : typeof errData?.debug === "string" && errData.debug.trim()
            ? errData.debug.trim().slice(0, 400)
            : "";
      const errMsg =
        detailedMessage ||
        (typeof errObj?.message === "string" ? errObj.message : `web auth failed (db='${db}')`);
      lastErr = errMsg;
      console.error("[odoo-debug] web-session parsed-error", {
        db,
        errObjectMessage: typeof errObj?.message === "string" ? errObj.message : "",
        detailedMessagePreview: detailedMessage.slice(0, 200),
      });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.error("[odoo-debug] web-session exception", {
        db,
        error: lastErr.slice(0, 200),
      });
    }
  }

  throw new Error(lastErr);
}

function humanizeOdooError(raw: string): string {
  console.error("[odoo-debug] humanize raw", raw.slice(0, 200));
  const msg = raw.toLowerCase();
  if (
    msg.includes("access denied") ||
    msg.includes("accesserror") ||
    msg.includes("wrong login/password") ||
    msg.includes("authentication failed") ||
    msg.includes("odoo_auth") ||
    msg.includes("login failed")
  ) {
    return "Invalid Password: The Odoo password or username is incorrect.";
  }
  if (msg.includes("keyerror") && msg.includes("database_name")) {
    return "Database Name Error: Please verify the exact Odoo Database Name from your Odoo login screen.";
  }
  if (msg.includes("database") && msg.includes("does not exist")) {
    const m = raw.match(/database\s+"([^"]+)"\s+does not exist/i);
    const db = m?.[1]?.trim();
    return db
      ? `Database Name Error: قاعدة البيانات "${db}" غير موجودة على خادم Odoo. اطلب اسم قاعدة البيانات الصحيح من مسؤول Odoo ثم أدخله حرفياً في الحقل.`
      : "Database Name Error: Please verify the exact Odoo Database Name from your Odoo login screen.";
  }
  if (msg.includes("database not found")) {
    return "Database Name Error: Odoo رفض اسم قاعدة البيانات. افتح صفحة قاعدة البيانات في Odoo (/web/database/selector أو /web/login) وخذ الاسم الدقيق ثم ضعه في الحقل.";
  }
  if (msg.includes("odoo server error")) {
    return "Odoo Server Error: تعذر تسجيل الدخول من الخادم. إذا كان حساب Odoo Online يستخدم حماية إضافية/2FA فأنشئ API Key من Odoo واستخدمه بدل كلمة المرور.";
  }
  if (msg.includes("<title>") || msg.includes("title tag") || msg.includes("html")) {
    return "Base URL Error: استخدم رابط Odoo الصحيح كما يفتح عندك (قد يكون مع /odoo)، وتجنب فقط إضافة /web في النهاية.";
  }
  if (msg.includes("unexpected token '<'") || msg.includes("doctype")) {
    return "Odoo Session Error: الخادم أعاد صفحة HTML بدل JSON. غالبًا الجلسة لم تثبت أو تم تحويل الطلب إلى صفحة تسجيل الدخول. أعد حفظ الربط ثم جرّب مرة أخرى.";
  }
  if (msg.includes("unknown xml-rpc tag 'title'")) {
    return "Base URL Error: خادم Odoo أعاد صفحة HTML بدل XML-RPC. سنحاول مسار Web Session تلقائياً؛ تأكد أيضاً من Base URL الصحيح.";
  }
  if (msg.includes("timeout")) {
    return `تعذّر الاتصال بـ Odoo خلال المهلة. ${ODOO_SETTINGS_HINT}`;
  }
  return `تعذر الاتصال بـ Odoo: ${raw}`;
}

function humanizeGatewayError(error: unknown): string {
  const ge = asGatewayError(error);
  switch (ge.code) {
    case "OdooInvalidCredentials":
      return "Invalid Password: The Odoo password or username is incorrect.";
    case "OdooDatabaseNotFound":
      return "Database Name Error: قاعدة البيانات غير موجودة على خادم Odoo. في Odoo Online استخدم Browser Session Mode ولا تدخل DB يدويًا.";
    case "OdooCallKwHtmlRedirect":
    case "OdooSessionExpired":
      return "Odoo Session Error: انتهت جلسة Odoo أو تم تحويل الطلب لصفحة تسجيل الدخول. أعد حفظ الربط ثم أعد المحاولة.";
    case "OdooRateLimited":
      return "Odoo Rate Limit: تم تجاوز الحد المؤقت للطلبات. أعد المحاولة بعد لحظات.";
    case "OdooNetworkTimeout":
      return `تعذّر الاتصال بـ Odoo خلال المهلة. ${ODOO_SETTINGS_HINT}`;
    default:
      return humanizeOdooError(ge.message);
  }
}

async function authenticateWithFallback(params: {
  baseUrl: string;
  preferredDatabase: string;
  login: string;
  password: string;
}): Promise<{ uid: number; database: string }> {
  const attempts = candidateDatabases(params.baseUrl, params.preferredDatabase);
  console.error("[odoo-debug] fallback start", {
    baseUrl: params.baseUrl,
    login: params.login,
    preferredDatabase: params.preferredDatabase,
    attempts,
  });
  try {
    const loginPageDb = await withTimeout(
      discoverDatabaseFromLoginPage(params.baseUrl),
      Math.min(ODOO_CALL_TIMEOUT_MS, 4_000),
      "odoo_login_db_discovery"
    );
    if (loginPageDb && !attempts.includes(loginPageDb)) {
      attempts.unshift(loginPageDb);
    }
  } catch {
    // Continue with heuristics.
  }
  try {
    const listed = await withTimeout(
      discoverDatabasesFromWebList(params.baseUrl),
      Math.min(ODOO_CALL_TIMEOUT_MS, 4_000),
      "odoo_web_database_list"
    );
    for (const db of listed) {
      if (!attempts.includes(db)) attempts.unshift(db);
    }
  } catch {
    // Some instances disable db listing from web endpoint.
  }
  try {
    const listedJsonRpc = await withTimeout(
      discoverDatabasesFromJsonRpc(params.baseUrl),
      Math.min(ODOO_CALL_TIMEOUT_MS, 4_000),
      "odoo_jsonrpc_database_list"
    );
    for (const db of listedJsonRpc) {
      if (!attempts.includes(db)) attempts.unshift(db);
    }
  } catch {
    // keep going
  }
  try {
    const discovered = await withTimeout(
      odooListDatabases(params.baseUrl),
      Math.min(ODOO_CALL_TIMEOUT_MS, 4_000),
      "odoo_db_list"
    );
    for (const db of discovered) {
      if (!attempts.includes(db)) attempts.push(db);
    }
  } catch {
    // DB listing may be disabled on hosted Odoo; continue with heuristic candidates.
  }
  let lastErr = "Unknown Odoo authentication error";
  const rpcBaseCandidates = [params.baseUrl, params.baseUrl.replace(/\/odoo$/i, "")].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  );
  for (const db of attempts) {
    for (const rpcBase of rpcBaseCandidates) {
      try {
        const uid = await withTimeout(
          odooAuthenticate({
            baseUrl: rpcBase,
            database: db,
            login: params.login,
            password: params.password,
          }),
          ODOO_CALL_TIMEOUT_MS,
          "odoo_auth"
        );
        return { uid, database: db };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[odoo-debug] xmlrpc attempt fail", {
          rpcBase,
          db,
          error: msg.slice(0, 200),
        });
        lastErr = msg;
        // Don't keep trying DB candidates when credentials are wrong.
        const human = humanizeOdooError(msg);
        if (human.startsWith("Invalid Password")) {
          throw new Error(human);
        }
      }
    }
  }

  try {
    const viaJsonRpc = await withTimeout(
      authenticateViaJsonRpc({
        baseUrl: params.baseUrl,
        login: params.login,
        password: params.password,
        preferredDatabase: params.preferredDatabase,
      }),
      ODOO_CALL_TIMEOUT_MS,
      "odoo_jsonrpc_auth"
    );
    return viaJsonRpc;
  } catch (e) {
    lastErr = e instanceof Error ? e.message : String(e);
    console.error("[odoo-debug] jsonrpc final-error", { error: lastErr.slice(0, 220) });
    // If JSON-RPC returned a meaningful Odoo-side auth/database error, don't overwrite it
    // with CSRF-only noise from /web/session/authenticate fallback.
    const normalized = lastErr.toLowerCase();
    if (
      normalized.includes("database") ||
      normalized.includes("accesserror") ||
      normalized.includes("wrong login/password") ||
      normalized.includes("invalid password") ||
      normalized.includes("odoo server error")
    ) {
      throw new Error(lastErr);
    }
  }

  try {
    const viaWeb = await withTimeout(
      authenticateViaWebSession({
        baseUrl: params.baseUrl,
        login: params.login,
        password: params.password,
        preferredDatabase: params.preferredDatabase,
      }),
      ODOO_CALL_TIMEOUT_MS,
      "odoo_web_auth"
    );
    return viaWeb;
  } catch (e) {
    lastErr = e instanceof Error ? e.message : String(e);
  }
  throw new Error(lastErr);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchOdooOpenTasksForUser(
  bundle: OdooCredentialBundle
): Promise<{ tasks: OdooTaskRecord[]; error?: string }> {
  try {
    const password = decryptCredentialSecret(bundle.passwordEncrypted);
    const preferredDatabase = resolveDatabase(bundle);
    const baseUrl = sanitizeOdooBaseUrl(bundle.baseUrl);
    const { uid, database } = await authenticateWithFallback({
      baseUrl,
      preferredDatabase,
      login: bundle.username.trim(),
      password,
    });
    const customDomain = process.env.ODOO_OPEN_TASK_DOMAIN_JSON?.trim();
    let domain: unknown[];
    if (customDomain) {
      try {
        const parsed = JSON.parse(customDomain) as unknown;
        domain = Array.isArray(parsed) ? (parsed as unknown[]) : defaultOpenTaskDomain(uid);
      } catch {
        domain = defaultOpenTaskDomain(uid);
      }
    } else {
      domain = defaultOpenTaskDomain(uid);
    }
    const rows = await withTimeout(
      odooSearchRead<OdooTaskRecord>({
        baseUrl,
        database,
        uid,
        password,
        model: TASK_MODEL,
        domain,
        fields: [...TASK_FIELDS],
        limit: 60,
      }),
      ODOO_CALL_TIMEOUT_MS,
      "odoo_search_read"
    );

    const tasks = rows.map((r) => ({
      ...r,
      id: Number(r.id),
      user_ids: Array.isArray(r.user_ids) ? r.user_ids.map(Number) : [],
    }));

    return { tasks };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { tasks: [], error: humanizeOdooError(msg) };
  }
}

export async function fetchOdooOpenTasksViaWebLogin(
  bundle: OdooCredentialBundle
): Promise<{ tasks: OdooTaskRecord[]; error?: string }> {
  try {
    const tasksJson = await callKwWithSessionRetry(bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: TASK_MODEL,
        method: "search_read",
        args: [defaultOpenTaskDomain(session.uid)],
        kwargs: { fields: [...TASK_FIELDS], limit: 60 },
      })
    );
    const result = Array.isArray(tasksJson.result) ? tasksJson.result : [];
    const tasks = result
      .filter((x) => x && typeof x === "object")
      .map((r) => r as OdooTaskRecord)
      .map((r) => ({
        ...r,
        id: Number(r.id),
        user_ids: Array.isArray(r.user_ids) ? r.user_ids.map(Number) : [],
      }));
    return { tasks };
  } catch (e) {
    return { tasks: [], error: humanizeGatewayError(e) };
  }
}

export async function searchOdooTasksViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  text?: string;
  projectId?: number | null;
  stageId?: number | null;
  limit?: number;
  mineOnly?: boolean;
}): Promise<{ tasks: OdooWebTaskLite[]; error?: string }> {
  try {
    const domain: unknown[] = [];
    if (params.text?.trim()) {
      domain.push(["name", "ilike", params.text.trim()]);
    }
    if (Number.isFinite(Number(params.projectId))) {
      domain.push(["project_id", "=", Number(params.projectId)]);
    }
    if (Number.isFinite(Number(params.stageId))) {
      domain.push(["stage_id", "=", Number(params.stageId)]);
    }
    let json: Record<string, unknown>;
    try {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: TASK_MODEL,
          method: "search_read",
          args: [
            params.mineOnly
              ? [["create_uid", "=", session.uid], ...domain]
              : domain,
          ],
          kwargs: {
            fields: [
              "id",
              "name",
              "stage_id",
              "project_id",
              "date_deadline",
              "create_uid",
              "user_id",
              "user_ids",
              "description",
              "priority",
              "active",
            ],
            limit: Math.min(100, Math.max(1, Number(params.limit ?? 40))),
          },
        })
      );
    } catch {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: TASK_MODEL,
          method: "search_read",
          args: [
            params.mineOnly
              ? [["create_uid", "=", session.uid], ...domain]
              : domain,
          ],
          kwargs: {
            fields: ["id", "name", "stage_id", "project_id", "date_deadline"],
            limit: Math.min(100, Math.max(1, Number(params.limit ?? 40))),
          },
        })
      );
    }
    const rows = Array.isArray(json.result) ? json.result : [];
    const tasks = rows
      .filter((x) => x && typeof x === "object")
      .map((r) => r as OdooWebTaskLite)
      .map((r) => ({
        ...r,
        id: Number(r.id),
        name: String(r.name ?? ""),
        user_ids: Array.isArray(r.user_ids) ? r.user_ids.map(Number) : [],
      }));
    return { tasks };
  } catch (e) {
    return { tasks: [], error: humanizeGatewayError(e) };
  }
}

export async function updateOdooTaskStageViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  taskId: number;
  stageId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: TASK_MODEL,
        method: "write",
        args: [[params.taskId], { stage_id: params.stageId }],
      })
    );
    if (json.result !== true) {
      return { ok: false, error: "فشل تحديث مرحلة المهمة في Odoo." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function updateOdooTaskViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  taskId: number;
  name?: string;
  description?: string;
  stageId?: number;
  deadline?: string;
  active?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const values: Record<string, unknown> = {};
    if (typeof params.name === "string" && params.name.trim()) values.name = params.name.trim();
    if (typeof params.description === "string") values.description = params.description.trim();
    if (Number.isFinite(Number(params.stageId))) values.stage_id = Number(params.stageId);
    if (typeof params.deadline === "string" && params.deadline.trim()) values.date_deadline = params.deadline.trim();
    if (typeof params.active === "boolean") values.active = params.active;
    if (!Object.keys(values).length) return { ok: false, error: "لا توجد بيانات تعديل للمهمة." };
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: TASK_MODEL,
        method: "write",
        args: [[Number(params.taskId)], values],
      })
    );
    if (json.result !== true) return { ok: false, error: "فشل تحديث بيانات المهمة في Odoo." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function createOdooTaskViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  title: string;
  description?: string | null;
  projectId?: number | null;
  stageId?: number | null;
}): Promise<{ ok: true; taskId: number } | { ok: false; error: string }> {
  try {
    const values: Record<string, unknown> = { name: params.title.trim() };
    if (params.description?.trim()) values.description = params.description.trim();
    if (Number.isFinite(Number(params.projectId))) values.project_id = Number(params.projectId);
    if (Number.isFinite(Number(params.stageId))) values.stage_id = Number(params.stageId);
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: TASK_MODEL,
        method: "create",
        args: [values],
      })
    );
    const taskId = Number(json.result ?? 0);
    if (!taskId) {
      return { ok: false, error: "تعذر إنشاء المهمة في Odoo (لم يتم إرجاع معرّف)." };
    }
    return { ok: true, taskId };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function listOdooProjectsViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  text?: string;
  limit?: number;
  mineOnly?: boolean;
}): Promise<{ projects: OdooWebProjectLite[]; error?: string }> {
  try {
    const domain: unknown[] = [];
    if (params.text?.trim()) domain.push(["name", "ilike", params.text.trim()]);
    let json: Record<string, unknown>;
    try {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "project.project",
          method: "search_read",
          args: [params.mineOnly ? [["create_uid", "=", session.uid], ...domain] : domain],
          kwargs: {
            fields: ["id", "name", "active", "create_date", "create_uid", "user_id", "privacy_visibility"],
            order: "id desc",
            limit: Math.min(200, Math.max(1, Number(params.limit ?? 80))),
          },
        })
      );
    } catch {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "project.project",
          method: "search_read",
          args: [params.mineOnly ? [["create_uid", "=", session.uid], ...domain] : domain],
          kwargs: {
            fields: ["id", "name", "active", "create_date"],
            order: "id desc",
            limit: Math.min(200, Math.max(1, Number(params.limit ?? 80))),
          },
        })
      );
    }
    const rows = Array.isArray(json.result) ? json.result : [];
    const projects = rows
      .filter((x) => x && typeof x === "object")
      .map((r) => r as OdooWebProjectLite)
      .map((r) => ({
        id: Number(r.id),
        name: String(r.name ?? ""),
        active: Boolean(r.active ?? true),
        create_date: typeof r.create_date === "string" ? r.create_date : "",
        create_uid:
          Array.isArray(r.create_uid) && typeof r.create_uid[0] === "number" && typeof r.create_uid[1] === "string"
            ? ([Number(r.create_uid[0]), String(r.create_uid[1])] as [number, string])
            : (false as const),
        user_id:
          Array.isArray(r.user_id) && typeof r.user_id[0] === "number" && typeof r.user_id[1] === "string"
            ? ([Number(r.user_id[0]), String(r.user_id[1])] as [number, string])
            : (false as const),
        privacy_visibility: typeof r.privacy_visibility === "string" ? r.privacy_visibility : "",
      }));
    return { projects };
  } catch (e) {
    return { projects: [], error: humanizeGatewayError(e) };
  }
}

export async function createOdooProjectViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  name: string;
}): Promise<{ ok: true; projectId: number } | { ok: false; error: string }> {
  try {
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "project.project",
        method: "create",
        args: [{ name: params.name.trim() }],
      })
    );
    const projectId = Number(json.result ?? 0);
    if (!projectId) return { ok: false, error: "تعذر إنشاء المشروع في Odoo." };
    return { ok: true, projectId };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function updateOdooProjectViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  projectId: number;
  name?: string;
  active?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const values: Record<string, unknown> = {};
    if (typeof params.name === "string" && params.name.trim()) values.name = params.name.trim();
    if (typeof params.active === "boolean") values.active = params.active;
    if (!Object.keys(values).length) return { ok: false, error: "لا توجد بيانات تعديل للمشروع." };
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "project.project",
        method: "write",
        args: [[Number(params.projectId)], values],
      })
    );
    if (json.result !== true) return { ok: false, error: "فشل تحديث المشروع في Odoo." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function listOdooCalendarEventsViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  text?: string;
  limit?: number;
  mineOnly?: boolean;
  startFrom?: string;
  startBefore?: string;
}): Promise<{ events: OdooWebCalendarEventLite[]; error?: string }> {
  try {
    const domain: unknown[] = [];
    if (params.text?.trim()) domain.push(["name", "ilike", params.text.trim()]);
    const fromT = params.startFrom?.trim();
    const beforeT = params.startBefore?.trim();
    // Match Odoo calendar UI: include events that *overlap* the window, not only those whose `start` falls inside it.
    if (fromT && beforeT) {
      domain.push(["start", "<", beforeT]);
      domain.push(["stop", ">", fromT]);
    } else {
      if (fromT) domain.push(["start", ">=", fromT]);
      if (beforeT) domain.push(["start", "<", beforeT]);
    }
    let json: Record<string, unknown>;
    try {
      json = await callKwWithSessionRetry(params.bundle, async (session) => {
        const baseDomain = params.mineOnly ? [["create_uid", "=", session.uid] as const, ...domain] : domain;
        return webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "calendar.event",
          method: "search_read",
          args: [baseDomain],
          kwargs: {
            fields: [
              "id",
              "name",
              "start",
              "stop",
              "allday",
              "create_uid",
              "user_id",
              "partner_ids",
              "description",
              "location",
              "active",
              "res_model",
              "res_id",
            ],
            order: "start desc",
            limit: Math.min(300, Math.max(1, Number(params.limit ?? 120))),
          },
        });
      });
    } catch {
      json = await callKwWithSessionRetry(params.bundle, async (session) => {
        const baseDomain = params.mineOnly ? [["create_uid", "=", session.uid] as const, ...domain] : domain;
        return webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "calendar.event",
          method: "search_read",
          args: [baseDomain],
          kwargs: {
            fields: ["id", "name", "start", "stop", "allday"],
            order: "start desc",
            limit: Math.min(300, Math.max(1, Number(params.limit ?? 120))),
          },
        });
      });
    }
    const rows = Array.isArray(json.result) ? json.result : [];
    const events: OdooWebCalendarEventLite[] = rows
      .filter((x) => x && typeof x === "object")
      .map((r) => r as OdooWebCalendarEventLite)
      .map((r) => ({
        id: Number(r.id),
        name: String(r.name ?? ""),
        start: typeof r.start === "string" ? r.start : "",
        stop: typeof r.stop === "string" ? r.stop : "",
        allday: Boolean(r.allday ?? false),
        create_uid:
          Array.isArray(r.create_uid) && typeof r.create_uid[0] === "number" && typeof r.create_uid[1] === "string"
            ? ([Number(r.create_uid[0]), String(r.create_uid[1])] as [number, string])
            : (false as const),
        user_id:
          Array.isArray(r.user_id) && typeof r.user_id[0] === "number" && typeof r.user_id[1] === "string"
            ? ([Number(r.user_id[0]), String(r.user_id[1])] as [number, string])
            : (false as const),
        partner_ids: Array.isArray(r.partner_ids) ? r.partner_ids.map(Number) : [],
        description: typeof r.description === "string" ? r.description : (false as const),
        location: typeof r.location === "string" ? r.location : (false as const),
        active: Boolean(r.active ?? true),
        res_model: typeof r.res_model === "string" && r.res_model.trim() ? r.res_model : (false as const),
        res_id: typeof r.res_id === "number" && Number.isFinite(r.res_id) ? Number(r.res_id) : (false as const),
      }));
    const agendaByEvent = await fetchMailActivitiesForCalendarEvents({
      bundle: params.bundle,
      eventIds: events.map((e) => e.id),
    });
    for (const e of events) {
      const lines = agendaByEvent.get(e.id);
      if (lines?.length) e.agendaLines = lines;
    }
    return { events };
  } catch (e) {
    return { events: [], error: humanizeGatewayError(e) };
  }
}

export async function createOdooCalendarEventViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  name: string;
  start: string;
  stop: string;
  allday?: boolean;
  description?: string;
  location?: string;
  partnerIds?: number[];
  userId?: number;
}): Promise<{ ok: true; eventId: number } | { ok: false; error: string }> {
  try {
    const values: Record<string, unknown> = {
      name: params.name.trim(),
      start: params.start,
      stop: params.stop,
      allday: Boolean(params.allday ?? false),
    };
    if (typeof params.description === "string" && params.description.trim()) {
      values.description = params.description.trim();
    }
    if (typeof params.location === "string" && params.location.trim()) {
      values.location = params.location.trim();
    }
    if (Array.isArray(params.partnerIds) && params.partnerIds.length) {
      values.partner_ids = params.partnerIds.map(Number).filter((v) => Number.isFinite(v) && v > 0);
    }
    if (Number.isFinite(params.userId) && Number(params.userId) > 0) {
      values.user_id = Number(params.userId);
    }
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "calendar.event",
        method: "create",
        args: [values],
      })
    );
    const eventId = Number(json.result ?? 0);
    if (!eventId) return { ok: false, error: "تعذر إنشاء حدث التقويم في Odoo." };
    return { ok: true, eventId };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function updateOdooCalendarEventViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  eventId: number;
  name?: string;
  start?: string;
  stop?: string;
  allday?: boolean;
  description?: string;
  location?: string;
  partnerIds?: number[];
  userId?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const values: Record<string, unknown> = {};
    if (typeof params.name === "string" && params.name.trim()) values.name = params.name.trim();
    if (typeof params.start === "string" && params.start.trim()) values.start = params.start.trim();
    if (typeof params.stop === "string" && params.stop.trim()) values.stop = params.stop.trim();
    if (typeof params.allday === "boolean") values.allday = params.allday;
    if (typeof params.description === "string") values.description = params.description.trim();
    if (typeof params.location === "string") values.location = params.location.trim();
    if (Array.isArray(params.partnerIds)) {
      values.partner_ids = params.partnerIds.map(Number).filter((v) => Number.isFinite(v) && v > 0);
    }
    if (Number.isFinite(params.userId) && Number(params.userId) > 0) {
      values.user_id = Number(params.userId);
    }
    if (!Object.keys(values).length) return { ok: false, error: "لا توجد بيانات تعديل للتقويم." };
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "calendar.event",
        method: "write",
        args: [[Number(params.eventId)], values],
      })
    );
    if (json.result !== true) return { ok: false, error: "فشل تحديث حدث التقويم في Odoo." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function copyOdooCalendarEventViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  eventId: number;
  name?: string;
  start?: string;
  stop?: string;
  allday?: boolean;
  description?: string;
  location?: string;
  partnerIds?: number[];
  userId?: number;
}): Promise<{ ok: true; eventId: number } | { ok: false; error: string }> {
  try {
    const defaults: Record<string, unknown> = {};
    if (typeof params.name === "string" && params.name.trim()) defaults.name = params.name.trim();
    if (typeof params.start === "string" && params.start.trim()) defaults.start = params.start.trim();
    if (typeof params.stop === "string" && params.stop.trim()) defaults.stop = params.stop.trim();
    if (typeof params.allday === "boolean") defaults.allday = params.allday;
    if (typeof params.description === "string") defaults.description = params.description.trim();
    if (typeof params.location === "string") defaults.location = params.location.trim();
    if (Array.isArray(params.partnerIds)) {
      defaults.partner_ids = params.partnerIds.map(Number).filter((v) => Number.isFinite(v) && v > 0);
    }
    if (Number.isFinite(params.userId) && Number(params.userId) > 0) {
      defaults.user_id = Number(params.userId);
    }
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: "calendar.event",
        method: "copy",
        args: [[Number(params.eventId)], defaults],
      })
    );
    const eventId = Number(json.result ?? 0);
    if (!eventId) return { ok: false, error: "تعذر نسخ حدث التقويم في Odoo." };
    return { ok: true, eventId };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function listOdooDocumentsViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  text?: string;
  limit?: number;
  mineOnly?: boolean;
}): Promise<{ documents: OdooWebDocumentLite[]; error?: string }> {
  try {
    const domain: unknown[] = [];
    if (params.text?.trim()) domain.push(["name", "ilike", params.text.trim()]);
    let json: Record<string, unknown>;
    try {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "documents.document",
          method: "search_read",
          args: [params.mineOnly ? [["create_uid", "=", session.uid], ...domain] : domain],
          kwargs: {
            fields: ["id", "name", "type", "mimetype", "create_date", "create_uid"],
            order: "id desc",
            limit: Math.min(200, Math.max(1, Number(params.limit ?? 80))),
          },
        })
      );
    } catch {
      // Fallback for tenants without documents app access.
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "ir.attachment",
          method: "search_read",
          args: [params.mineOnly ? [["create_uid", "=", session.uid], ...domain] : domain],
          kwargs: {
            fields: ["id", "name", "type", "mimetype", "create_date", "create_uid"],
            order: "id desc",
            limit: Math.min(200, Math.max(1, Number(params.limit ?? 80))),
          },
        })
      );
    }
    const rows = Array.isArray(json.result) ? json.result : [];
    const documents = rows
      .filter((x) => x && typeof x === "object")
      .map((r) => r as OdooWebDocumentLite)
      .map((r) => ({
        id: Number(r.id),
        name: String(r.name ?? ""),
        type: typeof r.type === "string" ? r.type : "",
        mimetype: typeof r.mimetype === "string" ? r.mimetype : (false as const),
        create_date: typeof r.create_date === "string" ? r.create_date : "",
        create_uid:
          Array.isArray(r.create_uid) && typeof r.create_uid[0] === "number" && typeof r.create_uid[1] === "string"
            ? ([Number(r.create_uid[0]), String(r.create_uid[1])] as [number, string])
            : (false as const),
      }));
    return { documents };
  } catch (e) {
    return { documents: [], error: humanizeGatewayError(e) };
  }
}

export async function createOdooDocumentViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  name: string;
}): Promise<{ ok: true; documentId: number } | { ok: false; error: string }> {
  try {
    let json: Record<string, unknown>;
    try {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "documents.document",
          method: "create",
          args: [{ name: params.name.trim(), type: "empty" }],
        })
      );
    } catch {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "ir.attachment",
          method: "create",
          args: [{ name: params.name.trim(), type: "url", url: "https://example.com" }],
        })
      );
    }
    const documentId = Number(json.result ?? 0);
    if (!documentId) return { ok: false, error: "تعذر إنشاء المستند في Odoo." };
    return { ok: true, documentId };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function updateOdooDocumentViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  documentId: number;
  name: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    let json: Record<string, unknown>;
    try {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "documents.document",
          method: "write",
          args: [[Number(params.documentId)], { name: params.name.trim() }],
        })
      );
    } catch {
      json = await callKwWithSessionRetry(params.bundle, async (session) =>
        webCallKw({
          baseUrl: session.baseUrl,
          cookieHeader: session.cookieHeader,
          model: "ir.attachment",
          method: "write",
          args: [[Number(params.documentId)], { name: params.name.trim() }],
        })
      );
    }
    if (json.result !== true) return { ok: false, error: "فشل تحديث المستند في Odoo." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function archiveOdooRecordViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  model: string;
  id: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: params.model,
        method: "write",
        args: [[Number(params.id)], { active: false }],
      })
    );
    if (json.result !== true) return { ok: false, error: `فشل أرشفة السجل #${params.id} (${params.model}).` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

export async function deleteOdooRecordViaWebLogin(params: {
  bundle: OdooCredentialBundle;
  model: string;
  id: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const json = await callKwWithSessionRetry(params.bundle, async (session) =>
      webCallKw({
        baseUrl: session.baseUrl,
        cookieHeader: session.cookieHeader,
        model: params.model,
        method: "unlink",
        args: [[Number(params.id)]],
      })
    );
    if (json.result !== true) return { ok: false, error: `فشل حذف السجل #${params.id} (${params.model}).` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: humanizeGatewayError(e) };
  }
}

/** Lightweight auth check only (no task fetch). Used by «فحص الاتصال». */
export async function testOdooLoginPlain(params: {
  baseUrl: string;
  databaseName: string;
  loginUsername: string;
  passwordPlain: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    console.error("[odoo-debug] test input", {
      baseUrl: params.baseUrl,
      databaseName: params.databaseName,
      loginUsername: params.loginUsername,
      hasPassword: Boolean(params.passwordPlain),
    });
    const baseUrl = sanitizeOdooBaseUrl(params.baseUrl);
    const db = params.databaseName.trim();
    await authenticateWithFallback({
      baseUrl,
      preferredDatabase: db,
      login: params.loginUsername.trim(),
      password: params.passwordPlain,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: humanizeOdooError(msg) };
  }
}

export async function odooConnectionProbe(bundle: OdooCredentialBundle): Promise<{
  ok: boolean;
  message: string;
}> {
  const res = await fetchOdooOpenTasksForUser(bundle);
  if (res.error) {
    return { ok: false, message: res.error };
  }
  return {
    ok: true,
    message: `الاتصال ناجح. وُجدت ${res.tasks.length} مهمة مفتوحة مرتبطة بحسابك (نموذج ${TASK_MODEL}).`,
  };
}

export async function odooUpdateTaskStage(params: {
  bundle: OdooCredentialBundle;
  taskId: number;
  stageId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const password = decryptCredentialSecret(params.bundle.passwordEncrypted);
    const preferredDatabase = resolveDatabase(params.bundle);
    const baseUrl = sanitizeOdooBaseUrl(params.bundle.baseUrl);
    const { uid, database } = await authenticateWithFallback({
      baseUrl,
      preferredDatabase,
      login: params.bundle.username.trim(),
      password,
    });
    const ok = await withTimeout(
      odooWrite({
        baseUrl,
        database,
        uid,
        password,
        model: TASK_MODEL,
        ids: [params.taskId],
        values: { stage_id: params.stageId },
      }),
      ODOO_CALL_TIMEOUT_MS,
      "odoo_write"
    );
    if (!ok) {
      return { ok: false, error: "رفض Odoo عملية التحديث." };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: humanizeOdooError(msg) };
  }
}

export async function odooVerifyTaskAssigned(params: {
  bundle: OdooCredentialBundle;
  taskId: number;
  odooUid: number;
}): Promise<boolean> {
  try {
    const password = decryptCredentialSecret(params.bundle.passwordEncrypted);
    const preferredDatabase = resolveDatabase(params.bundle);
    const baseUrl = sanitizeOdooBaseUrl(params.bundle.baseUrl);
    const { database } = await authenticateWithFallback({
      baseUrl,
      preferredDatabase,
      login: params.bundle.username.trim(),
      password,
    });
    const row = await withTimeout(
      odooReadOne({
        baseUrl,
        database,
        uid: params.odooUid,
        password,
        model: TASK_MODEL,
        id: params.taskId,
        fields: ["user_ids", "user_id"],
      }),
      ODOO_CALL_TIMEOUT_MS,
      "odoo_read_one"
    );
    if (!row) return false;
    const userIds = Array.isArray(row.user_ids) ? (row.user_ids as number[]) : [];
    const userId = row.user_id;
    const single =
      Array.isArray(userId) && typeof userId[0] === "number" ? userId[0] : false;
    if (userIds.includes(params.odooUid)) return true;
    if (single === params.odooUid) return true;
    return false;
  } catch {
    return false;
  }
}

export async function odooAuthenticateUid(bundle: OdooCredentialBundle): Promise<number> {
  const password = decryptCredentialSecret(bundle.passwordEncrypted);
  const preferredDatabase = resolveDatabase(bundle);
  const baseUrl = sanitizeOdooBaseUrl(bundle.baseUrl);
  const { uid } = await authenticateWithFallback({
    baseUrl,
    preferredDatabase,
    login: bundle.username.trim(),
    password,
  });
  return uid;
}
