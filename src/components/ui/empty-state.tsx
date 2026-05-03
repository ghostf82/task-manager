import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  let cta: ReactNode = null;
  if (action) {
    if (action.href) {
      cta = (
        <Link href={action.href} className={cn(buttonVariants({ size: "sm" }))}>
          {action.label}
        </Link>
      );
    } else if (action.onClick) {
      cta = (
        <Button type="button" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      );
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-14 text-center",
        className
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground/50 ring-1 ring-border/60">
        <Icon className="size-8 stroke-[1.25]" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </div>
      {cta ? <div className="pt-1">{cta}</div> : null}
    </div>
  );
}
