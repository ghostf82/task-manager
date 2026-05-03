"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function AiAgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    toast.error(error.message || "حدث خطأ في مساحة المساعد.");
  }, [error.message]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold">تعذّر تحميل مساحة المساعد</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">{error.message}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => reset()}>
          إعادة المحاولة
        </Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          العودة للوحة التحكم
        </Link>
      </div>
    </div>
  );
}
