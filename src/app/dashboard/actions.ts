"use server";

import { revalidatePath } from "next/cache";

import { runInboundScanAsync } from "@/app/dashboard/ai-agent/actions";

export async function refreshDashboardFeedsAction(): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  const result = await runInboundScanAsync();
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-agent");
  if (!result.ok) {
    return { ok: false, error: result.message };
  }
  return { ok: true, message: result.message };
}

