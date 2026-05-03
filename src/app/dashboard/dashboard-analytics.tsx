"use client";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardAnalytics({ stats }: { stats: DashboardStats }) {
  const pieData = stats.chart.filter((c) => c.value > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>توزيع المهام</CardTitle>
          <CardDescription>
            مكتمل / متأخر / قيد الانتظار — حسب نطاق صلاحياتك
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[320px] w-full min-h-[280px]">
          {pieData.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              لا توجد بيانات كافية لعرض الرسم بعد.
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
          <CardTitle>الأكثر إنجازاً</CardTitle>
          <CardDescription>مهام مكتملة حسب المسؤول</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          {stats.topActive.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-xs">
              لا بيانات
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
          <CardTitle>الأكثر تأخراً</CardTitle>
          <CardDescription>مهام متأخرة حسب المسؤول</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          {stats.topLate.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-xs">
              لا بيانات
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
