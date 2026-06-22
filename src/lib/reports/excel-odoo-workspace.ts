import ExcelJS from "exceljs";

import type { OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import type { OdooProjectEnrichedRow } from "@/lib/integrations/odoo-project-enrich";
import type { OdooTaskUiRow } from "@/lib/integrations/odoo-task-ui-types";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const ALT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "right", readingOrder: "rtl" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
  row.height = 22;
}

function applySheetRtl(ws: ExcelJS.Worksheet) {
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 48) {
  ws.columns.forEach((col) => {
    if (!col) return;
    let w = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      w = Math.min(max, Math.max(w, len + 2));
    });
    col.width = w;
  });
}

export async function buildOdooWorkspaceExcelBuffer(input: {
  brief: OdooOperationalBrief;
  tasks: OdooTaskUiRow[];
  projects: OdooProjectEnrichedRow[];
  events: Array<{ id: number; name: string; start: string; stop: string; responsible: string }>;
  generatedAt: string;
  title: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Odoo Workspace";
  wb.created = new Date();

  // Summary sheet
  const summary = wb.addWorksheet("ملخص", { properties: { defaultColWidth: 18 } });
  applySheetRtl(summary);
  summary.addRow(["تقرير مساحة عمل Odoo"]);
  summary.addRow(["تاريخ التوليد", input.generatedAt]);
  summary.addRow(["المستخدم", input.brief.loginUsername ?? "—"]);
  summary.addRow([]);
  const c = input.brief.counts;
  summary.addRow(["المؤشر", "القيمة"]);
  [
    ["مهام متأخرة", c.overdueTasks],
    ["مستحقة خلال 7 أيام", c.due7Days],
    ["أولوية عالية", c.highPriorityTasks],
    ["غير مسندة", c.unassignedTasks],
    ["مشاريع نشطة", c.activeProjects],
    ["أحداث اليوم", c.eventsToday],
    ["مخاطر امتثال", c.complianceOverdue + c.complianceWarning],
  ].forEach(([k, v]) => summary.addRow([k, v]));
  styleHeaderRow(summary.getRow(5));

  // Tasks
  const wsTasks = wb.addWorksheet("المهام");
  applySheetRtl(wsTasks);
  wsTasks.addRow(["ID", "العنوان", "المشروع", "المرحلة", "الاستحقاق", "المسؤول", "الأولوية", "الحالة"]);
  styleHeaderRow(wsTasks.getRow(1));
  input.tasks.forEach((t, i) => {
    const row = wsTasks.addRow([
      t.id,
      t.name,
      t.project,
      t.stage,
      t.deadline,
      t.responsible,
      t.priority,
      t.active ? "نشط" : "مؤرشف",
    ]);
    if (i % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_FILL; });
    const due = Date.parse(String(t.deadline).replace(" ", "T"));
    if (Number.isFinite(due) && due < Date.now()) {
      row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    }
  });
  wsTasks.autoFilter = { from: "A1", to: "H1" };
  autoWidth(wsTasks);

  // Projects
  const wsProjects = wb.addWorksheet("المشاريع");
  applySheetRtl(wsProjects);
  wsProjects.addRow([
    "ID",
    "الاسم",
    "المدير",
    "الشريك",
    "البداية",
    "النهاية",
    "المهام",
    "مفتوحة",
    "متأخرة",
    "أحداث مرتبطة",
  ]);
  styleHeaderRow(wsProjects.getRow(1));
  input.projects.forEach((p, i) => {
    const row = wsProjects.addRow([
      p.id,
      p.name,
      p.manager,
      p.partner,
      p.dateStart,
      p.dateEnd,
      p.taskCount,
      p.openTaskCount,
      p.overdueTaskCount,
      p.linkedEventCount,
    ]);
    if (i % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_FILL; });
  });
  wsProjects.autoFilter = { from: "A1", to: "J1" };
  autoWidth(wsProjects);

  // Calendar
  const wsCal = wb.addWorksheet("التقويم");
  applySheetRtl(wsCal);
  wsCal.addRow(["ID", "العنوان", "البداية", "النهاية", "المسؤول"]);
  styleHeaderRow(wsCal.getRow(1));
  input.events.forEach((e, i) => {
    const row = wsCal.addRow([e.id, e.name, e.start, e.stop, e.responsible]);
    if (i % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_FILL; });
  });
  wsCal.autoFilter = { from: "A1", to: "E1" };
  autoWidth(wsCal);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
