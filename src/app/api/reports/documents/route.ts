import { NextRequest, NextResponse } from "next/server";

import { resolveTaskReportScope } from "@/lib/dashboard-scope";
import { loadCompanyDocumentExportRows } from "@/lib/reports/document-export-data";
import { buildCompanyDocumentsExcelBuffer } from "@/lib/reports/excel-company-documents";
import { createRouteSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET(req: NextRequest) {
  const supabase = await createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  const scope = await resolveTaskReportScope(
    supabase,
    user.id,
    Boolean(profile?.is_super_admin)
  );

  const tenantFilter = req.nextUrl.searchParams.get("tenantId");
  const rows = await loadCompanyDocumentExportRows(
    supabase,
    scope,
    tenantFilter
  );

  const buf = await buildCompanyDocumentsExcelBuffer(rows);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="company-documents-report.xlsx"',
    },
  });
}
