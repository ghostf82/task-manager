"use client";

import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";

import { signOutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/locale-core";
import { cn } from "@/lib/utils";

type Props = {
  locale: AppLocale;
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

export function SidebarUserFooter({
  locale,
  displayName,
  email,
  jobTitle,
  tenantLabel,
  avatarUrl,
  positionLabel,
  fallbackName,
  accountLabel,
  signOutLabel,
}: Props) {
  const name = displayName?.trim() || email?.trim() || fallbackName;
  const position =
    [jobTitle, tenantLabel].filter(Boolean).join(locale === "en" ? " · " : " — ") ||
    "—";
  const Chevron = locale === "en" ? ChevronRight : ChevronLeft;

  return (
    <div className="mt-auto border-t border-sidebar-border/70 bg-white/6 p-2">
      <Link
        prefetch={false}
        href="/dashboard/profile"
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-2 text-start transition-colors",
          "hover:bg-white/10 hover:shadow-sm hover:ring-1 hover:ring-white/20",
          "focus-visible:ring-ring outline-none focus-visible:ring-2",
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/40" />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-xs font-semibold uppercase text-white/85 ring-1 ring-white/20">
            {name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-white">{name}</p>
          <p className="truncate text-[11px] leading-snug text-white/65">
            <span className="font-medium text-white/80">{positionLabel}: </span>
            {position}
          </p>
          <p className="mt-0.5 flex items-center gap-0.5 text-[11px] font-medium text-cyan-200">
            {accountLabel}
            <Chevron className="size-3 opacity-80" aria-hidden />
          </p>
        </div>
      </Link>
      <form action={signOutAction} className="mt-1 px-0.5">
        <Button type="submit" variant="ghost" size="sm" className="h-8 w-full text-xs">
          {signOutLabel}
        </Button>
      </form>
    </div>
  );
}
