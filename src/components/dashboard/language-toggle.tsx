"use client";

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import { setLocaleAction } from "@/app/actions/set-locale";
import type { AppLocale } from "@/lib/i18n/locale-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  locale: AppLocale;
  label: string;
  arLabel: string;
  enLabel: string;
  className?: string;
};

export function LanguageToggle({ locale, label, arLabel, enLabel, className }: Props) {
  const router = useRouter();

  async function pick(next: AppLocale) {
    if (next === locale) return;
    await setLocaleAction(next);
    router.refresh();
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-b border-border/80 px-3 py-2",
        className,
      )}
      role="group"
      aria-label={label}
    >
      <Languages className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground me-auto text-[11px] font-medium uppercase tracking-wide">
        {label}
      </span>
      <Button
        type="button"
        size="sm"
        variant={locale === "ar" ? "default" : "outline"}
        className="h-7 min-w-12 px-2 text-xs"
        onClick={() => void pick("ar")}
      >
        {arLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={locale === "en" ? "default" : "outline"}
        className="h-7 min-w-12 px-2 text-xs"
        onClick={() => void pick("en")}
      >
        {enLabel}
      </Button>
    </div>
  );
}
