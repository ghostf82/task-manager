"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BellRing,
  Building2,
  ClipboardList,
  FileText,
  Home,
  Menu,
  MessageCircle,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LanguageToggle } from "@/components/dashboard/language-toggle";
import { SidebarUserFooter } from "@/components/dashboard/sidebar-user-footer";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AppLocale } from "@/lib/i18n/locale-core";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  Home,
  Building2,
  Users,
  SlidersHorizontal,
  ClipboardList,
  FileText,
  BellRing,
  MessageCircle,
  Sparkles,
  Shield,
};

export type NavItemSerialized = {
  href: string;
  label: string;
  iconKey: string;
  superOnly: boolean;
};

export type DashboardShellClientProps = {
  isSuperAdmin: boolean;
  locale: AppLocale;
  brand: string;
  panelTitle: string;
  mobileNavTitle: string;
  navItems: NavItemSerialized[];
  lang: { label: string; ar: string; en: string };
  userFooter: {
    displayName: string | null;
    email: string | null;
    jobTitle: string | null;
    tenantLabel: string | null;
    avatarUrl: string | null;
    positionLabel: string;
    fallbackName: string;
    accountLabel: string;
    signOutLabel: string;
  };
};

function NavLinks({
  pathname,
  items,
  isSuperAdmin,
  onPick,
}: {
  pathname: string;
  items: NavItemSerialized[];
  isSuperAdmin: boolean;
  onPick?: () => void;
}) {
  const visible = items.filter((l) => !l.superOnly || isSuperAdmin);
  return (
    <>
      {visible.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const Icon = ICONS[item.iconKey] ?? Home;
        return (
          <Link
            key={item.href}
            prefetch={false}
            href={item.href}
            onClick={onPick}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all duration-200",
              active
                ? "bg-linear-to-r from-violet-500/90 to-cyan-500/85 text-white shadow-[0_16px_28px_-18px_rgba(82,64,255,0.7)] ring-1 ring-white/35"
                : "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AppSidebar({
  isSuperAdmin,
  locale,
  brand,
  navItems,
  lang,
  userFooter,
}: DashboardShellClientProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-e border-sidebar-border/60 bg-linear-to-b from-sidebar via-[#101f5e] to-[#0a143f] md:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border/70 px-4">
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          {brand}
        </span>
      </div>
      <LanguageToggle locale={locale} label={lang.label} arLabel={lang.ar} enLabel={lang.en} />
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2.5">
        <NavLinks pathname={pathname} items={navItems} isSuperAdmin={isSuperAdmin} />
      </nav>
      <SidebarUserFooter locale={locale} {...userFooter} />
    </aside>
  );
}

export function MobileDashboardNav({
  isSuperAdmin,
  locale,
  mobileNavTitle,
  navItems,
  lang,
  userFooter,
}: DashboardShellClientProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0 md:hidden"
        aria-label={mobileNavTitle}
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="start" className="flex w-[min(100%,18rem)] flex-col p-0">
          <SheetHeader className="border-b border-border px-4 py-4 text-start">
            <SheetTitle className="text-start">{mobileNavTitle}</SheetTitle>
          </SheetHeader>
          <LanguageToggle
            locale={locale}
            label={lang.label}
            arLabel={lang.ar}
            enLabel={lang.en}
            className="border-0"
          />
          <nav className="flex max-h-[min(50dvh,22rem)] flex-col gap-0.5 overflow-y-auto p-2">
            <NavLinks
              pathname={pathname}
              items={navItems}
              isSuperAdmin={isSuperAdmin}
              onPick={() => setOpen(false)}
            />
          </nav>
          <div className="mt-auto border-t border-border">
            <SidebarUserFooter locale={locale} {...userFooter} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
