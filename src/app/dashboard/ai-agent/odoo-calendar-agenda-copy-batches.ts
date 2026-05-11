"use client";

import {
  appendOdooAgendaFallbackAction,
  duplicateOdooAgendaMailSliceAction,
  duplicateOdooAgendaTableSliceAction,
  revalidateAiAgentOdooPanelAction,
} from "@/app/dashboard/ai-agent/actions";
import { withSlicePostRetries } from "@/lib/netlify-slice-retry";

/** One Odoo create per server action keeps Netlify well under typical function limits. */
const TABLE_SLICE = 1;
const MAIL_SLICE = 1;

export type OdooAgendaCopyPhase = "table" | "mail" | "fallback" | "revalidate";

export type OdooAgendaCopyProgressInfo = {
  phase: OdooAgendaCopyPhase;
  /** Progress within the current phase (e.g. rows processed). */
  current: number;
  total: number;
  /** Overall 0–100 for the agenda copy leg. */
  percent: number;
  message: string;
};

function microYield(): Promise<void> {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function clampPercent(n: number): number {
  return Math.min(99, Math.max(0, Math.round(n)));
}

/**
 * Copies meeting agenda using many small server actions (Netlify-friendly).
 * Caller should run after `cloneOdooCalendarEventPhaseOneAction`.
 */
export async function copyOdooMeetingAgendaInSlices(params: {
  sourceEventId: number;
  targetEventId: number;
  targetEventStart: string;
  /** Original source event `start` (for shifting `mail.activity` deadlines). */
  sourceEventStart?: string;
  targetDescriptionForFallback?: string;
  onProgress?: (info: OdooAgendaCopyProgressInfo) => void;
  /** When true, skip `revalidatePath` (caller revalidates once after a bulk loop). */
  skipFinalRevalidate?: boolean;
}): Promise<
  | {
      ok: true;
      agendaTableItemsCreated: number;
      agendaActivitiesCreated: number;
      skippedApprox: number;
      fallbackDescriptionUpdated: boolean;
    }
  | { ok: false; error: string }
> {
  let agendaTableItemsCreated = 0;
  let agendaActivitiesCreated = 0;
  let skippedApprox = 0;

  params.onProgress?.({
    phase: "table",
    current: 0,
    total: 0,
    percent: 1,
    message: "جاري تجهيز نسخ جدول الأجندة…",
  });

  let from = 0;
  let tableTotal: number | null = null;
  while (true) {
    const r = await withSlicePostRetries(() =>
      duplicateOdooAgendaTableSliceAction({
        sourceEventId: params.sourceEventId,
        targetEventId: params.targetEventId,
        fromIndex: from,
        batchSize: TABLE_SLICE,
        knownTotalRows: tableTotal !== null ? tableTotal : undefined,
      })
    );
    if (!r.ok) return { ok: false, error: r.error };
    if (tableTotal === null) {
      tableTotal = r.totalRows;
      if (!tableTotal) break;
    }
    agendaTableItemsCreated += r.agendaItemsCreated;
    skippedApprox += r.skippedInBatch;
    const done = Math.min(from + TABLE_SLICE, tableTotal);
    const tablePct = tableTotal ? (done / tableTotal) * 38 : 0;
    params.onProgress?.({
      phase: "table",
      current: done,
      total: tableTotal,
      percent: clampPercent(4 + tablePct),
      message: `جاري نسخ بند الجدول (${done} من ${tableTotal}) — ${clampPercent(4 + tablePct)}٪`,
    });
    from += TABLE_SLICE;
    await microYield();
    if (tableTotal !== null && from >= tableTotal) break;
  }

  if (tableTotal !== null && tableTotal > 0 && agendaTableItemsCreated === 0) {
    return {
      ok: false,
      error:
        "Odoo يشير إلى وجود بنود في جدول الأجندة لكن لم يُنشأ أي سطر على الحدث الجديد (تحقق من صلاحية إنشاء «بند أجندة الاجتماع» أو من سجلات Odoo).",
    };
  }

  params.onProgress?.({
    phase: "mail",
    current: 0,
    total: 0,
    percent: 44,
    message: "جاري تجهيز نسخ الأنشطة البريدية…",
  });
  from = 0;
  let mailTotal: number | null = null;
  while (true) {
    const r = await withSlicePostRetries(() =>
      duplicateOdooAgendaMailSliceAction({
        sourceEventId: params.sourceEventId,
        targetEventId: params.targetEventId,
        targetEventStart: params.targetEventStart,
        sourceEventStart: params.sourceEventStart,
        fromIndex: from,
        batchSize: MAIL_SLICE,
        knownTotalRows: mailTotal !== null ? mailTotal : undefined,
      })
    );
    if (!r.ok) return { ok: false, error: r.error };
    if (mailTotal === null) {
      mailTotal = r.totalRows;
      if (!mailTotal) break;
    }
    agendaActivitiesCreated += r.created;
    skippedApprox += r.skippedInBatch;
    const done = Math.min(from + MAIL_SLICE, mailTotal);
    const mailSpan = mailTotal ? (done / mailTotal) * 36 : 0;
    params.onProgress?.({
      phase: "mail",
      current: done,
      total: mailTotal,
      percent: clampPercent(45 + mailSpan),
      message: `جاري نسخ نشاط البريد (${done} من ${mailTotal}) — ${clampPercent(45 + mailSpan)}٪`,
    });
    from += MAIL_SLICE;
    await microYield();
    if (mailTotal !== null && from >= mailTotal) break;
  }

  params.onProgress?.({
    phase: "fallback",
    current: 1,
    total: 1,
    percent: 84,
    message: "جاري التحقق من الوصف الاحتياطي…",
  });
  const fb = await withSlicePostRetries(() =>
    appendOdooAgendaFallbackAction({
      sourceEventId: params.sourceEventId,
      targetEventId: params.targetEventId,
      targetDescriptionForFallback: params.targetDescriptionForFallback,
      agendaItemsCreated: agendaTableItemsCreated,
      mailActivitiesCreated: agendaActivitiesCreated,
    })
  );
  if (!fb.ok) return { ok: false, error: fb.error };

  if (!params.skipFinalRevalidate) {
    params.onProgress?.({
      phase: "revalidate",
      current: 1,
      total: 1,
      percent: 92,
      message: "جاري تحديث العرض…",
    });
    await withSlicePostRetries(() => revalidateAiAgentOdooPanelAction());
  }

  params.onProgress?.({
    phase: "revalidate",
    current: 1,
    total: 1,
    percent: 100,
    message: "اكتمل نسخ الأجندة.",
  });

  return {
    ok: true,
    agendaTableItemsCreated,
    agendaActivitiesCreated,
    skippedApprox,
    fallbackDescriptionUpdated: fb.updated,
  };
}
