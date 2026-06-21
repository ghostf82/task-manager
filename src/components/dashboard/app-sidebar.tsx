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
  LayoutGrid,
  Mail,
  Menu,
  MessageCircle,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LanguageToggle } from "@/components/dashboard/language-toggle";
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
  LayoutGrid,
  Mail,
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
              "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-light transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-md ring-1 ring-gold/35"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
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
}: DashboardShellClientProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "app-sidebar-shell hidden w-60 flex-col border-s border-gold/10",
        "md:fixed md:inset-y-0 md:end-0 md:z-30 md:flex",
      )}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-gold/10 px-4">
        <span className="text-sm font-extrabold tracking-tight text-primary">
          {brand}
        </span>
      </div>
      <LanguageToggle locale={locale} label={lang.label} arLabel={lang.ar} enLabel={lang.en} />
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2.5">
        <NavLinks pathname={pathname} items={navItems} isSuperAdmin={isSuperAdmin} />
      </nav>
    </aside>
  );
}

export function MobileDashboardNav({
  isSuperAdmin,
  locale,
  mobileNavTitle,
  navItems,
  lang,
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
        <SheetContent
          side="start"
          className="flex h-full max-h-dvh w-[min(100%,18rem)] flex-col p-0"
        >
          <SheetHeader className="shrink-0 border-b border-gold/10 px-4 py-4 text-start">
            <SheetTitle className="text-start">{mobileNavTitle}</SheetTitle>
          </SheetHeader>
          <LanguageToggle
            locale={locale}
            label={lang.label}
            arLabel={lang.ar}
            enLabel={lang.en}
            className="border-0"
          />
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            <NavLinks
              pathname={pathname}
              items={navItems}
              isSuperAdmin={isSuperAdmin}
              onPick={() => setOpen(false)}
            />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
