import {
  DocumentsPageClient,
  type CompanyDocumentRow,
} from "@/app/dashboard/documents/documents-page-client";
import { requireSession } from "@/lib/dashboard-auth";
import { buildDocumentsCopy } from "@/lib/i18n/documents-copy";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { t } = await getTranslator();
  const copy = buildDocumentsCopy(t);
  const serverToday = new Date().toISOString().slice(0, 10);

  const [{ data: rows, error }, { data: tenants }] = await Promise.all([
    supabase
      .from("company_documents")
      .select(
        "id, tenant_id, document_name, document_number, expiry_date, alert_days_before, status, file_url, updated_at, tenants ( name )"
      )
      .order("expiry_date", { ascending: true }),
    supabase.from("tenants").select("id,name,is_active").order("name"),
  ]);

  if (error) {
    return (
      <p className="text-destructive text-sm">
        {copy.loadError}: {error.message}
      </p>
    );
  }

  let defaultTenantId: string | null = null;
  if (!session.isSuperAdmin) {
    const { data: m } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", session.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    defaultTenantId = m?.tenant_id ?? null;
  }

  return (
    <DocumentsPageClient
      documents={(rows ?? []) as CompanyDocumentRow[]}
      tenants={tenants ?? []}
      isSuperAdmin={session.isSuperAdmin}
      defaultTenantId={defaultTenantId}
      copy={copy}
      serverToday={serverToday}
    />
  );
}
