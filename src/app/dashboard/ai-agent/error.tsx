"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";

import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AiAgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useDashboardI18n();

  useEffect(() => {
    toast.error(error.message || t("aiAgentError.toast"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show toast once per error digest
  }, [error.message]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold">{t("aiAgentError.title")}</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">{error.message}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => reset()}>
          {t("aiAgentError.retry")}
        </Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("aiAgentError.backDashboard")}
        </Link>
      </div>
    </div>
  );
}
