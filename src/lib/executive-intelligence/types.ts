import type { OperationalHealth } from "@/lib/command-center/odoo-operational-brief";

export type RiskLevel = "critical" | "high" | "medium" | "low";

export type MyDayItem = {
  id: string;
  score: number;
  source:
    | "corporate_task"
    | "odoo_task"
    | "compliance"
    | "email"
    | "calendar"
    | "ai_proposal"
    | "notification";
  severity: RiskLevel;
  title: string;
  whyKey: string;
  whyParams?: Record<string, string | number>;
  consequenceKey: string;
  consequenceParams?: Record<string, string | number>;
  actionKey: string;
  actionParams?: Record<string, string | number>;
  tenantName?: string;
  owner?: string;
  dueAt?: string;
  href?: string;
};

export type ComplianceIntelItem = {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  category: string;
  expiryOrDeadline?: string;
  daysRemaining?: number;
  riskLevel: RiskLevel;
  impactKey: string;
  impactParams?: Record<string, string | number>;
  actionKey: string;
  actionParams?: Record<string, string | number>;
  owner?: string;
  source: "company_document" | "odoo_task" | "odoo_project";
};

export type WarRoomSnapshot = {
  tenantId: string;
  slug: string;
  name: string;
  displayAlias?: string;
  health: OperationalHealth;
  overdueTasks: number;
  openTasks: number;
  complianceRisks: number;
  urgentDocs: number;
  stalledSignals: number;
  topRiskKey?: string;
  topRiskParams?: Record<string, string | number>;
  interventionKey?: string;
  interventionParams?: Record<string, string | number>;
};

export type TimelineEntry = {
  id: string;
  at: string;
  dateLabel: string;
  kind: "task" | "compliance" | "calendar" | "email" | "ai" | "milestone";
  title: string;
  tenantName?: string;
  severity: RiskLevel;
  subtitle?: string;
};

export type ExecutiveInsight = {
  id: string;
  severity: RiskLevel;
  titleKey: string;
  titleParams?: Record<string, string | number>;
  bodyKey?: string;
  bodyParams?: Record<string, string | number>;
  actionKey?: string;
  actionHref?: string;
};

export type ExecutiveMorningBrief = {
  generatedAt: string;
  health: OperationalHealth;
  tenantCount: number;
  headlineKey: string;
  headlineParams: Record<string, string | number>;
  narrativeKeys: string[];
  narrativeParams: Record<string, string | number>[];
  priorityKeys: string[];
  priorityParams: Record<string, string | number>[];
  riskKeys: string[];
  riskParams: Record<string, string | number>[];
  interventionKeys: string[];
  interventionParams: Record<string, string | number>[];
  myDayPreview: MyDayItem[];
  myDayItems: MyDayItem[];
  warRooms: WarRoomSnapshot[];
  insights: ExecutiveInsight[];
  complianceHotspots: ComplianceIntelItem[];
  counts: {
    actionToday: number;
    criticalRisks: number;
    overdueCorporate: number;
    overdueOdoo: number;
    complianceCritical: number;
    pendingApprovals: number;
    emailFollowUps: number;
    eventsToday: number;
  };
};
