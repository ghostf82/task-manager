"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bell,
  Building2,
  ClipboardList,
  FileCheck,
  FileWarning,
  LayoutDashboard,
  Sparkles,
  Users,
} from "lucide-react";

import type {
  DocumentsExpiringByTenant,
  ExecutiveSummary,
  TaskStatusPieSlice,
} from "@/lib/executive-stats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SizedChartHost } from "@/components/ui/sized-chart-host";
import { buttonVariants } from "@/components/ui/button";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { cn } from "@/lib/utils";
import { DashboardRefreshButton } from "@/app/dashboard/dashboard-refresh-button";

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  href,
  tone,
}: {
  title: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  tone: "default" | "emerald" | "amber" | "violet" | "rose";
}) {
  const toneRing = {
    default: "ring-gold/15",
    emerald: "ring-emerald-500/25",
    amber: "ring-amber-500/25",
    violet: "ring-violet-500/25",
    rose: "ring-rose-500/25",
  }[tone];
  const toneBg = {
    default: "from-primary/8",
    emerald: "from-emerald-500/12",
    amber: "from-amber-500/12",
    violet: "from-violet-500/12",
    rose: "from-rose-500/12",
  }[tone];

  const inner = (
    <Card
      className={cn(
        "relative h-full overflow-hidden shadow-sm ring-1 transition-shadow hover:shadow-md",
        toneRing
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-90",
          toneBg
        )}
      />
      <CardHeader className="relative pb-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="size-5 shrink-0 text-muted-foreground/70" />
        </div>
      </CardHeader>
      <CardContent className="relative pt-0">
        <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">{hint}</p>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        className="block h-full transition-opacity hover:opacity-95"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export function ExecutiveDashboard({
  summary,
  taskPie,
  docBar,
  isSuperAdmin,
  tenantCount,
  userCount,
  unreadNotif,
  lastScanAt,
  lastScanMessage,
}: {
  summary: ExecutiveSummary;
  taskPie: TaskStatusPieSlice[];
  docBar: DocumentsExpiringByTenant[];
  isSuperAdmin: boolean;
  tenantCount: number;
  userCount: number;
  unreadNotif: number;
  lastScanAt?: string | null;
  lastScanMessage?: string | null;
}) {
  const { t, dateLocale } = useDashboardI18n();
  const pieSlices = useMemo(
    () =>
      taskPie.map((s) => ({
        name: t(s.labelKey),
        value: s.value,
        fill: s.fill,
      })),
    [taskPie, t],
  );
  const pieData = pieSlices.filter((s) => s.value > 0);
  const pieSum = pieSlices.reduce((a, b) => a + b.value, 0);
  const pieChartData = pieData.length ? pieData : pieSlices;
  const docBarCrowded = docBar.length > 8;
  const docBarShowValueLabels = docBar.length > 0 && !docBarCrowded;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="premium-hero p-6 md:p-8">
        <div className="pointer-events-none absolute -start-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -end-16 bottom-0 size-64 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <LayoutDashboard className="size-3.5 opacity-90" />
              {t("executiveDashboard.eyebrow")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("executiveDashboard.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t("executiveDashboard.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DashboardRefreshButton />
            <a
              href="/api/reports/tasks?format=xlsx"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "shadow-sm")}
            >
              {t("executiveDashboard.excelTasks")}
            </a>
            <a
              href="/api/reports/documents"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              {t("executiveDashboard.excelDocuments")}
            </a>
          </div>
        </div>
        {lastScanAt ? (
          <p className="relative mt-3 text-xs text-muted-foreground">
            <span>{t("executiveDashboard.lastSyncLabel")} </span>
            <span suppressHydrationWarning>
              {new Date(lastScanAt).toLocaleString(dateLocale, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
            {lastScanMessage ? ` - ${lastScanMessage}` : ""}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={t("executiveDashboard.docStableTitle")}
          value={summary.documentsStable}
          hint={t("executiveDashboard.docStableHint")}
          icon={FileCheck}
          href="/dashboard/documents"
          tone="emerald"
        />
        <SummaryCard
          title={t("executiveDashboard.docUrgentTitle")}
          value={summary.documentsUrgent}
          hint={t("executiveDashboard.docUrgentHint")}
          icon={FileWarning}
          href="/dashboard/documents"
          tone="amber"
        />
        <SummaryCard
          title={t("executiveDashboard.tasksOpenTitle")}
          value={summary.tasksOpen}
          hint={t("executiveDashboard.tasksOpenHint")}
          icon={ClipboardList}
          href="/dashboard/tasks"
          tone="default"
        />
        <SummaryCard
          title={t("executiveDashboard.aiPendingTitle")}
          value={summary.aiProposalsPending}
          hint={t("executiveDashboard.aiPendingHint")}
          icon={Sparkles}
          href="/dashboard/ai-agent"
          tone="violet"
        />
      </div>

      {isSuperAdmin ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 opacity-70" />
                {t("executiveDashboard.adminTenantsTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{tenantCount}</p>
              <Link
                prefetch={false}
                href="/dashboard/tenants"
                className="text-primary mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline"
              >
                {t("executiveDashboard.adminTenantsLink")}
              </Link>
            </CardContent>
          </Card>
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 opacity-70" />
                {t("executiveDashboard.adminUsersTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{userCount}</p>
              <Link
                prefetch={false}
                href="/dashboard/users"
                className="text-primary mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline"
              >
                {t("executiveDashboard.adminUsersLink")}
              </Link>
            </CardContent>
          </Card>
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-4 opacity-70" />
                {t("executiveDashboard.unreadTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{unreadNotif}</p>
              <p className="text-muted-foreground mt-2 text-xs">
                {t("executiveDashboard.unreadSystemHint")}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-4 opacity-70" />
              {t("executiveDashboard.unreadTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{unreadNotif}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm ring-1 ring-border/50 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-muted-foreground" />
              {t("executiveDashboard.taskDistributionTitle")}
            </CardTitle>
            <CardDescription>{t("executiveDashboard.taskDistributionDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="h-[min(340px,42vh)] w-full min-h-[280px] min-w-0">
            {pieSum === 0 ? (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                {t("executiveDashboard.taskDistributionEmpty")}
              </p>
            ) : (
              <SizedChartHost className="h-full w-full min-h-[260px] min-w-0">
                {({ width, height }) => (
                  <ResponsiveContainer width={width} height={height}>
                    <PieChart margin={{ top: 8, right: 12, bottom: 40, left: 12 }}>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="46%"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={2}
                        label={false}
                      >
                        {pieChartData.map((e, i) => (
                          <Cell key={i} fill={e.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => {
                          const n =
                            typeof value === "number"
                              ? value
                              : typeof value === "string"
                                ? Number(value)
                                : Number(value ?? 0);
                          return [Number.isFinite(n) ? n : 0, String(name ?? "")];
                        }}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </SizedChartHost>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="size-4 text-muted-foreground" />
              {t("executiveDashboard.docsByTenantTitle")}
            </CardTitle>
            <CardDescription>{t("executiveDashboard.docsByTenantDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="h-[min(340px,42vh)] w-full min-h-[280px] min-w-0">
            {!docBar.length ? (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                {t("executiveDashboard.docsByTenantEmpty")}
              </p>
            ) : (
              <SizedChartHost className="h-full w-full min-h-[260px] min-w-0">
                {({ width, height }) => (
                  <ResponsiveContainer width={width} height={height}>
                    <BarChart
                      data={docBar}
                      margin={{ left: 16, right: 28, top: docBarShowValueLabels ? 28 : 20, bottom: 88 }}
                      barCategoryGap="14%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        strokeOpacity={0.55}
                        vertical={false}
                      />
                      <XAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        angle={-25}
                        textAnchor="end"
                        height={84}
                        interval={0}
                      />
                      <YAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        width={44}
                      />
                      <Tooltip
                        formatter={(value) => {
                          const n =
                            typeof value === "number"
                              ? value
                              : typeof value === "string"
                                ? Number(value)
                                : Number(value ?? 0);
                          return [
                            Number.isFinite(n) ? n : 0,
                            t("executiveDashboard.chartDocsSeries"),
                          ];
                        }}
                        labelFormatter={(label) => String(label ?? "")}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#f59e0b"
                        radius={[6, 6, 0, 0]}
                        name={t("executiveDashboard.chartDocsSeries")}
                      >
                        {docBarShowValueLabels ? (
                          <LabelList
                            dataKey="count"
                            position="top"
                            fontSize={11}
                            fill="hsl(var(--foreground))"
                          />
                        ) : null}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </SizedChartHost>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("executiveDashboard.shortcutsTitle")}</CardTitle>
          <CardDescription>{t("executiveDashboard.shortcutsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            prefetch={false}
            href="/dashboard/odoo"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            {t("executiveDashboard.shortcutsOdooCommand")}
          </Link>
          <Link
            prefetch={false}
            href="/dashboard/email"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            {t("executiveDashboard.shortcutsEmailCommand")}
          </Link>
          <Link
            prefetch={false}
            href="/dashboard/tasks"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            {t("executiveDashboard.shortcutsTasks")}
          </Link>
          <Link
            prefetch={false}
            href="/dashboard/documents"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            {t("executiveDashboard.shortcutsDocs")}
          </Link>
          <Link
            prefetch={false}
            href="/dashboard/chat"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("executiveDashboard.shortcutsChat")}
          </Link>
          <Link
            prefetch={false}
            href="/dashboard/ai-agent"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("executiveDashboard.shortcutsAi")}
          </Link>
          {isSuperAdmin ? (
            <>
              <Link
                prefetch={false}
                href="/dashboard/tenants"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {t("executiveDashboard.shortcutsAdminTenants")}
              </Link>
              <Link
                prefetch={false}
                href="/dashboard/users"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {t("executiveDashboard.shortcutsAdminUsers")}
              </Link>
              <Link
                prefetch={false}
                href="/dashboard/ai-governance"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {t("executiveDashboard.shortcutsAdminGovernance")}
              </Link>
            </>
          ) : null}
          <Link
            prefetch={false}
            href="/dashboard/reminders"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("executiveDashboard.shortcutsReminders")}
          </Link>
          <Link
            prefetch={false}
            href="/dashboard/profile"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("executiveDashboard.shortcutsProfile")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
