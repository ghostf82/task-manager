"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClipboardListIcon,
  FileStackIcon,
  FolderKanbanIcon,
  InfoIcon,
  UsersIcon,
} from "lucide-react";

import type { OdooFolderWorkspaceContext } from "@/lib/command-center/odoo-relationship-types";
import { formatRelationshipLabel } from "@/lib/command-center/odoo-relationship-types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatDt(iso: string | null, locale: string) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(locale === "en" ? "en-GB" : "ar-SA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function OdooFolderWorkspacePanel({
  context,
  locale,
  loading,
}: {
  context: OdooFolderWorkspaceContext | null;
  locale: string;
  loading?: boolean;
}) {
  const ar = locale !== "en";
  const t = (en: string, arText: string) => (ar ? arText : en);

  if (loading && !context) {
    return (
      <div className="animate-pulse space-y-3 rounded-xl border border-primary/15 bg-gradient-to-b from-primary/5 to-transparent p-4">
        <div className="h-5 w-2/3 rounded bg-muted" />
        <div className="grid gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!context) return null;

  const { folder, summary, attention, linked, relationships, recommendedActions } = context;
  const partialNote = ar ? context.partialDataNoteAr : context.partialDataNoteEn;

  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 via-card to-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold leading-snug">{folder.name}</h3>
          {folder.description ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">{folder.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {attention.expired.length > 0 ? (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <AlertTriangleIcon className="size-3" />
              {attention.expired.length} {t("expired", "منتهٍ")}
            </Badge>
          ) : null}
          {attention.expiringSoon.length > 0 ? (
            <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-[10px] text-amber-950">
              <AlertTriangleIcon className="size-3" />
              {attention.expiringSoon.length} {t("expiring soon", "ينتهي قريباً")}
            </Badge>
          ) : null}
          {folder.hasMoreDocuments ? (
            <Badge variant="outline" className="text-[10px]">
              {t("More in Odoo", "المزيد في Odoo")}
            </Badge>
          ) : null}
        </div>
      </div>

      {partialNote ? (
        <div className="flex gap-2 rounded-lg border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-xs text-sky-950 dark:text-sky-100">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          <p>{partialNote}</p>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileStackIcon}
          label={t("Documents", "المستندات")}
          value={formatRelationshipLabel(relationships.documents, locale)}
          sub={
            folder.odooDocumentCount != null
              ? t(`${folder.loadedDocumentCount} loaded`, `${folder.loadedDocumentCount} محمّل`)
              : t("On demand", "عند الطلب")
          }
        />
        <StatCard
          icon={UsersIcon}
          label={t("Contributors", "المساهمون")}
          value={String(summary.owners.length)}
          sub={summary.owners[0]?.name ?? "—"}
        />
        <StatCard
          icon={CalendarIcon}
          label={t("Last activity", "آخر نشاط")}
          value={formatDt(summary.lastActivityAt, locale)}
          sub={t("from loaded files", "من الملفات المحمّلة")}
        />
        <StatCard
          icon={FolderKanbanIcon}
          label={t("Linked projects", "مشاريع مرتبطة")}
          value={formatRelationshipLabel(relationships.projects, locale)}
          sub={linked.projects[0]?.name ?? t("Browse to discover", "يُكتشف من الملفات")}
        />
      </div>

      {(linked.projects.length || linked.tasks.length || linked.events.length) ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            {t("Linked context", "سياق مرتبط")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {linked.projects.map((p) => (
              <Chip key={`p-${p.id}`} icon={FolderKanbanIcon} label={p.name} />
            ))}
            {linked.tasks.map((task) => (
              <Chip key={`t-${task.id}`} icon={ClipboardListIcon} label={task.name} />
            ))}
            {linked.events.map((ev) => (
              <Chip key={`e-${ev.id}`} icon={CalendarIcon} label={ev.name} meta={ev.meta} />
            ))}
          </div>
        </div>
      ) : null}

      {summary.mimeDistribution.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {summary.mimeDistribution.map((m) => (
            <span key={m.category} className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] tabular-nums">
              {m.category}: {m.count}
            </span>
          ))}
        </div>
      ) : null}

      {recommendedActions.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
          {recommendedActions.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary"
            >
              {ar ? a.labelAr : a.labelEn}
            </span>
          ))}
        </div>
      ) : null}

      {(attention.expired.length > 0 || attention.expiringSoon.length > 0) && (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer font-medium">
            {t("Attention items", "عناصر تحتاج انتباه")} (
            {attention.expired.length + attention.expiringSoon.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {[...attention.expired, ...attention.expiringSoon].map((item) => (
              <li key={item.id} className="flex gap-2 rounded-md bg-muted/30 px-2 py-1">
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <span className="text-muted-foreground shrink-0 text-[10px]">{item.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/80 px-3 py-2.5">
      <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[10px] font-medium">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="text-sm font-semibold tabular-nums leading-tight">{value}</p>
      {sub ? <p className="text-muted-foreground mt-0.5 truncate text-[10px]">{sub}</p> : null}
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  meta,
}: {
  icon: LucideIcon;
  label: string;
  meta?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px]"
      )}
      title={label}
    >
      <Icon className="size-3 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
      {meta ? <span className="text-muted-foreground shrink-0 text-[9px] [direction:ltr]">{meta}</span> : null}
    </span>
  );
}
