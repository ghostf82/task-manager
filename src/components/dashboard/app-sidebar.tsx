"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  ClipboardList,
  FileText,
  Home,
  BellRing,
  Menu,
  MessageCircle,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "الرئيسية", icon: Home, superOnly: false },
  { href: "/dashboard/tenants", label: "الشركات", icon: Building2, superOnly: true },
  { href: "/dashboard/users", label: "المستخدمين", icon: Users, superOnly: true },
  {
    href: "/dashboard/ai-governance",
    label: "حوكمة أدوات الذكاء",
    icon: SlidersHorizontal,
    superOnly: true,
  },
  { href: "/dashboard/tasks", label: "المهام", icon: ClipboardList, superOnly: false },
  {
    href: "/dashboard/documents",
    label: "مستندات الشركات",
    icon: FileText,
    superOnly: false,
  },
  {
    href: "/dashboard/reminders",
    label: "التذكيرات الشخصية",
    icon: BellRing,
    superOnly: false,
  },
  {
    href: "/dashboard/chat",
    label: "التواصل",
    icon: MessageCircle,
    superOnly: false,
  },
  {
    href: "/dashboard/ai-agent",
    label: "المساعد الذكي",
    icon: Sparkles,
    superOnly: false,
  },
  {
    href: "/dashboard/settings/integrations",
    label: "ربط الأنظمة",
    icon: Shield,
    superOnly: false,
  },
] as const;

export function AppSidebar({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-e border-border bg-muted/30 md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-sm font-semibold tracking-tight">ERP المهام</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {links
          .filter((l) => !l.superOnly || isSuperAdmin)
          .map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0 opacity-80" />
                {item.label}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}

export function MobileDashboardNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = links.filter((l) => !l.superOnly || isSuperAdmin);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0 md:hidden"
        aria-label="فتح القائمة"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="start" className="w-[min(100%,18rem)] p-0">
          <SheetHeader className="border-b border-border px-4 py-4 text-start">
            <SheetTitle className="text-start">التنقل</SheetTitle>
          </SheetHeader>
          <nav className="flex max-h-[calc(100dvh-5rem)] flex-col gap-0.5 overflow-y-auto p-2">
            {visible.map((item) => {
              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-80" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
