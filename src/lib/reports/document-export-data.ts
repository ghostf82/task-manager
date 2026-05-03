import type { SupabaseClient } from "@supabase/supabase-js";

import {
  documentDaysUntilExpiry,
  documentRowTone,
  documentStatusLabelsAr,
  type CompanyDocumentStatus,
  type DocumentRowTone,
} from "@/lib/company-documents";
import type { TaskReportScope } from "@/lib/dashboard-scope";

export type CompanyDocumentExportRow = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  document_name: string;
  document_number: string | null;
  expiry_date: string;
  alert_days_before: number;
  status: CompanyDocumentStatus;
  status_ar: string;
  file_url: string | null;
  tone: DocumentRowTone;
  days_until_expiry: number;
  updated_at: string;
};

export async function loadCompanyDocumentExportRows(
  supabase: SupabaseClient,
  scope: TaskReportScope,
  tenantFilter: string | null
): Promise<CompanyDocumentExportRow[]> {
  let q = supabase
    .from("company_documents")
    .select(
      "id, tenant_id, document_name, document_number, expiry_date, alert_days_before, status, file_url, updated_at, tenants ( name )"
    )
    .order("expiry_date", { ascending: true });

  if (scope.mode === "tenants") {
    if (!scope.tenantIds.length) return [];
    q = q.in("tenant_id", scope.tenantIds);
  }

  if (tenantFilter) {
    q = q.eq("tenant_id", tenantFilter);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (data ?? []).map((raw) => {
    const t = raw.tenants as { name?: string } | { name?: string }[] | null;
    const tenantName = Array.isArray(t)
      ? String(t[0]?.name ?? "")
      : String((t as { name?: string } | null)?.name ?? "");

    const expiry_date = String(raw.expiry_date);
    const alert_days_before = Number(raw.alert_days_before);
    const status = raw.status as CompanyDocumentStatus;
    const tone = documentRowTone(expiry_date, alert_days_before, todayStr);

    return {
      id: raw.id as string,
      tenant_id: raw.tenant_id as string,
      tenant_name: tenantName,
      document_name: String(raw.document_name),
      document_number: raw.document_number ? String(raw.document_number) : null,
      expiry_date,
      alert_days_before,
      status,
      status_ar: documentStatusLabelsAr[status] ?? status,
      file_url: raw.file_url ? String(raw.file_url) : null,
      tone,
      days_until_expiry: documentDaysUntilExpiry(expiry_date, todayStr),
      updated_at: String(raw.updated_at),
    };
  });
}
