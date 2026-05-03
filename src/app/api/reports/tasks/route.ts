import { NextRequest, NextResponse } from "next/server";
import { createRouteSupabaseClient } from "@/lib/supabase/route-handler";
import { resolveTaskReportScope } from "@/lib/dashboard-scope";
import { loadTaskExportRows } from "@/lib/reports/task-export-data";
import { buildTasksExcelBuffer } from "@/lib/reports/excel-tasks";
import { buildTasksPdfBuffer } from "@/lib/reports/pdf-tasks";

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
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";

  const rows = await loadTaskExportRows(supabase, scope, tenantFilter);

  if (format === "pdf") {
    const buf = await buildTasksPdfBuffer(rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="tasks-report.pdf"',
      },
    });
  }

  const buf = await buildTasksExcelBuffer(rows);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="tasks-report.xlsx"',
    },
  });
}
