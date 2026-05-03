"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";

export async function createTenantAction(formData: FormData) {
  await requireSuperAdmin();
  const name = String(formData.get("name") ?? "").trim();
  let slug = String(formData.get("slug") ?? "").trim();
  if (!name) throw new Error("اسم الشركة مطلوب");
  if (!slug) slug = slugify(name);

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").insert({
    name,
    slug,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tenants");
  revalidatePath("/dashboard");
}

export async function updateTenantAction(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  let slug = String(formData.get("slug") ?? "").trim();
  if (!id || !name) throw new Error("بيانات ناقصة");
  if (!slug) slug = slugify(name);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ name, slug })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tenants");
}

export async function setTenantActiveAction(id: string, isActive: boolean) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tenants");
}

export async function deleteTenantAction(id: string) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/tenants");
  revalidatePath("/dashboard/tasks");
}

export async function bulkTenantsAction(
  ids: string[],
  op: "activate" | "deactivate" | "delete"
) {
  await requireSuperAdmin();
  if (!ids.length) return;
  const supabase = await createClient();

  if (op === "delete") {
    const { error } = await supabase.from("tenants").delete().in("id", ids);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("tenants")
      .update({ is_active: op === "activate" })
      .in("id", ids);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/dashboard/tenants");
  revalidatePath("/dashboard/tasks");
}
