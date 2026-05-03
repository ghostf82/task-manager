import ExcelJS from "exceljs";
import type { TaskExportRow } from "@/lib/reports/task-export-data";

const toneFill: Record<
  TaskExportRow["tone"],
  { argb: string }
> = {
  overdue: { argb: "FFFFE4E6" },
  due_soon: { argb: "FFFEF3C7" },
  followed_today: { argb: "FFD1FAE5" },
  completed: { argb: "FFDCFCE7" },
  neutral: { argb: "FFF9FAFB" },
};

export async function buildTasksExcelBuffer(
  rows: TaskExportRow[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Task Manager";
  const ws = wb.addWorksheet("المهام", {
    views: [{ rightToLeft: true }],
  });

  const headers = [
    "#",
    "الشركة",
    "المهمة",
    "المسؤول",
    "إصدار",
    "انتهاء",
    "متابعة",
    "متابعة اليوم",
    "الحالة",
    "%",
    "أيام",
    "أشهر",
    "ملاحظات",
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    const row = ws.addRow([
      r.display_number,
      r.tenant_name,
      r.title,
      r.assignee,
      r.issued_on,
      r.due_on,
      r.follow_up_on,
      r.followed_today,
      r.status_ar,
      r.completion_percent,
      r.days_remaining,
      r.months_remaining,
      r.notes,
    ]);
    for (let c = 1; c <= 13; c++) {
      const cell = row.getCell(c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: toneFill[r.tone],
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    }
  }

  ws.columns.forEach((c, i) => {
    c.width = [6, 18, 28, 18, 12, 12, 12, 12, 14, 6, 8, 8, 36][i] ?? 14;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
