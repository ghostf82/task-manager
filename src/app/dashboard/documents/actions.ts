"use server";

import { revalidatePath } from "next/cache";

import type { CompanyDocumentStatus } from "@/lib/company-documents";
import { requireSession } from "@/lib/dashboard-auth";
import { tAction } from "@/lib/i18n/action-messages";
import { createClient } from "@/lib/supabase/server";

export type CompanyDocumentPayload = {
  tenant_id: string;
  document_name: string;
  document_number?: string | null;
  expiry_date: string;
  alert_days_before: number;
  status: CompanyDocumentStatus;
  file_url?: string | null;
};

async function assertPayload(input: CompanyDocumentPayload) {
  if (!input.tenant_id) throw new Error(await tAction("errors.documents.selectTenant"));
  if (!input.document_name?.trim())
    throw new Error(await tAction("errors.documents.nameRequired"));
  if (!input.expiry_date) throw new Error(await tAction("errors.documents.expiryRequired"));
  const n = Number(input.alert_days_before);
  if (!Number.isFinite(n) || n < 0 || n > 730) {
    throw new Error(await tAction("errors.documents.alertRange"));
  }
  const allowed: CompanyDocumentStatus[] = [
    "valid",
    "expired",
    "renewal_pending",
  ];
  if (!allowed.includes(input.status))
    throw new Error(await tAction("errors.documents.invalidStatus"));
}

export async function createCompanyDocumentAction(input: CompanyDocumentPayload) {
  const session = await requireSession();
  await assertPayload(input);
  const supabase = await createClient();

  const { error } = await supabase.from("company_documents").insert({
    tenant_id: input.tenant_id,
    document_name: input.document_name.trim(),
    document_number: input.document_number?.trim() || null,
    expiry_date: input.expiry_date,
    alert_days_before: Math.round(Number(input.alert_days_before)),
    status: input.status,
    file_url: input.file_url?.trim() || null,
    created_by: session.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/documents");
}

export async function updateCompanyDocumentAction(
  id: string,
  input: CompanyDocumentPayload
) {
  await requireSession();
  await assertPayload(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("company_documents")
    .update({
      tenant_id: input.tenant_id,
      document_name: input.document_name.trim(),
      document_number: input.document_number?.trim() || null,
      expiry_date: input.expiry_date,
      alert_days_before: Math.round(Number(input.alert_days_before)),
      status: input.status,
      file_url: input.file_url?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/documents");
}

export async function deleteCompanyDocumentAction(id: string) {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("company_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/documents");
}
