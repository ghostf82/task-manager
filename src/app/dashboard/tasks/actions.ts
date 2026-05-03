"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/corporate-tasks";

export type CorporateTaskPayload = {
  tenant_id: string;
  title: string;
  assignee_id?: string | null;
  manager_id?: string | null;
  issued_on?: string;
  due_on: string;
  follow_up_on?: string | null;
  status: TaskStatus;
  completion_percent: number;
  notes?: string | null;
};

export async function createCorporateTaskAction(input: CorporateTaskPayload) {
  await requireSession();
  if (!input.tenant_id || !input.title.trim() || !input.due_on) {
    throw new Error("حقول مطلوبة ناقصة");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرّح");

  const { error } = await supabase.from("corporate_tasks").insert({
    tenant_id: input.tenant_id,
    title: input.title.trim(),
    assignee_id: input.assignee_id || null,
    manager_id: input.manager_id || null,
    issued_on: input.issued_on || undefined,
    due_on: input.due_on,
    follow_up_on: input.follow_up_on || null,
    status: input.status,
    completion_percent: input.completion_percent,
    notes: input.notes?.trim() || null,
    display_number: -1,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tasks");
}

export async function updateCorporateTaskAction(
  id: string,
  input: CorporateTaskPayload
) {
  await requireSession();
  if (!input.title.trim() || !input.due_on) throw new Error("حقول مطلوبة ناقصة");

  const supabase = await createClient();
  const { error } = await supabase
    .from("corporate_tasks")
    .update({
      title: input.title.trim(),
      assignee_id: input.assignee_id || null,
      manager_id: input.manager_id || null,
      issued_on: input.issued_on || undefined,
      due_on: input.due_on,
      follow_up_on: input.follow_up_on || null,
      status: input.status,
      completion_percent: input.completion_percent,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tasks");
}

export async function setFollowedUpTodayAction(
  taskId: string,
  value: "yes" | "no"
) {
  await requireSession();
  const supabase = await createClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  const followed_up_on = value === "yes" ? todayStr : null;

  const { error } = await supabase
    .from("corporate_tasks")
    .update({ followed_up_on })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tasks");
}

export async function deleteCorporateTaskAction(id: string) {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("corporate_tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tasks");
}

export async function bulkDeleteCorporateTasksAction(ids: string[]) {
  await requireSession();
  if (!ids.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from("corporate_tasks").delete().in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tasks");
}
