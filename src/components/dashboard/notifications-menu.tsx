"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, Bell, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import {
  archiveNotificationsAction,
  deleteNotificationsAction,
  markNotificationsReadAction,
  reuseNotificationAsReminderAction,
} from "@/app/dashboard/notifications/actions";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { notificationHref } from "@/lib/notifications/resolve-href";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  payload?: Record<string, unknown> | null;
};

function normalizeItems(raw: NotificationItem[] | null | undefined): NotificationItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .filter((r) => r != null && String((r as NotificationItem).id ?? "").length > 0)
    .map((r) => {
      const row = r as NotificationItem;
      return {
        id: String(row.id),
        type: typeof row.type === "string" ? row.type : "info",
        title: typeof row.title === "string" ? row.title : "",
        body: row.body == null || row.body === "" ? null : String(row.body),
        created_at:
          typeof row.created_at === "string"
            ? row.created_at
            : row.created_at != null
              ? String(row.created_at)
              : "",
        read_at:
          row.read_at == null || row.read_at === ""
            ? null
            : typeof row.read_at === "string"
              ? row.read_at
              : String(row.read_at),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? row.payload
            : null,
      };
    });
}

function formatNotifDate(iso: string, dateLocale: string) {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export function NotificationsMenu({
  initialItems,
  label,
}: {
  initialItems?: NotificationItem[] | null;
  label?: string;
}) {
  const { t, dateLocale } = useDashboardI18n();
  const displayLabel = label ?? t("dashboard.notifications");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(() => normalizeItems(initialItems));

  useEffect(() => {
    setItems(normalizeItems(initialItems));
  }, [initialItems]);

  const unread = useMemo(() => items.filter((i) => !i.read_at), [items]);

  async function markRead(id: string) {
    startTransition(async () => {
      try {
        await markNotificationsReadAction([id]);
        setItems((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, read_at: new Date().toISOString() } : x
          )
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("notificationsMenu.updateFail"));
      }
    });
  }

  async function markAll() {
    const ids = unread.map((u) => u.id).filter(Boolean);
    if (!ids.length) return;
    startTransition(async () => {
      try {
        await markNotificationsReadAction(ids);
        const now = new Date().toISOString();
        setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? now })));
        router.refresh();
        toast.success(t("notificationsMenu.markAllOk"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("notificationsMenu.updateFail"));
      }
    });
  }

  function openNotification(n: NotificationItem) {
    const href = notificationHref(n.type, n.payload ?? null);
    if (!n.read_at) void markRead(n.id);
    if (href) router.push(href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={`${buttonVariants({ variant: "outline", size: "sm" })} relative gap-1.5`}
      >
        <Bell className="size-4" />
        <span className="hidden sm:inline">{displayLabel}</span>
        {unread.length > 0 ? (
          <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 min-w-[20rem]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>{t("notificationsMenu.listTitle")}</span>
            <div className="flex items-center gap-1">
              {unread.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-7 text-xs"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void markAll();
                  }}
                >
                  {t("notificationsMenu.markAll")}
                </Button>
              ) : null}
              <Link
                href="/dashboard/notifications"
                className={buttonVariants({ variant: "ghost", size: "xs", className: "h-7 text-xs" })}
              >
                {t("notificationsMenu.viewAll")}
              </Link>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-xs">
              {t("notificationsMenu.empty")}
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto overscroll-contain px-0.5">
              {items.map((n) => {
                const href = notificationHref(n.type, n.payload ?? null);
                return (
                  <DropdownMenuItem
                    key={n.id}
                    closeOnClick={false}
                    disabled={pending}
                    className="flex cursor-pointer flex-col items-stretch gap-1 rounded-lg p-2 text-start"
                    onClick={() => openNotification(n)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`text-xs font-medium leading-tight ${!n.read_at ? "" : "text-muted-foreground"}`}
                      >
                        {n.title}
                      </span>
                      {!n.read_at ? (
                        <span className="bg-primary/15 text-primary shrink-0 rounded px-1 text-[10px] font-medium">
                          {t("notificationsMenu.unreadBadge")}
                        </span>
                      ) : null}
                    </div>
                    {n.body ? (
                      <p className="text-muted-foreground line-clamp-2 text-[11px] leading-snug">
                        {n.body}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span
                        className="text-muted-foreground text-[10px]"
                        suppressHydrationWarning
                      >
                        {formatNotifDate(n.created_at, dateLocale)}
                      </span>
                      {href ? (
                        <span className="text-primary inline-flex items-center gap-0.5 text-[10px]">
                          <ExternalLink className="size-3" />
                          {t("notificationsMenu.open")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 border-t border-border/60 pt-1.5">
                      {href ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-6 px-1.5 text-[10px]"
                          disabled={pending}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openNotification(n);
                          }}
                        >
                          {t("notificationsMenu.open")}
                        </Button>
                      ) : null}
                      {!n.read_at ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-6 px-1.5 text-[10px]"
                          disabled={pending}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void markRead(n.id);
                          }}
                        >
                          {t("notificationsMenu.read")}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={pending}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startTransition(async () => {
                            try {
                              await archiveNotificationsAction([n.id]);
                              setItems((prev) => prev.filter((x) => x.id !== n.id));
                              router.refresh();
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : t("notificationsMenu.updateFail")
                              );
                            }
                          });
                        }}
                      >
                        <Archive className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={pending}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startTransition(async () => {
                            try {
                              await reuseNotificationAsReminderAction(n.id);
                              toast.success(t("notificationsPage.reuseOk"));
                              router.push("/dashboard/reminders");
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : t("notificationsMenu.updateFail")
                              );
                            }
                          });
                        }}
                      >
                        <RotateCcw className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-destructive h-6 px-1.5 text-[10px]"
                        disabled={pending}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startTransition(async () => {
                            try {
                              await deleteNotificationsAction([n.id]);
                              setItems((prev) => prev.filter((x) => x.id !== n.id));
                              router.refresh();
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : t("notificationsMenu.updateFail")
                              );
                            }
                          });
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
