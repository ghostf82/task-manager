"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { runInboundScanAsync } from "@/app/dashboard/ai-agent/actions";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InboundScanCard({
  canScan,
  licensedToolLabels,
}: {
  canScan: boolean;
  licensedToolLabels: string;
}) {
  const { t } = useDashboardI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function runScan() {
    start(async () => {
      try {
        const res = await runInboundScanAsync();
        if (res.ok) {
          toast.success(res.message);
        } else {
          toast.error(res.message);
        }
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("aiAgentScan.toastUnexpected");
        toast.error(msg);
        router.refresh();
      }
    });
  }

  const tools = licensedToolLabels || "—";
  const cardDesc = t("aiAgentScan.cardDesc").replace("{tools}", tools);

  return (
    <Card className="border-border/80 bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 shadow-sm ring-1 ring-emerald-500/15">
      <CardHeader>
        <CardTitle>{t("aiAgentScan.cardTitle")}</CardTitle>
        <CardDescription>{cardDesc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            disabled={!canScan || pending}
            onClick={runScan}
            className="w-fit gap-2"
          >
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {pending ? t("aiAgentScan.buttonScanning") : t("aiAgentScan.buttonRun")}
          </Button>
          <p className="text-muted-foreground max-w-md text-[11px] leading-relaxed">
            {!canScan ? t("aiAgentScan.hintNoTools") : t("aiAgentScan.hintTiming")}
          </p>
        </div>
        {pending ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="bg-muted-foreground/20 h-2 w-full animate-pulse rounded" />
            <div className="bg-muted-foreground/15 h-2 w-4/5 animate-pulse rounded" />
            <div className="bg-muted-foreground/10 h-2 w-3/5 animate-pulse rounded" />
            <p className="text-muted-foreground pt-1 text-xs">{t("aiAgentScan.overlayScanning")}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
