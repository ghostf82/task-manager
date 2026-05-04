import "server-only";

import ExcelJS from "exceljs";

import type { AIToolModule } from "@/lib/ai-tools/types";

function cellToPrimitive(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "text" in (v as Record<string, unknown>)) {
    const t = (v as { text?: string }).text;
    return typeof t === "string" ? t : String(v);
  }
  if (typeof v === "object" && v !== null && "result" in (v as Record<string, unknown>)) {
    const r = (v as { result?: unknown }).result;
    return cellToPrimitive(r);
  }
  return String(v);
}

export type ExcelReadResult = {
  sheetNames: string[];
  previewRows: Record<string, string | number | boolean | null>[];
  rowCount: number;
};

/** Read first sheet, up to maxRows rows, as plain objects (header row = keys). */
export async function readExcelFromBuffer(
  buf: ArrayBuffer,
  maxRows = 200
): Promise<ExcelReadResult | { error: string }> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0];
    if (!sheet) {
      return { error: "لا توجد أوراق في الملف." };
    }
    const matrix: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const r: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        r.push(cell.value);
      });
      matrix.push(r);
    });
    if (!matrix.length) {
      return { sheetNames: wb.worksheets.map((s) => s.name), previewRows: [], rowCount: 0 };
    }
    const header = (matrix[0] ?? []).map((c, i) => {
      const s = cellToPrimitive(c);
      const t = typeof s === "string" ? s.trim() : String(s ?? "").trim();
      return t || `col_${i + 1}`;
    });
    const previewRows: Record<string, string | number | boolean | null>[] = [];
    let rowCount = 0;
    for (let r = 1; r < matrix.length && previewRows.length < maxRows; r++) {
      const row = matrix[r];
      if (!row || !row.some((c) => c !== null && c !== undefined && c !== "")) continue;
      rowCount++;
      const obj: Record<string, string | number | boolean | null> = {};
      for (let c = 0; c < Math.max(header.length, row.length); c++) {
        const key = header[c] ?? `col_${c + 1}`;
        obj[key] = cellToPrimitive(row[c]) as string | number | boolean | null;
      }
      previewRows.push(obj);
    }
    return {
      sheetNames: wb.worksheets.map((s) => s.name),
      previewRows,
      rowCount,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

export async function readExcelFromUrl(
  url: string,
  maxRows = 200
): Promise<ExcelReadResult | { error: string }> {
  const u = url.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    return { error: "رابط الملف غير صالح." };
  }
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    return { error: `تعذر تنزيل الملف (${res.status})` };
  }
  const buf = await res.arrayBuffer();
  return readExcelFromBuffer(buf, maxRows);
}

export async function writeExcelBuffer(rows: Record<string, unknown>[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  if (rows.length === 0) {
    ws.addRow(["message"]);
    ws.addRow(["empty"]);
  } else {
    const keys = Object.keys(rows[0]);
    ws.addRow(keys);
    for (const r of rows) {
      ws.addRow(keys.map((k) => r[k] ?? ""));
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export function analyzeExcelPreview(read: ExcelReadResult): string {
  const cols = read.previewRows[0] ? Object.keys(read.previewRows[0]) : [];
  const numericCols = new Set<string>();
  for (const col of cols) {
    let num = 0;
    for (const row of read.previewRows.slice(0, 50)) {
      const v = row[col];
      if (typeof v === "number" && Number.isFinite(v)) num++;
    }
    if (num >= Math.min(3, read.previewRows.length)) numericCols.add(col);
  }
  return JSON.stringify(
    {
      sheets: read.sheetNames,
      approxRows: read.rowCount,
      columns: cols,
      numericLikeColumns: [...numericCols],
      sample: read.previewRows.slice(0, 5),
    },
    null,
    2
  );
}

export const excelAiTool: AIToolModule = {
  slug: "excel",
  displayNameAr: "Excel",
  displayNameEn: "Excel",
  descriptionAr: "قراءة وتحليل وتصدير جداول Excel",
  descriptionEn: "Read, analyze, and export Excel workbooks (xlsx).",
  requiredCredentials: ["none"],
  functions: ["readExcel", "writeExcel", "analyzeExcel"],
  async collectInbound() {
    return {};
  },
};
