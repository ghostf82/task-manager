/** Stable nav definition; labels resolved via i18n keys at runtime. */
export const DASHBOARD_NAV_LINKS = [
  { href: "/dashboard", labelKey: "nav.briefing", iconKey: "Sun", superOnly: false },
  { href: "/dashboard/my-day", labelKey: "nav.myDay", iconKey: "Target", superOnly: false },
  { href: "/dashboard/war-room", labelKey: "nav.warRoom", iconKey: "Building2", superOnly: false },
  { href: "/dashboard/timeline", labelKey: "nav.timeline", iconKey: "CalendarDays", superOnly: false },
  {
    href: "/dashboard/odoo",
    labelKey: "nav.odooCommand",
    iconKey: "LayoutGrid",
    superOnly: false,
  },
  {
    href: "/dashboard/email",
    labelKey: "nav.emailCommand",
    iconKey: "Mail",
    superOnly: false,
  },
  { href: "/dashboard/tenants", labelKey: "nav.tenants", iconKey: "Building2", superOnly: true },
  { href: "/dashboard/users", labelKey: "nav.users", iconKey: "Users", superOnly: true },
  {
    href: "/dashboard/ai-governance",
    labelKey: "nav.aiGovernance",
    iconKey: "SlidersHorizontal",
    superOnly: true,
  },
  { href: "/dashboard/tasks", labelKey: "nav.tasks", iconKey: "ClipboardList", superOnly: false },
  {
    href: "/dashboard/documents",
    labelKey: "nav.documents",
    iconKey: "FileText",
    superOnly: false,
  },
  {
    href: "/dashboard/reminders",
    labelKey: "nav.reminders",
    iconKey: "BellRing",
    superOnly: false,
  },
  { href: "/dashboard/chat", labelKey: "nav.chat", iconKey: "MessageCircle", superOnly: false },
  {
    href: "/dashboard/ai-agent",
    labelKey: "nav.aiAgent",
    iconKey: "Sparkles",
    superOnly: false,
  },
  {
    href: "/dashboard/settings/integrations",
    labelKey: "nav.integrations",
    iconKey: "Shield",
    superOnly: false,
  },
] as const;

export type DashboardNavIconKey = (typeof DASHBOARD_NAV_LINKS)[number]["iconKey"];
