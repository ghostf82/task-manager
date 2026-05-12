"use client";

import { useTransition } from "react";
import { Loader2Icon, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { refreshDashboardFeedsAction } from "@/app/dashboard/actions";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { Button } from "@/components/ui/button";

function refreshTransportErrorMessage(e: unknown, t: (key: string) => string): string {
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

export function DashboardRefreshButton() {
  const { t } = useDashboardI18n();
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const res = await refreshDashboardFeedsAction();
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success(res.message);
          } catch (e) {
            toast.error(refreshTransportErrorMessage(e, t));
          } finally {
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
      تحديث لوحة التحكم
    </Button>
  );
}

