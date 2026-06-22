import type { ComplianceCategory } from "@/lib/command-center/compliance-classifier";

export type OdooBriefLabels = {
  eyebrow: string;
  title: string;
  desc: string;
  notLinked: string;
  linkAccount: string;
  linkPrompt: string;
  noLicense: string;
  live: string;
  settings: string;
  openOdoo: string;
  aiBrief: string;
  syncWorkspace: string;
  healthCritical: string;
  healthWatch: string;
  healthStable: string;
  attentionTitle: string;
  attentionDesc: string;
  attentionToday: string;
  attentionCritical: string;
  narrativeCritical: string;
  narrativeWatch: string;
  narrativeStable: string;
  insightsTitle: string;
  insightsDesc: string;
  queueTitle: string;
  queueEmpty: string;
  queueKindTask: string;
  queueKindDoc: string;
  queueKindEvent: string;
  workCentersTitle: string;
  zoneBrief: string;
  zoneCompliance: string;
  zoneTasks: string;
  zoneProjects: string;
  zoneCalendar: string;
  zoneDocuments: string;
  zoneReports: string;
  openWorkspace: string;
  openWorkspaceSection: string;
  complianceTitle: string;
  complianceDesc: string;
  complianceEmpty: string;
  complianceSourceDoc: string;
  complianceSourceTask: string;
  complianceSourceProject: string;
  daysRemaining: string;
  overdueLabel: string;
  reportsTitle: string;
  reportsDesc: string;
  reportComplianceExcel: string;
  reportCompliancePdf: string;
  reportTasksPdf: string;
  reportTasksExcel: string;
  reportOdooExcel: string;
  reportOperationalPdf: string;
  workloadTitle: string;
  actionToday: string;
  dueToday: string;
  due7: string;
  due30: string;
  complianceRisk: string;
  unassigned: string;
  eventsToday: string;
  lastSync: string;
  syncStaleHint: string;
  categoryLabels: Record<ComplianceCategory, string>;
  insightCompliance90: string;
  insightTenantExposed: string;
  insightWorkload: string;
  insightStalledProjects: string;
  insightUnassigned: string;
  insightOverdue: string;
  insightDue7: string;
  insightSyncStale: string;
  workspaceTitle: string;
  workspaceSubtitle: string;
  tabOverview: string;
  tabTasks: string;
  tabProjects: string;
  tabCalendar: string;
  tabDocuments: string;
  tabReports: string;
  summaryAttention: string;
  summaryDueSoon: string;
  summaryOverdue: string;
  summaryHighPriority: string;
  summaryUnassigned: string;
  summaryLastSync: string;
  priorityFeedTitle: string;
  priorityFeedDesc: string;
  priorityFeedEmpty: string;
  futureCalendarTitle: string;
  futureCalendarHint: string;
};

function insight(
  t: (key: string) => string,
  key: string,
  params?: Record<string, string | number>
): string {
  let s = t(`commandCenter.odoo.${key}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

export function buildOdooBriefLabels(t: (key: string) => string): OdooBriefLabels {
  const categories: ComplianceCategory[] = [
    "commercial_registration",
    "industrial_license",
    "environmental_permit",
    "iso_certification",
    "chamber_membership",
    "transportation_license",
    "government_compliance",
    "contract",
    "renewal",
    "general",
  ];

  const categoryLabels = Object.fromEntries(
    categories.map((c) => [c, t(`commandCenter.odoo.category.${c}`)])
  ) as Record<ComplianceCategory, string>;

  return {
    eyebrow: t("commandCenter.odoo.eyebrow"),
    title: t("commandCenter.odoo.title"),
    desc: t("commandCenter.odoo.desc"),
    notLinked: t("commandCenter.odoo.notLinked"),
    linkAccount: t("commandCenter.odoo.linkAccount"),
    linkPrompt: t("commandCenter.odoo.linkPrompt"),
    noLicense: t("commandCenter.odoo.noLicense"),
    live: t("commandCenter.odoo.live"),
    settings: t("commandCenter.odoo.settings"),
    openOdoo: t("commandCenter.odoo.openOdoo"),
    aiBrief: t("commandCenter.odoo.aiBrief"),
    syncWorkspace: t("commandCenter.odoo.syncWorkspace"),
    healthCritical: t("commandCenter.odoo.healthCritical"),
    healthWatch: t("commandCenter.odoo.healthWatch"),
    healthStable: t("commandCenter.odoo.healthStable"),
    attentionTitle: t("commandCenter.odoo.attentionTitle"),
    attentionDesc: t("commandCenter.odoo.attentionDesc"),
    attentionToday: t("commandCenter.odoo.attentionToday"),
    attentionCritical: t("commandCenter.odoo.attentionCritical"),
    narrativeCritical: t("commandCenter.odoo.narrativeCritical"),
    narrativeWatch: t("commandCenter.odoo.narrativeWatch"),
    narrativeStable: t("commandCenter.odoo.narrativeStable"),
    insightsTitle: t("commandCenter.odoo.insightsTitle"),
    insightsDesc: t("commandCenter.odoo.insightsDesc"),
    queueTitle: t("commandCenter.odoo.queueTitle"),
    queueEmpty: t("commandCenter.odoo.queueEmpty"),
    queueKindTask: t("commandCenter.odoo.queueKindTask"),
    queueKindDoc: t("commandCenter.odoo.queueKindDoc"),
    queueKindEvent: t("commandCenter.odoo.queueKindEvent"),
    workCentersTitle: t("commandCenter.odoo.workCentersTitle"),
    zoneBrief: t("commandCenter.odoo.zoneBrief"),
    zoneCompliance: t("commandCenter.odoo.zoneCompliance"),
    zoneTasks: t("commandCenter.odoo.zoneTasks"),
    zoneProjects: t("commandCenter.odoo.zoneProjects"),
    zoneCalendar: t("commandCenter.odoo.zoneCalendar"),
    zoneDocuments: t("commandCenter.odoo.zoneDocuments"),
    zoneReports: t("commandCenter.odoo.zoneReports"),
    openWorkspace: t("commandCenter.odoo.openWorkspace"),
    openWorkspaceSection: t("commandCenter.odoo.openWorkspaceSection"),
    complianceTitle: t("commandCenter.odoo.complianceTitle"),
    complianceDesc: t("commandCenter.odoo.complianceDesc"),
    complianceEmpty: t("commandCenter.odoo.complianceEmpty"),
    complianceSourceDoc: t("commandCenter.odoo.complianceSourceDoc"),
    complianceSourceTask: t("commandCenter.odoo.complianceSourceTask"),
    complianceSourceProject: t("commandCenter.odoo.complianceSourceProject"),
    daysRemaining: t("commandCenter.odoo.daysRemaining"),
    overdueLabel: t("commandCenter.odoo.overdueLabel"),
    reportsTitle: t("commandCenter.odoo.reportsTitle"),
    reportsDesc: t("commandCenter.odoo.reportsDesc"),
    reportComplianceExcel: t("commandCenter.odoo.reportComplianceExcel"),
    reportCompliancePdf: t("commandCenter.odoo.reportCompliancePdf"),
    reportTasksPdf: t("commandCenter.odoo.reportTasksPdf"),
    reportTasksExcel: t("commandCenter.odoo.reportTasksExcel"),
    reportOdooExcel: t("commandCenter.odoo.reportOdooExcel"),
    reportOperationalPdf: t("commandCenter.odoo.reportOperationalPdf"),
    workloadTitle: t("commandCenter.odoo.workloadTitle"),
    actionToday: t("commandCenter.odoo.actionToday"),
    dueToday: t("commandCenter.odoo.dueToday"),
    due7: t("commandCenter.odoo.due7"),
    due30: t("commandCenter.odoo.due30"),
    complianceRisk: t("commandCenter.odoo.complianceRisk"),
    unassigned: t("commandCenter.odoo.unassigned"),
    eventsToday: t("commandCenter.odoo.eventsToday"),
    lastSync: t("commandCenter.odoo.lastSync"),
    syncStaleHint: t("commandCenter.odoo.syncStaleHint"),
    categoryLabels,
    insightCompliance90: insight(t, "insightCompliance90", { count: 0 }),
    insightTenantExposed: insight(t, "insightTenantExposed", { tenant: "—", count: 0 }),
    insightWorkload: insight(t, "insightWorkload", { name: "—", count: 0, overdue: 0 }),
    insightStalledProjects: insight(t, "insightStalledProjects", { count: 0 }),
    insightUnassigned: insight(t, "insightUnassigned", { count: 0 }),
    insightOverdue: insight(t, "insightOverdue", { count: 0 }),
    insightDue7: insight(t, "insightDue7", { count: 0 }),
    insightSyncStale: insight(t, "insightSyncStale"),
    workspaceTitle: t("commandCenter.odoo.workspaceTitle"),
    workspaceSubtitle: t("commandCenter.odoo.workspaceSubtitle"),
    tabOverview: t("commandCenter.odoo.tabOverview"),
    tabTasks: t("commandCenter.odoo.tabTasks"),
    tabProjects: t("commandCenter.odoo.tabProjects"),
    tabCalendar: t("commandCenter.odoo.tabCalendar"),
    tabDocuments: t("commandCenter.odoo.tabDocuments"),
    tabReports: t("commandCenter.odoo.tabReports"),
    summaryAttention: t("commandCenter.odoo.summaryAttention"),
    summaryDueSoon: t("commandCenter.odoo.summaryDueSoon"),
    summaryOverdue: t("commandCenter.odoo.summaryOverdue"),
    summaryHighPriority: t("commandCenter.odoo.summaryHighPriority"),
    summaryUnassigned: t("commandCenter.odoo.summaryUnassigned"),
    summaryLastSync: t("commandCenter.odoo.summaryLastSync"),
    priorityFeedTitle: t("commandCenter.odoo.priorityFeedTitle"),
    priorityFeedDesc: t("commandCenter.odoo.priorityFeedDesc"),
    priorityFeedEmpty: t("commandCenter.odoo.priorityFeedEmpty"),
    futureCalendarTitle: t("commandCenter.odoo.futureCalendarTitle"),
    futureCalendarHint: t("commandCenter.odoo.futureCalendarHint"),
  };
}

export function formatInsightText(
  labels: OdooBriefLabels,
  titleKey: string,
  titleParams?: Record<string, string | number>,
  bodyKey?: string,
  bodyParams?: Record<string, string | number>
): { title: string; body?: string } {
  const keyMap: Record<string, keyof OdooBriefLabels> = {
    "commandCenter.odoo.insightCompliance90": "insightCompliance90",
    "commandCenter.odoo.insightTenantExposed": "insightTenantExposed",
    "commandCenter.odoo.insightWorkload": "insightWorkload",
    "commandCenter.odoo.insightStalledProjects": "insightStalledProjects",
    "commandCenter.odoo.insightUnassigned": "insightUnassigned",
    "commandCenter.odoo.insightOverdue": "insightOverdue",
    "commandCenter.odoo.insightDue7": "insightDue7",
    "commandCenter.odoo.insightSyncStale": "insightSyncStale",
  };

  const templateKey = keyMap[titleKey];
  let title = templateKey ? String(labels[templateKey]) : titleKey;
  if (titleParams) {
    for (const [k, v] of Object.entries(titleParams)) {
      title = title.replace(`{${k}}`, String(v));
    }
  }

  let body: string | undefined;
  if (bodyKey) {
    body = bodyKey;
    if (bodyParams) {
      for (const [k, v] of Object.entries(bodyParams)) {
        body = body.replace(`{${k}}`, String(v));
      }
    }
  }

  return { title, body };
}
