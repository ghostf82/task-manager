import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ODOO_BROWSER_MODE_DB } from "@/lib/ai-agent/load-user-integrations";
import { sanitizeOdooBaseUrl } from "@/lib/integrations/odoo-xmlrpc";

export type CompanyOdooConnectionMode = "browser_session" | "api";

export type CompanyOdooSettings = {
  baseUrl: string;
  connectionMode: CompanyOdooConnectionMode;
  apiDatabaseName: string;
  updatedAt: string | null;
};

const SETTINGS_ID = "default";

function normalizeBaseUrl(raw: string): string {
  const v = sanitizeOdooBaseUrl(raw.trim());
  if (!v) return "";
  return v.endsWith("/") ? v.slice(0, -1) : v;
}

export async function loadCompanyOdooSettings(
  supabase: SupabaseClient
): Promise<CompanyOdooSettings> {
  const { data } = await supabase
    .from("company_odoo_settings")
    .select("base_url, connection_mode, api_database_name, updated_at")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  const modeRaw = String(data?.connection_mode ?? "browser_session").trim();
  const connectionMode: CompanyOdooConnectionMode =
    modeRaw === "api" ? "api" : "browser_session";

  return {
    baseUrl: normalizeBaseUrl(String(data?.base_url ?? "")),
    connectionMode,
    apiDatabaseName: String(data?.api_database_name ?? "").trim(),
    updatedAt: data?.updated_at ? String(data.updated_at) : null,
  };
}

/** Global URL first; fall back to the user's saved row (backward compatibility). */
export async function resolveEffectiveOdooBaseUrl(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const company = await loadCompanyOdooSettings(supabase);
  if (company.baseUrl) return company.baseUrl;

  const { data } = await supabase
    .from("user_odoo_credentials")
    .select("base_url")
    .eq("user_id", userId)
    .maybeSingle();

  return normalizeBaseUrl(String(data?.base_url ?? ""));
}

export function databaseNameForMode(
  mode: CompanyOdooConnectionMode,
  apiDatabaseName: string
): string {
  if (mode === "browser_session") return ODOO_BROWSER_MODE_DB;
  return apiDatabaseName.trim();
}

/**
 * Effective connection mode: company setting when configured; else infer from user row.
 */
export async function resolveEffectiveOdooConnectionMode(
  supabase: SupabaseClient,
  userId: string
): Promise<{ mode: CompanyOdooConnectionMode | "none"; baseUrl: string }> {
  const company = await loadCompanyOdooSettings(supabase);
  const baseUrl = await resolveEffectiveOdooBaseUrl(supabase, userId);
  if (!baseUrl) return { mode: "none", baseUrl: "" };

  if (company.baseUrl) {
    return { mode: company.connectionMode, baseUrl };
  }

  const { data } = await supabase
    .from("user_odoo_credentials")
    .select("database_name")
    .eq("user_id", userId)
    .maybeSingle();

  const dbName = String(data?.database_name ?? "").trim();
  if (dbName === ODOO_BROWSER_MODE_DB) {
    return { mode: "browser_session", baseUrl };
  }
  if (dbName) {
    return { mode: "api", baseUrl };
  }
  return { mode: "browser_session", baseUrl };
}

export function isBrowserSessionDatabaseName(dbName: string | null | undefined): boolean {
  return String(dbName ?? "").trim() === ODOO_BROWSER_MODE_DB;
}
