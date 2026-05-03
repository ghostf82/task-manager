import { AiGovernanceClient } from "@/app/dashboard/ai-governance/ai-governance-client";
import { getRegisteredAiTools } from "@/lib/ai-tools/registry";
import { requireSuperAdmin } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";

export default async function AiGovernancePage() {
  const { t } = await getTranslator();
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, email, full_name, is_super_admin")
    .order("email", { ascending: true });

  if (usersError) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-2xl font-semibold">{t("aiGovernancePage.title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("aiGovernancePage.loadUsersError")} {usersError.message}
        </p>
      </div>
    );
  }

  if (!users?.length) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-2xl font-semibold">{t("aiGovernancePage.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("aiGovernancePage.noUsers")}</p>
      </div>
    );
  }

  const userIds = users.map((u) => u.id);
  const { data: licenses } = await supabase
    .from("user_ai_tools")
    .select("user_id, tool_slug, is_active")
    .in("user_id", userIds);

  const registered = getRegisteredAiTools();
  const slugs = registered.map((tool) => tool.slug);

  const toolState = new Map<string, Record<string, boolean>>();
  for (const u of users) {
    const row: Record<string, boolean> = {};
    for (const s of slugs) row[s] = false;
    toolState.set(u.id, row);
  }
  for (const row of licenses ?? []) {
    const uid = row.user_id as string;
    const slug = row.tool_slug as string;
    if (!toolState.has(uid) || !slugs.includes(slug)) continue;
    if (row.is_active) {
      toolState.get(uid)![slug] = true;
    }
  }

  const userRows = users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    full_name: u.full_name,
    tools: toolState.get(u.id) ?? {},
  }));

  const toolColumns = registered.map((tool) => ({
    slug: tool.slug,
    displayNameAr: tool.displayNameAr,
    displayNameEn: tool.displayNameEn,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
          {t("aiGovernancePage.phaseLabel")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {t("aiGovernancePage.title")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          {t("aiGovernancePage.lead")}
        </p>
      </div>

      <AiGovernanceClient users={userRows} toolColumns={toolColumns} />
    </div>
  );
}
