"use client";

import { useTransition } from "react";
import { Loader2Icon, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { refreshDashboardFeedsAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function DashboardRefreshButton() {
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
          const res = await refreshDashboardFeedsAction();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(res.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
      تحديث لوحة التحكم
    </Button>
  );
}

