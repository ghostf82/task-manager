import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { documentRowTone } from "@/lib/company-documents";
import { loadOdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import { classifyComplianceText } from "@/lib/command-center/compliance-classifier";
import { loadEmailCommandMetrics } from "@/lib/command-center/email-intelligence";
import { resolveTaskReportScope } from "@/lib/dashboard-scope";
import { daysRemaining, taskRowTone, type TaskStatus } from "@/lib/corporate-tasks";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import {
  tenantNameMatchesProject,
  warRoomAliasKeyForTenantName,
} from "@/lib/executive-intelligence/war-room-aliases";
import type {
  ComplianceIntelItem,
  ExecutiveInsight,
  ExecutiveMorningBrief,
  MyDayItem,
  RiskLevel,
  TimelineEntry,
  WarRoomSnapshot,
} from "@/lib/executive-intelligence/types";
import type { OperationalHealth } from "@/lib/command-center/odoo-operational-brief";

function utcTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function severityWeight(s: RiskLevel): number {
  return s === "critical" ? 100 : s === "high" ? 70 : s === "medium" ? 40 : 10;
}

function docRiskLevel(tone: "ok" | "warning" | "overdue", days: number): RiskLevel {
  if (tone === "overdue") return "critical";
  if (days <= 7) return "high";
  if (days <= 30) return "medium";
  return "low";
}

function worstHealth(a: OperationalHealth, b: OperationalHealth): OperationalHealth {
  const rank = { critical: 0, watch: 1, stable: 2 };
  return rank[a] <= rank[b] ? a : b;
}

export async function loadExecutiveMorningBrief(
  supabase: SupabaseClient,
  userId: string,
  isSuperAdmin: boolean
): Promise<ExecutiveMorningBrief> {
  const today = utcTodayStr();
  const scope = await resolveTaskReportScope(supabase, userId, isSuperAdmin);
  const licensed = await getLicensedActiveToolSlugs(supabase, userId);

  const [odooBrief, emailMetrics, tenantsRes] = await Promise.all([
    licensed.includes("odoo") ? loadOdooOperationalBrief(supabase, userId, isSuperAdmin) : null,
    licensed.includes("email") ? loadEmailCommandMetrics(supabase, userId, 25).catch(() => null) : null,
    scope.mode === "all"
      ? supabase.from("tenants").select("id,name,slug,is_active").eq("is_active", true).order("name")
      : scope.tenantIds.length
        ? supabase.from("tenants").select("id,name,slug,is_active").in("id", scope.tenantIds).order("name")
        : Promise.resolve({ data: [] }),
  ]);

  const tenants = tenantsRes.data ?? [];

  let corpTasks: Array<{
    id: string;
    tenant_id: string;
    title: string;
    assignee_id: string | null;
    due_on: string;
    status: TaskStatus;
  }> = [];

  let docs: Array<{
    id: string;
    tenant_id: string;
    document_name: string;
    expiry_date: string;
    alert_days_before: number;
    status: string;
    tenants: { name?: string } | { name?: string }[] | null;
  }> = [];

  if (!(scope.mode === "tenants" && !scope.tenantIds.length)) {
    let tq = supabase
      .from("corporate_tasks")
      .select("id,tenant_id,title,assignee_id,due_on,status")
      .in("status", ["not_started", "in_progress", "on_hold"]);
    if (scope.mode === "tenants") tq = tq.in("tenant_id", scope.tenantIds);
    const { data: tasks } = await tq;
    corpTasks = (tasks ?? []) as typeof corpTasks;

    let dq = supabase
      .from("company_documents")
      .select("id,tenant_id,document_name,expiry_date,alert_days_before,status,tenants(name)");
    if (scope.mode === "tenants") dq = dq.in("tenant_id", scope.tenantIds);
    const { data: docRows } = await dq;
    docs = (docRows ?? []) as typeof docs;
  }

  const assigneeIds = [...new Set(corpTasks.map((t) => t.assignee_id).filter(Boolean))] as string[];
  const { data: users } = assigneeIds.length
    ? await supabase.from("users").select("id,full_name,email").in("id", assigneeIds)
    : { data: [] };
  const userMap = new Map((users ?? []).map((u) => [u.id as string, String(u.full_name || u.email || "—")]));

  const tenantMap = new Map(tenants.map((t) => [t.id as string, t]));

  const { data: pendingProposals } = await supabase
    .from("ai_agent_proposals")
    .select("id,title,summary,tenant_id,kind,created_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  const myDayItems: MyDayItem[] = [];

  for (const task of corpTasks) {
    const tn = tenantMap.get(task.tenant_id);
    const tenantName = String(tn?.name ?? "—");
    const days = daysRemaining(task.due_on);
    const tone = taskRowTone({
      status: task.status,
      dueOn: task.due_on,
      followedUpOn: null,
    });
    let severity: RiskLevel = "medium";
    if (tone === "overdue") severity = "critical";
    else if (tone === "due_soon") severity = "high";

    if (days <= 7 || tone === "overdue") {
      const owner = task.assignee_id ? userMap.get(task.assignee_id) : undefined;
      myDayItems.push({
        id: `corp-${task.id}`,
        score:
          severityWeight(severity) +
          (tone === "overdue" ? 50 : 0) +
          (days === 0 ? 40 : 0),
        source: "corporate_task",
        severity,
        title: task.title,
        whyKey:
          tone === "overdue"
            ? "executive.myDay.whyCorpOverdue"
            : "executive.myDay.whyCorpDue",
        whyParams: { tenant: tenantName, days: Math.abs(days) },
        consequenceKey: "executive.myDay.consequenceCorp",
        consequenceParams: { tenant: tenantName },
        actionKey: owner ? "executive.myDay.actionFollowOwner" : "executive.myDay.actionAssign",
        actionParams: { owner: owner ?? "—" },
        tenantName,
        owner,
        dueAt: task.due_on,
        href: "/dashboard/tasks",
      });
    }
  }

  const complianceHotspots: ComplianceIntelItem[] = [];

  for (const doc of docs) {
    const exp = String(doc.expiry_date);
    const alert = Number(doc.alert_days_before);
    const tone = documentRowTone(exp, alert, today);
    if (tone === "ok") continue;
    const days = Math.round(
      (Date.parse(`${exp}T12:00:00.000Z`) - Date.parse(`${today}T12:00:00.000Z`)) / 86400000
    );
    const t = doc.tenants;
    const tenantName = Array.isArray(t)
      ? String(t[0]?.name ?? "—")
      : String((t as { name?: string } | null)?.name ?? "—");
    const riskLevel = docRiskLevel(tone, days);

    complianceHotspots.push({
      id: `doc-${doc.id}`,
      tenantId: doc.tenant_id,
      tenantName,
      name: String(doc.document_name),
      category: classifyComplianceText(String(doc.document_name)),
      expiryOrDeadline: exp,
      daysRemaining: days,
      riskLevel,
      impactKey:
        riskLevel === "critical"
          ? "executive.compliance.impactExpired"
          : "executive.compliance.impactRenewal",
      impactParams: { tenant: tenantName, name: doc.document_name },
      actionKey: "executive.compliance.actionRenew",
      actionParams: { days: Math.max(0, days) },
      owner: undefined,
      source: "company_document",
    });

    myDayItems.push({
      id: `comp-${doc.id}`,
      score: severityWeight(riskLevel) + (tone === "overdue" ? 60 : 35),
      source: "compliance",
      severity: riskLevel,
      title: String(doc.document_name),
      whyKey:
        tone === "overdue"
          ? "executive.myDay.whyComplianceExpired"
          : "executive.myDay.whyComplianceDue",
      whyParams: { tenant: tenantName, days: Math.abs(days) },
      consequenceKey: "executive.compliance.impactExpired",
      consequenceParams: { tenant: tenantName, name: doc.document_name },
      actionKey: "executive.compliance.actionRenew",
      actionParams: { days: Math.max(0, days) },
      tenantName,
      dueAt: exp,
      href: "/dashboard/documents",
    });
  }

  if (odooBrief) {
    for (const item of odooBrief.attentionQueue) {
      const sev: RiskLevel =
        item.severity === "critical" ? "critical" : item.severity === "high" ? "high" : "medium";
      myDayItems.push({
        id: `odoo-${item.id}`,
        score: severityWeight(sev) + (item.daysOffset !== undefined && item.daysOffset < 0 ? 45 : 20),
        source: item.kind === "calendar_event" ? "calendar" : "odoo_task",
        severity: sev,
        title: item.title,
        whyKey:
          item.kind === "calendar_event"
            ? "executive.myDay.whyCalendar"
            : "executive.myDay.whyOdoo",
        whyParams: { project: item.subtitle ?? "—" },
        consequenceKey: "executive.myDay.consequenceOdoo",
        actionKey: "executive.myDay.actionOdoo",
        tenantName: item.subtitle,
        dueAt: item.dueLabel,
        href: "/dashboard/odoo",
      });
    }
  }

  if (emailMetrics?.connected) {
    for (const msg of emailMetrics.messages.filter((m) => m.needsFollowUp).slice(0, 8)) {
      myDayItems.push({
        id: `email-${msg.uid}`,
        score: severityWeight(msg.priority === "high" ? "high" : "medium") + msg.ageHours,
        source: "email",
        severity: msg.priority === "high" ? "high" : "medium",
        title: msg.subject || "(no subject)",
        whyKey: "executive.myDay.whyEmail",
        whyParams: { hours: msg.ageHours },
        consequenceKey: "executive.myDay.consequenceEmail",
        actionKey: "executive.myDay.actionEmail",
        href: "/dashboard/email",
      });
    }
  }

  for (const p of pendingProposals ?? []) {
    const tn = p.tenant_id ? tenantMap.get(p.tenant_id as string) : null;
    myDayItems.push({
      id: `ai-${p.id}`,
      score: 55,
      source: "ai_proposal",
      severity: "medium",
      title: String(p.title),
      whyKey: "executive.myDay.whyAi",
      consequenceKey: "executive.myDay.consequenceAi",
      actionKey: "executive.myDay.actionAi",
      tenantName: tn ? String(tn.name) : undefined,
      href: "/dashboard/ai-agent",
    });
  }

  myDayItems.sort((a, b) => b.score - a.score);

  const warRooms: WarRoomSnapshot[] = tenants.map((tenant) => {
    const tid = tenant.id as string;
    const name = String(tenant.name);
    const slug = String(tenant.slug);
    const tenantCorp = corpTasks.filter((t) => t.tenant_id === tid);
    const overdueCorp = tenantCorp.filter(
      (t) =>
        taskRowTone({ status: t.status, dueOn: t.due_on, followedUpOn: null }) === "overdue"
    ).length;
    const openCorp = tenantCorp.length;
    const tenantDocs = docs.filter((d) => d.tenant_id === tid);
    const urgentDocs = tenantDocs.filter((d) => {
      const tone = documentRowTone(String(d.expiry_date), Number(d.alert_days_before), today);
      return tone !== "ok";
    }).length;

    const odooSignals = odooBrief
      ? odooBrief.complianceItems.filter(
          (c) => c.tenantOrProject && tenantNameMatchesProject(name, c.tenantOrProject)
        ).length
      : 0;

    let health: OperationalHealth = "stable";
    if (overdueCorp > 0 || urgentDocs > 0) health = "critical";
    else if (openCorp > 3 || urgentDocs > 0) health = "watch";

    let interventionKey: string | undefined;
    let interventionParams: Record<string, string | number> | undefined;
    if (overdueCorp > 0) {
      interventionKey = "executive.warRoom.interventionOverdue";
      interventionParams = { count: overdueCorp };
      health = "critical";
    } else if (urgentDocs > 0) {
      interventionKey = "executive.warRoom.interventionCompliance";
      interventionParams = { count: urgentDocs };
      health = worstHealth(health, "watch");
    }

    return {
      tenantId: tid,
      slug,
      name,
      displayAlias: warRoomAliasKeyForTenantName(name),
      health,
      overdueTasks: overdueCorp,
      openTasks: openCorp,
      complianceRisks: urgentDocs + odooSignals,
      urgentDocs,
      stalledSignals: odooSignals,
      topRiskKey:
        urgentDocs > 0
          ? "executive.warRoom.riskCompliance"
          : overdueCorp > 0
            ? "executive.warRoom.riskOverdue"
            : undefined,
      topRiskParams: { count: urgentDocs || overdueCorp },
      interventionKey,
      interventionParams,
    };
  });

  warRooms.sort((a, b) => {
    const rank = { critical: 0, watch: 1, stable: 2 };
    return rank[a.health] - rank[b.health] || b.complianceRisks - a.complianceRisks;
  });

  const insights: ExecutiveInsight[] = [];
  const overloaded = new Map<string, number>();
  for (const t of corpTasks) {
    if (!t.assignee_id) continue;
    const n = userMap.get(t.assignee_id) ?? "—";
    overloaded.set(n, (overloaded.get(n) ?? 0) + 1);
  }
  if (odooBrief?.workload[0]) {
    insights.push({
      id: "wl-odoo",
      severity: odooBrief.workload[0].overdueCount > 0 ? "high" : "medium",
      titleKey: "executive.insight.workloadOdoo",
      titleParams: {
        name: odooBrief.workload[0].name,
        count: odooBrief.workload[0].taskCount,
        overdue: odooBrief.workload[0].overdueCount,
      },
      actionKey: "executive.insight.actionReview",
      actionHref: "/dashboard/odoo",
    });
  }
  const topCorp = [...overloaded.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCorp && topCorp[1] >= 3) {
    insights.push({
      id: "wl-corp",
      severity: "medium",
      titleKey: "executive.insight.workloadCorp",
      titleParams: { name: topCorp[0], count: topCorp[1] },
      actionKey: "executive.insight.actionBalance",
      actionHref: "/dashboard/tasks",
    });
  }
  const exposed = warRooms.find((w) => w.health === "critical");
  if (exposed) {
    insights.push({
      id: "tenant-risk",
      severity: "critical",
      titleKey: "executive.insight.exposedCompany",
      titleParams: { tenant: exposed.name, risks: exposed.complianceRisks + exposed.overdueTasks },
      actionKey: "executive.insight.actionWarRoom",
      actionHref: `/dashboard/war-room/${exposed.slug}`,
    });
  }
  if ((pendingProposals?.length ?? 0) > 0) {
    insights.push({
      id: "ai-pending",
      severity: "medium",
      titleKey: "executive.insight.aiPending",
      titleParams: { count: pendingProposals!.length },
      actionKey: "executive.insight.actionAi",
      actionHref: "/dashboard/ai-agent",
    });
  }

  const overdueCorporate = corpTasks.filter(
    (t) => taskRowTone({ status: t.status, dueOn: t.due_on, followedUpOn: null }) === "overdue"
  ).length;
  const complianceCritical = complianceHotspots.filter((c) => c.riskLevel === "critical").length;
  const criticalRisks =
    myDayItems.filter((i) => i.severity === "critical").length;
  const actionToday = myDayItems.filter((i) => {
    if (!i.dueAt) return i.severity === "critical" || i.severity === "high";
    return i.dueAt <= today;
  }).length;

  let health: OperationalHealth = "stable";
  if (criticalRisks >= 3 || complianceCritical > 0 || overdueCorporate > 2) health = "critical";
  else if (actionToday > 0 || (odooBrief?.health === "watch")) health = "watch";

  const headlineKey =
    health === "critical"
      ? "executive.brief.headlineCritical"
      : health === "watch"
        ? "executive.brief.headlineWatch"
        : "executive.brief.headlineStable";
  const headlineParams = {
    today: actionToday,
    companies: tenants.length,
    critical: criticalRisks,
  };

  const narrativeKeys: string[] = [];
  const narrativeParams: Record<string, string | number>[] = [];
  if (health === "critical") {
    narrativeKeys.push("executive.brief.narrativeCritical1", "executive.brief.narrativeCritical2");
    narrativeParams.push(
      { overdue: overdueCorporate, compliance: complianceCritical },
      { tenant: exposed?.name ?? "—", action: actionToday }
    );
  } else if (health === "watch") {
    narrativeKeys.push("executive.brief.narrativeWatch");
    narrativeParams.push({ today: actionToday, week: myDayItems.filter((i) => i.score > 80).length });
  } else {
    narrativeKeys.push("executive.brief.narrativeStable");
    narrativeParams.push({ companies: tenants.length });
  }

  const priorityKeys: string[] = [];
  const priorityParams: Record<string, string | number>[] = [];
  for (const item of myDayItems.slice(0, 4)) {
    priorityKeys.push(item.actionKey);
    priorityParams.push(item.actionParams ?? { title: item.title });
  }

  const riskKeys: string[] = [];
  const riskParams: Record<string, string | number>[] = [];
  if (complianceCritical > 0) {
    riskKeys.push("executive.brief.riskCompliance");
    riskParams.push({ count: complianceCritical });
  }
  if (overdueCorporate > 0) {
    riskKeys.push("executive.brief.riskOverdue");
    riskParams.push({ count: overdueCorporate });
  }
  if (odooBrief && odooBrief.counts.unassignedTasks > 0) {
    riskKeys.push("executive.brief.riskUnassigned");
    riskParams.push({ count: odooBrief.counts.unassignedTasks });
  }

  const interventionKeys: string[] = [];
  const interventionParams: Record<string, string | number>[] = [];
  for (const w of warRooms.filter((r) => r.health !== "stable").slice(0, 3)) {
    if (w.interventionKey) {
      interventionKeys.push(w.interventionKey);
      interventionParams.push(w.interventionParams ?? { tenant: w.name });
    }
  }

  complianceHotspots.sort((a, b) => severityWeight(b.riskLevel) - severityWeight(a.riskLevel));

  return {
    generatedAt: new Date().toISOString(),
    health,
    tenantCount: tenants.length,
    headlineKey,
    headlineParams,
    narrativeKeys,
    narrativeParams,
    priorityKeys,
    priorityParams,
    riskKeys,
    riskParams,
    interventionKeys,
    interventionParams,
    myDayPreview: myDayItems.slice(0, 6),
    myDayItems,
    warRooms,
    insights: insights.slice(0, 6),
    complianceHotspots: complianceHotspots.slice(0, 20),
    counts: {
      actionToday,
      criticalRisks,
      overdueCorporate,
      overdueOdoo: odooBrief?.counts.overdueTasks ?? 0,
      complianceCritical,
      pendingApprovals: pendingProposals?.length ?? 0,
      emailFollowUps: emailMetrics?.needsFollowUp ?? emailMetrics?.messages.filter((m) => m.needsFollowUp).length ?? 0,
      eventsToday: odooBrief?.counts.eventsToday ?? 0,
    },
  };
}

export async function loadMyDayItems(
  supabase: SupabaseClient,
  userId: string,
  isSuperAdmin: boolean
): Promise<MyDayItem[]> {
  const brief = await loadExecutiveMorningBrief(supabase, userId, isSuperAdmin);
  return brief.myDayItems;
}

export async function loadExecutiveTimeline(
  supabase: SupabaseClient,
  userId: string,
  isSuperAdmin: boolean,
  horizonDays = 30
): Promise<TimelineEntry[]> {
  const brief = await loadExecutiveMorningBrief(supabase, userId, isSuperAdmin);
  const today = utcTodayStr();
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + horizonDays);
  const endStr = end.toISOString().slice(0, 10);

  const scope = await resolveTaskReportScope(supabase, userId, isSuperAdmin);
  const entries: TimelineEntry[] = [];

  if (!(scope.mode === "tenants" && !scope.tenantIds.length)) {
    let tq = supabase
      .from("corporate_tasks")
      .select("id,title,due_on,tenant_id,tenants(name)")
      .gte("due_on", today)
      .lte("due_on", endStr)
      .in("status", ["not_started", "in_progress", "on_hold"]);
    if (scope.mode === "tenants") tq = tq.in("tenant_id", scope.tenantIds);
    const { data: tasks } = await tq;
    for (const t of tasks ?? []) {
      const tn = t.tenants as { name?: string } | { name?: string }[] | null;
      const tenantName = Array.isArray(tn) ? String(tn[0]?.name ?? "") : String(tn?.name ?? "");
      entries.push({
        id: `t-${t.id}`,
        at: String(t.due_on),
        dateLabel: String(t.due_on),
        kind: "task",
        title: String(t.title),
        tenantName,
        severity: String(t.due_on) === today ? "high" : "medium",
        subtitle: tenantName,
      });
    }

    let dq = supabase
      .from("company_documents")
      .select("id,document_name,expiry_date,alert_days_before,tenants(name)")
      .gte("expiry_date", today)
      .lte("expiry_date", endStr);
    if (scope.mode === "tenants") dq = dq.in("tenant_id", scope.tenantIds);
    const { data: docs } = await dq;
    for (const d of docs ?? []) {
      const tn = d.tenants as { name?: string } | { name?: string }[] | null;
      const tenantName = Array.isArray(tn) ? String(tn[0]?.name ?? "") : String(tn?.name ?? "");
      entries.push({
        id: `d-${d.id}`,
        at: String(d.expiry_date),
        dateLabel: String(d.expiry_date),
        kind: "compliance",
        title: String(d.document_name),
        tenantName,
        severity: "high",
        subtitle: tenantName,
      });
    }
  }

  if (brief.counts.eventsToday > 0) {
    entries.push({
      id: "events-today",
      at: today,
      dateLabel: today,
      kind: "calendar",
      title: "Calendar events today",
      severity: "medium",
    });
  }

  entries.sort((a, b) => a.at.localeCompare(b.at));
  return entries.slice(0, 80);
}

export async function loadWarRoomDetail(
  supabase: SupabaseClient,
  userId: string,
  isSuperAdmin: boolean,
  tenantSlug: string
): Promise<{ snapshot: WarRoomSnapshot | null; compliance: ComplianceIntelItem[]; myDay: MyDayItem[] }> {
  const brief = await loadExecutiveMorningBrief(supabase, userId, isSuperAdmin);
  const snapshot = brief.warRooms.find((w) => w.slug === tenantSlug) ?? null;
  const compliance = brief.complianceHotspots.filter(
    (c) => snapshot && c.tenantId === snapshot.tenantId
  );
  const myDay = brief.myDayItems.filter((m) => m.tenantName === snapshot?.name);
  return { snapshot, compliance, myDay };
}
