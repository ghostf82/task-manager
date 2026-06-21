import type { ReactNode } from "react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CommandCenterShell({
  eyebrow,
  title,
  description,
  status,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-gold/15 bg-linear-to-br from-primary/8 via-white/90 to-cyan-500/5 p-6 shadow-[var(--shadow-card-light)] ring-1 ring-gold/10 sm:p-8">
        <div className="pointer-events-none absolute -start-20 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 end-0 size-48 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-primary/80 text-xs font-semibold tracking-[0.2em] uppercase">{eyebrow}</p>
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{description}</p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            {status}
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "emerald" | "amber" | "rose" | "violet" | "sky";
}) {
  const ring = {
    default: "ring-gold/15",
    emerald: "ring-emerald-500/25",
    amber: "ring-amber-500/25",
    rose: "ring-rose-500/25",
    violet: "ring-violet-500/25",
    sky: "ring-sky-500/25",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-white/75 p-4 shadow-sm ring-1 backdrop-blur-sm",
        ring
      )}
    >
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">{hint}</p> : null}
    </div>
  );
}

export function CommandQuickLink({
  href,
  label,
  variant = "outline",
}: {
  href: string;
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size: "sm" }), "h-8")}>
      {label}
    </Link>
  );
}
