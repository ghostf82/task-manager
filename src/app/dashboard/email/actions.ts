"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/dashboard-auth";

export async function refreshEmailIntelligenceAction() {
  await requireSession();
  revalidatePath("/dashboard/email");
}
