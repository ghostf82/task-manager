import ExcelJS from "exceljs";

import { documentToneExcelArgb } from "@/lib/company-documents";
import type { CompanyDocumentExportRow } from "@/lib/reports/document-export-data";

export async function buildCompanyDocumentsExcelBuffer(
  rows: CompanyDocumentExportRow[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Task Manager";
  const ws = wb.addWorksheet("مستندات الشركات", {
    views: [{ rightToLeft: true }],
  });

  const headers = [
    "الشركة",
    "اسم المستند",
    "رقم المستند",
    "تاريخ الانتهاء",
    "تنبيه قبل (أيام)",
    "الحالة",
    "أيام متبقية",
    "رابط المرفق",
    "آخر تحديث",
  ];
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 12 };
  headerRow.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
  for (let c = 1; c <= 9; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF9CA3AF" } },
      left: { style: "thin", color: { argb: "FF9CA3AF" } },
      bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
      right: { style: "thin", color: { argb: "FF9CA3AF" } },
    };
  }

  for (const r of rows) {
    const row = ws.addRow([
      r.tenant_name,
      r.document_name,
      r.document_number ?? "—",
      r.expiry_date,
      r.alert_days_before,
      r.status_ar,
      r.days_until_expiry,
      r.file_url ?? "—",
      new Date(r.updated_at).toLocaleString("ar-SA"),
    ]);
    row.font = { bold: true, size: 11 };
    row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
    const fillArgb = documentToneExcelArgb[r.tone];
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fillArgb },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    }
  }

  ws.columns = [
    { width: 22 },
    { width: 28 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 36 },
    { width: 22 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
