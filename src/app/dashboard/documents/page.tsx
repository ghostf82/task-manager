import {
  DocumentsPageClient,
  type CompanyDocumentRow,
} from "@/app/dashboard/documents/documents-page-client";
import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentsPage() {
  const session = await requireSession();
  const supabase = await createClient();

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
        تعذّر تحميل المستندات: {error.message}
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
    />
  );
}
