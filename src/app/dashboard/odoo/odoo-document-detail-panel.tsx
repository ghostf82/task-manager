"use client";

import { DownloadIcon, ExternalLinkIcon, FileIcon, LinkIcon } from "lucide-react";

import type { OdooExplorerDocument } from "@/app/dashboard/odoo/odoo-documents-explorer";
import { inferDocumentRiskStatus } from "@/lib/command-center/odoo-folder-workspace";
import {
  odooDocumentDownloadUrl,
  odooDocumentOpenUrl,
} from "@/lib/integrations/odoo-document-links";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function OdooDocumentDetailPanel({
  doc,
  locale,
  odooBaseUrl,
  onClose,
}: {
  doc: OdooExplorerDocument | null;
  locale: string;
  odooBaseUrl?: string | null;
  onClose?: () => void;
}) {
  const ar = locale !== "en";
  const t = (en: string, arText: string) => (ar ? arText : en);

  if (!doc) {
    return (
      <div className="text-muted-foreground flex h-full min-h-[200px] flex-col items-center justify-center gap-2 p-4 text-center text-xs">
        <FileIcon className="size-8 opacity-40" />
        <p>{t("Select a file for details", "اختر ملفاً لعرض التفاصيل")}</p>
      </div>
    );
  }

  const risk = inferDocumentRiskStatus({
    id: doc.id,
    name: doc.name,
    expirationDate: null,
    createdAt: doc.createdAt,
    mimetype: doc.mimetype,
  });

  const base = odooBaseUrl?.replace(/\/$/, "") ?? "";

  return (
    <div className="flex h-full flex-col border-s border-border/60 bg-muted/10">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <p className="text-xs font-semibold">{t("File details", "تفاصيل الملف")}</p>
        {onClose ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={onClose}>
            {t("Close", "إغلاق")}
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <div>
          <p className="font-medium leading-snug">{doc.name}</p>
          <p
            className={cn(
              "mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium",
              risk.status === "expired" && "bg-rose-500/15 text-rose-800",
              risk.status === "expiring_soon" && "bg-amber-500/15 text-amber-900",
              risk.status === "ok" && "bg-emerald-500/10 text-emerald-800",
              risk.status === "unknown" && "bg-muted text-muted-foreground"
            )}
          >
            {ar ? risk.reasonAr : risk.reasonEn}
          </p>
        </div>

        <dl className="space-y-2">
          <Row label={t("Type", "النوع")} value={doc.mimetype || doc.type || "—"} ltr />
          <Row label={t("Owner", "المالك")} value={doc.owner || doc.creator || "—"} />
          <Row label={t("Size", "الحجم")} value={formatBytes(doc.fileSize)} />
          <Row label={t("Created", "الإنشاء")} value={doc.createdAt || "—"} ltr />
          {doc.resModel ? (
            <Row
              label={t("Linked record", "مرتبط بـ")}
              value={`${doc.resModel}${doc.resId != null ? ` #${doc.resId}` : ""}`}
              ltr
            />
          ) : (
            <Row label={t("Linked record", "مرتبط بـ")} value={t("None in metadata", "لا يوجد في البيانات")} />
          )}
        </dl>

        {base ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <a
              href={odooDocumentOpenUrl(base, doc.id, doc.resModel, doc.resId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border bg-background text-[11px] font-medium hover:bg-muted/50"
            >
              <ExternalLinkIcon className="size-3.5" />
              {t("Open in Odoo", "فتح في Odoo")}
            </a>
            <a
              href={odooDocumentDownloadUrl(base, doc.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border bg-background text-[11px] font-medium hover:bg-muted/50"
            >
              <DownloadIcon className="size-3.5" />
              {t("Download", "تنزيل")}
            </a>
            {doc.resModel && doc.resId ? (
              <a
                href={odooDocumentOpenUrl(base, doc.id, doc.resModel, doc.resId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                <LinkIcon className="size-3.5" />
                {t("Open linked record", "فتح السجل المرتبط")}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[10px]">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", ltr && "[direction:ltr]")}>{value}</dd>
    </div>
  );
}
