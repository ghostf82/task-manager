import { requireSuperAdmin } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import { UsersAdminClient } from "@/app/dashboard/users/users-admin-client";

function pickName(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  if (Array.isArray(v)) {
    const first = v[0];
    if (first && typeof first === "object" && "name" in first) {
      return String((first as { name: string }).name);
    }
    return null;
  }
  if ("name" in v) return String((v as { name: string }).name);
  return null;
}

function pickRole(v: unknown): { name?: string; slug?: string } | null {
  if (!v || typeof v !== "object") return null;
  if (Array.isArray(v)) {
    const first = v[0];
    return first && typeof first === "object"
      ? (first as { name?: string; slug?: string })
      : null;
  }
  return v as { name?: string; slug?: string };
}

function lineFor(m: {
  user_id: string;
  status: string;
  job_title: string | null;
  tenants: unknown;
  roles: unknown;
}): string {
  const t = pickName(m.tenants) ?? "—";
  const role = pickRole(m.roles);
  const r = role?.name ?? role?.slug ?? "—";
  const j = m.job_title ? ` — ${m.job_title}` : "";
  return `${t}: ${r}${j} (${m.status})`;
}

export default async function UsersPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: users, error: uErr }, { data: mems }, { data: tenants, error: tErr }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id,email,full_name,is_super_admin,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("tenant_memberships").select(`
          user_id,
          status,
          job_title,
          tenants ( name ),
          roles ( name, slug )
        `),
      supabase.from("tenants").select("id,name").order("name"),
    ]);

  if (uErr) {
    return (
      <p className="text-destructive text-sm">
        تعذر تحميل المستخدمين: {uErr.message}
      </p>
    );
  }

  const summary = new Map<string, string[]>();
  for (const row of mems ?? []) {
    const r = row as {
      user_id: string;
      status: string;
      job_title: string | null;
      tenants: unknown;
      roles: unknown;
    };
    const arr = summary.get(r.user_id) ?? [];
    arr.push(lineFor(r));
    summary.set(r.user_id, arr);
  }

  const rows =
    users?.map((u) => ({
      ...u,
      memberships_summary: (summary.get(u.id) ?? []).join("\n") || "—",
    })) ?? [];

  return (
    <UsersAdminClient
      users={rows}
      tenants={tenants ?? []}
      tenantsError={tErr?.message}
    />
  );
}
