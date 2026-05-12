"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  clearAiAgentActivityLogAllUsersAction,
  clearAiAgentActivityLogMineAction,
  deleteAiAgentActivityLogRowAction,
} from "@/app/dashboard/ai-agent/activity-log-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";

export type ActivityLogRow = {
  id: string;
  event_type: string;
  message: string;
  proposal_id: string | null;
  created_at: string;
  meta: unknown;
};

function shortEventLabel(t: (k: string) => string, eventType: string): string {
  const path = `aiAgentPage.logType.${eventType}`;
  const mapped = t(path);
  if (mapped !== path) return mapped;
  return eventType.length > 28 ? `${eventType.slice(0, 26)}…` : eventType;
}

export function AiAgentActivityLogPanel({
  rows,
  dateLocale,
  isSuperAdmin,
}: {
  rows: ActivityLogRow[];
  dateLocale: string;
  isSuperAdmin: boolean;
}) {
  const { t } = useDashboardI18n();
  const router = useRouter();
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [pendingClear, startClear] = useTransition();

  const sorted = useMemo(
    () => [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [rows],
  );

  async function onDeleteRow(id: string) {
    setPendingRow(id);
    try {
      const res = await deleteAiAgentActivityLogRowAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("aiAgentPage.logDeletedRow"));
      router.refresh();
    } finally {
      setPendingRow(null);
    }
  }

  function confirmClearMine() {
    if (!window.confirm(t("aiAgentPage.logClearMineConfirm"))) return;
    startClear(async () => {
      const res = await clearAiAgentActivityLogMineAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("aiAgentPage.logClearedMine"));
      router.refresh();
    });
  }

  function confirmClearAllSuper() {
    if (!window.confirm(t("aiAgentPage.logClearAllSuperConfirm"))) return;
    startClear(async () => {
      const res = await clearAiAgentActivityLogAllUsersAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("aiAgentPage.logClearedAll"));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{t("aiAgentPage.logTitle")}</CardTitle>
          <CardDescription>{t("aiAgentPage.logSubtitle")}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendingClear || !sorted.length}
            onClick={confirmClearMine}
          >
            {pendingClear ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {t("aiAgentPage.logClearMine")}
          </Button>
          {isSuperAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pendingClear || !sorted.length}
              onClick={confirmClearAllSuper}
            >
              {t("aiAgentPage.logClearAllSuper")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {!sorted.length ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("aiAgentPage.logEmpty")}</p>
        ) : (
          sorted.map((row) => {
            const time = new Date(row.created_at).toLocaleString(dateLocale, {
              dateStyle: "short",
              timeStyle: "short",
            });
            const typeShort = shortEventLabel(t, row.event_type);
            return (
              <details
                key={row.id}
                className="group rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-sm open:bg-muted/20"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 text-start">
                    <span className="text-muted-foreground text-[12px]">{time}</span>
                    <span className="mx-2 text-border">|</span>
                    <span className="font-medium">{typeShort}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      disabled={pendingRow === row.id}
                      aria-label={t("aiAgentPage.logDeleteRow")}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!window.confirm(t("aiAgentPage.logDeleteRowConfirm"))) return;
                        void onDeleteRow(row.id);
                      }}
                    >
                      {pendingRow === row.id ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-4" />
                      )}
                    </Button>
                  </div>
                </summary>
                <div className="text-muted-foreground mt-2 border-t border-border/60 pt-2 font-mono text-[11px] [direction:ltr]">
                  {row.event_type}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed">{row.message}</p>
              </details>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
