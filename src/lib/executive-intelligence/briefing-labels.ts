import type { ExecutiveMorningBrief, ExecutiveInsight, MyDayItem, WarRoomSnapshot } from "@/lib/executive-intelligence/types";

export type ExecutiveLabels = {
  briefingEyebrow: string;
  briefingTitle: string;
  briefingDesc: string;
  myDayTitle: string;
  myDayDesc: string;
  warRoomTitle: string;
  warRoomDesc: string;
  timelineTitle: string;
  timelineDesc: string;
  healthCritical: string;
  healthWatch: string;
  healthStable: string;
  prioritiesTitle: string;
  risksTitle: string;
  interventionsTitle: string;
  insightsTitle: string;
  complianceTitle: string;
  warRoomsTitle: string;
  openMyDay: string;
  openTimeline: string;
  openWarRoom: string;
  viewAllWarRooms: string;
  whyLabel: string;
  consequenceLabel: string;
  actionLabel: string;
  impactLabel: string;
  ownerLabel: string;
  noItems: string;
  backBriefing: string;
  reportsDaily: string;
  reportsWeekly: string;
  reportsCompliance: string;
  reportsRisk: string;
  reportsPerformance: string;
  generatedAt: string;
  companiesMonitored: string;
  actionToday: string;
  criticalRisks: string;
  pendingApprovals: string;
};

function t(
  fn: (key: string) => string,
  key: string,
  params?: Record<string, string | number>
): string {
  let s = fn(`executive.${key}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

export function buildExecutiveLabels(tr: (key: string) => string): ExecutiveLabels {
  return {
    briefingEyebrow: tr("executive.briefing.eyebrow"),
    briefingTitle: tr("executive.briefing.title"),
    briefingDesc: tr("executive.briefing.desc"),
    myDayTitle: tr("executive.myDay.title"),
    myDayDesc: tr("executive.myDay.desc"),
    warRoomTitle: tr("executive.warRoom.title"),
    warRoomDesc: tr("executive.warRoom.desc"),
    timelineTitle: tr("executive.timeline.title"),
    timelineDesc: tr("executive.timeline.desc"),
    healthCritical: tr("executive.health.critical"),
    healthWatch: tr("executive.health.watch"),
    healthStable: tr("executive.health.stable"),
    prioritiesTitle: tr("executive.brief.prioritiesTitle"),
    risksTitle: tr("executive.brief.risksTitle"),
    interventionsTitle: tr("executive.brief.interventionsTitle"),
    insightsTitle: tr("executive.brief.insightsTitle"),
    complianceTitle: tr("executive.compliance.title"),
    warRoomsTitle: tr("executive.warRoom.listTitle"),
    openMyDay: tr("executive.brief.openMyDay"),
    openTimeline: tr("executive.brief.openTimeline"),
    openWarRoom: tr("executive.warRoom.open"),
    viewAllWarRooms: tr("executive.warRoom.viewAll"),
    whyLabel: tr("executive.labels.why"),
    consequenceLabel: tr("executive.labels.consequence"),
    actionLabel: tr("executive.labels.action"),
    impactLabel: tr("executive.labels.impact"),
    ownerLabel: tr("executive.labels.owner"),
    noItems: tr("executive.labels.noItems"),
    backBriefing: tr("executive.labels.backBriefing"),
    reportsDaily: tr("executive.reports.daily"),
    reportsWeekly: tr("executive.reports.weekly"),
    reportsCompliance: tr("executive.reports.compliance"),
    reportsRisk: tr("executive.reports.risk"),
    reportsPerformance: tr("executive.reports.performance"),
    generatedAt: tr("executive.labels.generatedAt"),
    companiesMonitored: tr("executive.labels.companiesMonitored"),
    actionToday: tr("executive.labels.actionToday"),
    criticalRisks: tr("executive.labels.criticalRisks"),
    pendingApprovals: tr("executive.labels.pendingApprovals"),
  };
}

export function resolveBriefText(
  tr: (key: string) => string,
  key: string,
  params?: Record<string, string | number>
): string {
  if (key.startsWith("executive.")) return t(tr, key.replace(/^executive\./, ""), params);
  return t(tr, key, params);
}

export function briefHeadline(tr: (k: string) => string, brief: ExecutiveMorningBrief): string {
  return resolveBriefText(tr, brief.headlineKey.replace("executive.", ""), brief.headlineParams);
}

export function briefNarratives(tr: (k: string) => string, brief: ExecutiveMorningBrief): string[] {
  return brief.narrativeKeys.map((k, i) =>
    resolveBriefText(tr, k.replace("executive.", ""), brief.narrativeParams[i])
  );
}

export function insightTitle(tr: (k: string) => string, insight: ExecutiveInsight): string {
  return resolveBriefText(tr, insight.titleKey.replace("executive.", ""), insight.titleParams);
}

export function myDayWhy(tr: (k: string) => string, item: MyDayItem): string {
  return resolveBriefText(tr, item.whyKey.replace("executive.", ""), item.whyParams);
}

export function myDayConsequence(tr: (k: string) => string, item: MyDayItem): string {
  return resolveBriefText(tr, item.consequenceKey.replace("executive.", ""), item.consequenceParams);
}

export function myDayAction(tr: (k: string) => string, item: MyDayItem): string {
  return resolveBriefText(tr, item.actionKey.replace("executive.", ""), item.actionParams);
}

export function warRoomLabel(tr: (k: string) => string, room: WarRoomSnapshot): string {
  if (room.displayAlias) return tr(room.displayAlias);
  return room.name;
}
