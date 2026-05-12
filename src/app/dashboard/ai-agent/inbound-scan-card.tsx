"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { runInboundScanAsync, type ScanResult } from "@/app/dashboard/ai-agent/actions";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function isScanResult(value: unknown): value is ScanResult {
  if (value == null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ok === "boolean" &&
    typeof v.message === "string" &&
    typeof v.inserted === "number" &&
    typeof v.taskCount === "number" &&
    typeof v.emailCount === "number"
  );
}

function scanTransportErrorMessage(e: unknown, t: (key: string) => string): string {
  if (e instanceof TypeError) {
    const m = e.message || "";
    if (/fetch|network|failed to fetch|load failed/i.test(m)) {
      return t("aiAgentScan.toastNetworkFailure");
    }
  }
  if (e instanceof Error && e.message) {
    if (/fetch|network|failed to fetch|load failed/i.test(e.message)) {
      return t("aiAgentScan.toastNetworkFailure");
    }
    return e.message;
  }
  return t("aiAgentScan.toastUnexpected");
}

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
        if (!isScanResult(res)) {
          toast.error(t("aiAgentScan.toastInvalidResponse"));
          return;
        }
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        const empty =
          res.inserted === 0 && res.taskCount === 0 && res.emailCount === 0;
        if (empty) {
          toast.info(res.message);
        } else {
          toast.success(res.message);
        }
      } catch (e) {
        toast.error(scanTransportErrorMessage(e, t));
      } finally {
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
