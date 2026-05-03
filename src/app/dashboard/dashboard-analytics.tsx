"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardStats } from "@/lib/dashboard-stats";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardAnalytics({ stats }: { stats: DashboardStats }) {
  const { t } = useDashboardI18n();
  const pieData = useMemo(
    () =>
      stats.chart
        .filter((c) => c.value > 0)
        .map((c) => ({
          name: t(`dashboardAnalytics.chart.${c.segment}`),
          value: c.value,
          fill: c.fill,
        })),
    [stats.chart, t]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t("dashboardAnalytics.pieTitle")}</CardTitle>
          <CardDescription>{t("dashboardAnalytics.pieDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px] w-full min-h-[280px]">
          {pieData.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              {t("dashboardAnalytics.pieNoData")}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={96}
                  paddingAngle={2}
                  label
                >
                  {pieData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboardAnalytics.topDoneTitle")}</CardTitle>
          <CardDescription>{t("dashboardAnalytics.topDoneDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          {stats.topActive.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-xs">
              {t("dashboardAnalytics.noData")}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.topActive}
                layout="vertical"
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={100}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboardAnalytics.topLateTitle")}</CardTitle>
          <CardDescription>{t("dashboardAnalytics.topLateDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          {stats.topLate.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-xs">
              {t("dashboardAnalytics.noData")}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.topLate}
                layout="vertical"
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={100}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
