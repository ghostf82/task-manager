"use client";

import {
  appendOdooAgendaFallbackAction,
  duplicateOdooAgendaMailSliceAction,
  duplicateOdooAgendaTableSliceAction,
  revalidateAiAgentOdooPanelAction,
} from "@/app/dashboard/ai-agent/actions";
import { withSlicePostRetries } from "@/lib/netlify-slice-retry";

const TABLE_SLICE = 4;
const MAIL_SLICE = 3;

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
  onProgress?: (label: string) => void;
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

  params.onProgress?.("نسخ جدول الأجندة (دفعات)…");
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
    params.onProgress?.(
      `جدول الأجندة: ${Math.min(from + TABLE_SLICE, tableTotal)}/${tableTotal}`
    );
    from += TABLE_SLICE;
    if (tableTotal !== null && from >= tableTotal) break;
  }

  if (tableTotal !== null && tableTotal > 0 && agendaTableItemsCreated === 0) {
    return {
      ok: false,
      error:
        "Odoo يشير إلى وجود بنود في جدول الأجندة لكن لم يُنشأ أي سطر على الحدث الجديد (تحقق من صلاحية إنشاء «بند أجندة الاجتماع» أو من سجلات Odoo).",
    };
  }

  params.onProgress?.("نسخ الأنشطة البريدية (دفعات)…");
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
    params.onProgress?.(
      `أنشطة بريد: ${Math.min(from + MAIL_SLICE, mailTotal)}/${mailTotal}`
    );
    from += MAIL_SLICE;
    if (mailTotal !== null && from >= mailTotal) break;
  }

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
    await withSlicePostRetries(() => revalidateAiAgentOdooPanelAction());
  }

  return {
    ok: true,
    agendaTableItemsCreated,
    agendaActivitiesCreated,
    skippedApprox,
    fallbackDescriptionUpdated: fb.updated,
  };
}
