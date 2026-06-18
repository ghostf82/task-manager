"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/dashboard-auth";
import { isBrowserSessionDatabaseName } from "@/lib/integrations/company-odoo-settings";
import type { CompanyOdooConnectionMode } from "@/lib/integrations/company-odoo-settings";
import { sanitizeOdooBaseUrl } from "@/lib/integrations/odoo-xmlrpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OdooConnectionAdminRow = {
  userId: string;
  email: string;
  fullName: string;
  connected: boolean;
  loginUsername: string | null;
  connectionMode: "browser_session" | "api" | "none";
  credentialsUpdatedAt: string | null;
  lastSyncAt: string | null;
};

export async function saveCompanyOdooSettingsAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const supabase = await createClient();

  const baseUrl = sanitizeOdooBaseUrl(String(formData.get("base_url") ?? "").trim());
  const modeRaw = String(formData.get("connection_mode") ?? "browser_session").trim();
  const connectionMode: CompanyOdooConnectionMode =
    modeRaw === "api" ? "api" : "browser_session";
  const apiDatabaseName = String(formData.get("api_database_name") ?? "").trim();

  if (!baseUrl) {
    redirect("/dashboard/settings/integrations?err=odoo_company_url");
  }
  if (connectionMode === "api" && !apiDatabaseName) {
    redirect("/dashboard/settings/integrations?err=odoo_company_db");
  }

  const { error } = await supabase.from("company_odoo_settings").upsert(
    {
      id: "default",
      base_url: baseUrl,
      connection_mode: connectionMode,
      api_database_name: connectionMode === "api" ? apiDatabaseName : null,
      updated_by: session.id,
    },
    { onConflict: "id" }
  );

  if (error) {
    redirect("/dashboard/settings/integrations?err=odoo_company_save");
  }

  revalidatePath("/dashboard/settings/integrations");
  redirect("/dashboard/settings/integrations?saved=odoo_company");
}

export async function loadOdooConnectionsAdminOverview(): Promise<OdooConnectionAdminRow[]> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const [{ data: users }, { data: creds }, { data: cacheRows }] = await Promise.all([
    admin.from("users").select("id, email, full_name").order("email"),
    admin
      .from("user_odoo_credentials")
      .select("user_id, login_username, database_name, updated_at"),
    admin.from("odoo_browser_cache").select("user_id, updated_at"),
  ]);

  const credByUser = new Map((creds ?? []).map((c) => [String(c.user_id), c]));
  const lastSyncByUser = new Map<string, string>();
  for (const row of cacheRows ?? []) {
    const uid = String(row.user_id);
    const ts = String(row.updated_at ?? "");
    const prev = lastSyncByUser.get(uid);
    if (!prev || Date.parse(ts) > Date.parse(prev)) {
      lastSyncByUser.set(uid, ts);
    }
  }

  return (users ?? []).map((u) => {
    const cred = credByUser.get(String(u.id));
    const dbName = cred ? String(cred.database_name ?? "") : "";
    let connectionMode: OdooConnectionAdminRow["connectionMode"] = "none";
    if (cred) {
      connectionMode = isBrowserSessionDatabaseName(dbName) ? "browser_session" : "api";
    }
    return {
      userId: String(u.id),
      email: String(u.email ?? ""),
      fullName: String(u.full_name ?? "").trim(),
      connected: Boolean(cred?.login_username),
      loginUsername: cred ? String(cred.login_username ?? "") : null,
      connectionMode,
      credentialsUpdatedAt: cred?.updated_at ? String(cred.updated_at) : null,
      lastSyncAt: lastSyncByUser.get(String(u.id)) ?? null,
    };
  });
}

export async function seedCompanyOdooFromMyCredentialsAction() {
  const session = await requireSuperAdmin();
  const supabase = await createClient();

  const { data: mine } = await supabase
    .from("user_odoo_credentials")
    .select("base_url, database_name")
    .eq("user_id", session.id)
    .maybeSingle();

  if (!mine?.base_url) {
    redirect("/dashboard/settings/integrations?err=odoo_company_seed");
  }

  const dbName = String(mine.database_name ?? "").trim();
  const connectionMode = isBrowserSessionDatabaseName(dbName) ? "browser_session" : "api";

  const { error } = await supabase.from("company_odoo_settings").upsert(
    {
      id: "default",
      base_url: sanitizeOdooBaseUrl(String(mine.base_url)),
      connection_mode: connectionMode,
      api_database_name: connectionMode === "api" ? dbName : null,
      updated_by: session.id,
    },
    { onConflict: "id" }
  );

  if (error) {
    redirect("/dashboard/settings/integrations?err=odoo_company_save");
  }

  revalidatePath("/dashboard/settings/integrations");
  redirect("/dashboard/settings/integrations?saved=odoo_company");
}
