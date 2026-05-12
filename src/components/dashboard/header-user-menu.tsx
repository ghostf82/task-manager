"use client";

import Link from "next/link";
import { LogOut, UserRoundCog } from "lucide-react";

import { signOutAction } from "@/app/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
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

export function HeaderUserMenu({
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
    [jobTitle, tenantLabel].filter(Boolean).join(" · ") || "—";
  const subtitle = jobTitle ?? tenantLabel ?? email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          "flex items-center gap-2 rounded-3xl border border-gold/20 bg-white/70 px-2 py-1.5 text-xs shadow-sm backdrop-blur-md transition-colors hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label={name}
      >
        <span className="flex size-7 items-center justify-center overflow-hidden rounded-full border border-gold/35 bg-linear-to-br from-primary/90 to-primary/55 text-primary-foreground shadow-[var(--glow-primary)]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="size-full object-cover" />
          ) : (
            <span className="text-[11px] font-semibold">{name.slice(0, 1)}</span>
          )}
        </span>
        <span className="hidden min-w-0 text-start sm:block">
          <span className="block max-w-[11rem] truncate font-medium text-foreground">
            {name}
          </span>
          <span className="block max-w-[11rem] truncate text-[10px] text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            <span className="font-medium">{positionLabel}: </span>
            {position}
          </p>
          {email ? (
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/dashboard/profile" prefetch={false} />}
          className="gap-2"
        >
          <UserRoundCog className="size-4" aria-hidden />
          {accountLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction} className="w-full">
          <DropdownMenuItem
            render={<button type="submit" />}
            variant="destructive"
            className="w-full justify-start gap-2"
          >
            <LogOut className="size-4" aria-hidden />
            {signOutLabel}
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
