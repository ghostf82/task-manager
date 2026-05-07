"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { markNotificationsReadAction } from "@/app/dashboard/notifications/actions";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

export function NotificationsMenu({
  initialItems,
  label,
}: {
  initialItems: NotificationItem[];
  /** Header label next to the bell; falls back to dashboard.notifications */
  label?: string;
}) {
  const { t, dateLocale } = useDashboardI18n();
  const displayLabel = label ?? t("dashboard.notifications");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initialItems);
  const unread = items.filter((i) => !i.read_at);

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
    const ids = unread.map((u) => u.id);
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "relative gap-1.5"
          )}
        >
          <Bell className="size-4" />
          <span className="hidden sm:inline">{displayLabel}</span>
          {unread.length > 0 ? (
            <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("notificationsMenu.listTitle")}</span>
          {unread.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 text-xs"
              disabled={pending}
              onClick={() => void markAll()}
            >
              {t("notificationsMenu.markAll")}
            </Button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs">
            {t("notificationsMenu.empty")}
          </p>
        ) : (
          <ScrollArea className="h-64">
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex cursor-default flex-col items-stretch gap-1 p-2 text-start"
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium leading-tight">{n.title}</span>
                  {!n.read_at ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 shrink-0 text-[10px]"
                      disabled={pending}
                      onClick={() => void markRead(n.id)}
                    >
                      {t("notificationsMenu.read")}
                    </Button>
                  ) : null}
                </div>
                {n.body ? (
                  <p className="text-muted-foreground text-[11px] leading-snug">
                    {n.body}
                  </p>
                ) : null}
                <span
                  className="text-muted-foreground text-[10px]"
                  suppressHydrationWarning
                >
                  {new Date(n.created_at).toLocaleString(dateLocale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
