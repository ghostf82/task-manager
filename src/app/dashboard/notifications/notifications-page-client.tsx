"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Archive, Bell, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  archiveNotificationsAction,
  deleteNotificationsAction,
  markNotificationsReadAction,
  reuseNotificationAsReminderAction,
} from "@/app/dashboard/notifications/actions";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { notificationHref } from "@/lib/notifications/resolve-href";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
};

function formatDate(iso: string, dateLocale: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export function NotificationsPageClient({
  initialItems,
}: {
  initialItems: NotificationRow[];
}) {
  const { t, dateLocale } = useDashboardI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => items.filter((n) => (showArchived ? Boolean(n.archived_at) : !n.archived_at)),
    [items, showArchived]
  );

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read_at && !n.archived_at).length,
    [items]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runSelected(action: "read" | "archive" | "delete", ids: string[]) {
    if (!ids.length) return;
    startTransition(async () => {
      try {
        if (action === "read") await markNotificationsReadAction(ids);
        if (action === "archive") await archiveNotificationsAction(ids);
        if (action === "delete") await deleteNotificationsAction(ids);
        setItems((prev) => {
          if (action === "delete") return prev.filter((x) => !ids.includes(x.id));
          const now = new Date().toISOString();
          return prev.map((x) => {
            if (!ids.includes(x.id)) return x;
            if (action === "archive") return { ...x, archived_at: now, read_at: x.read_at ?? now };
            return { ...x, read_at: x.read_at ?? now };
          });
        });
        setSelected(new Set());
        router.refresh();
        if (action === "read") toast.success(t("notificationsPage.markedRead"));
        if (action === "archive") toast.success(t("notificationsPage.archived"));
        if (action === "delete") toast.success(t("notificationsPage.deleted"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("notificationsMenu.updateFail"));
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("notificationsPage.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("notificationsPage.subtitle")}</p>
        </div>
        <Button
          type="button"
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          <Archive className="size-3.5" />
          {showArchived ? t("notificationsPage.showActive") : t("notificationsPage.showArchived")}
        </Button>
      </div>

      {unreadCount > 0 && !showArchived ? (
        <p className="text-muted-foreground text-xs">
          {t("notificationsPage.unreadCount").replace("{count}", String(unreadCount))}
        </p>
      ) : null}

      <Card className="premium-surface">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4" />
            {showArchived ? t("notificationsPage.archivedTitle") : t("notificationsPage.activeTitle")}
          </CardTitle>
          <CardDescription className="text-xs">{t("notificationsPage.listHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selected.size > 0 ? (
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => runSelected("read", [...selected])}
              >
                {t("notificationsPage.markRead")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => runSelected("archive", [...selected])}
              >
                {t("notificationsPage.archive")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm(t("notificationsPage.confirmDelete"))) return;
                  runSelected("delete", [...selected]);
                }}
              >
                <Trash2 className="size-3.5" />
                {t("notificationsPage.delete")}
              </Button>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">{t("notificationsMenu.empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((n) => {
                const href = notificationHref(n.type, n.payload);
                return (
                  <li key={n.id} className="flex gap-3 py-3">
                    <Checkbox
                      checked={selected.has(n.id)}
                      onCheckedChange={() => toggle(n.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium leading-snug",
                            !n.read_at && "text-foreground",
                            n.read_at && "text-muted-foreground"
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-[10px]" suppressHydrationWarning>
                          {formatDate(n.created_at, dateLocale)}
                        </span>
                      </div>
                      {n.body ? (
                        <p className="text-muted-foreground text-xs leading-relaxed">{n.body}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {href ? (
                          <Link
                            href={href}
                            className={buttonVariants({ variant: "secondary", size: "xs" })}
                            onClick={() => {
                              if (!n.read_at) void markNotificationsReadAction([n.id]);
                            }}
                          >
                            <ExternalLink className="size-3" />
                            {t("notificationsPage.openRelated")}
                          </Link>
                        ) : null}
                        {!n.read_at ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => runSelected("read", [n.id])}
                          >
                            {t("notificationsMenu.read")}
                          </Button>
                        ) : null}
                        {!n.archived_at ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => runSelected("archive", [n.id])}
                          >
                            <Archive className="size-3" />
                            {t("notificationsPage.archive")}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              try {
                                await reuseNotificationAsReminderAction(n.id);
                                toast.success(t("notificationsPage.reuseOk"));
                                router.push("/dashboard/reminders");
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : t("notificationsMenu.updateFail")
                                );
                              }
                            });
                          }}
                        >
                          <RotateCcw className="size-3" />
                          {t("notificationsPage.reuseReminder")}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="text-destructive"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm(t("notificationsPage.confirmDeleteOne"))) return;
                            runSelected("delete", [n.id]);
                          }}
                        >
                          <Trash2 className="size-3" />
                          {t("notificationsPage.delete")}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}