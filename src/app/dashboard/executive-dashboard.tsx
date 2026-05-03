"use client";

import type { ComponentType } from "react";
import Link from "next/link";
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    default: "ring-border/80",
    emerald: "ring-emerald-500/25",
    amber: "ring-amber-500/25",
    violet: "ring-violet-500/25",
    rose: "ring-rose-500/25",
  }[tone];
  const toneBg = {
    default: "from-muted/40",
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
      <Link href={href} className="block h-full transition-opacity hover:opacity-95">
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
}: {
  summary: ExecutiveSummary;
  taskPie: TaskStatusPieSlice[];
  docBar: DocumentsExpiringByTenant[];
  isSuperAdmin: boolean;
  tenantCount: number;
  userCount: number;
  unreadNotif: number;
}) {
  const pieData = taskPie.filter((s) => s.value > 0);
  const pieSum = taskPie.reduce((a, b) => a + b.value, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-slate-500/8 via-background to-violet-500/10 p-6 shadow-sm md:p-8">
        <div className="pointer-events-none absolute -start-24 -top-24 size-72 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-widest">
              <LayoutDashboard className="size-3.5 opacity-70" />
              لوحة قيادة تنفيذية
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              نظرة شاملة على الأداء
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
              إحصائيات تلتزم بصلاحياتك: السوبر أدمن يرى كل الشركات، والموظف يرى شركاته فقط
              (RLS).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/api/reports/tasks?format=xlsx"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "shadow-sm")}
            >
              Excel — المهام
            </Link>
            <Link
              href="/api/reports/documents"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              Excel — المستندات
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="مستندات صالحة"
          value={summary.documentsStable}
          hint="بعيدة عن انتهاء النافذة التحذيرية"
          icon={FileCheck}
          href="/dashboard/documents"
          tone="emerald"
        />
        <SummaryCard
          title="منتهية أو قيد التنبيه"
          value={summary.documentsUrgent}
          hint="تتطلب متابعة أو تجديداً"
          icon={FileWarning}
          href="/dashboard/documents"
          tone="amber"
        />
        <SummaryCard
          title="مهام مفتوحة"
          value={summary.tasksOpen}
          hint="غير مكتملة وغير ملغاة"
          icon={ClipboardList}
          href="/dashboard/tasks"
          tone="default"
        />
        <SummaryCard
          title="مقترحات ذكاء معلّقة"
          value={summary.aiProposalsPending}
          hint="في انتظار مراجعتك"
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
                الشركات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{tenantCount}</p>
              <Link
                href="/dashboard/tenants"
                className="text-primary mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline"
              >
                إدارة الشركات
              </Link>
            </CardContent>
          </Card>
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 opacity-70" />
                المستخدمين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{userCount}</p>
              <Link
                href="/dashboard/users"
                className="text-primary mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline"
              >
                إدارة المستخدمين
              </Link>
            </CardContent>
          </Card>
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-4 opacity-70" />
                إشعارات غير مقروءة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{unreadNotif}</p>
              <p className="text-muted-foreground mt-2 text-xs">من كل النظام</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-4 opacity-70" />
              إشعارات غير مقروءة
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
              توزيع حالات المهام
            </CardTitle>
            <CardDescription>مكتملة، قيد التنفيذ، متأخرة — ضمن نطاقك</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] w-full min-h-[260px]">
            {pieSum === 0 ? (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                لا مهام في النطاق الحالي.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData.length ? pieData : taskPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={2}
                    label
                  >
                    {(pieData.length ? pieData : taskPie).map((e, i) => (
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

        <Card className="shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="size-4 text-muted-foreground" />
              مستندات تحتاج اهتماماً — حسب الشركة
            </CardTitle>
            <CardDescription>
              عدد المستندات المنتهية أو داخل نافذة التنبيه لكل شركة
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] w-full min-h-[260px]">
            {!docBar.length ? (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                لا توجد مستندات ضمن النطاق أو كلها بعيدة عن الاستحقاق.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={docBar}
                  layout="vertical"
                  margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 10 }}
                    interval={0}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" radius={[0, 6, 6, 0]} name="مستندات" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>اختصارات سريعة</CardTitle>
          <CardDescription>وصول مباشر لأهم الوحدات</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/tasks"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            مهام الشركات
          </Link>
          <Link
            href="/dashboard/documents"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            مستندات الشركات
          </Link>
          <Link
            href="/dashboard/chat"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            مركز التواصل
          </Link>
          <Link
            href="/dashboard/ai-agent"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            المساعد الذكي
          </Link>
          {isSuperAdmin ? (
            <>
              <Link
                href="/dashboard/tenants"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                إدارة الشركات
              </Link>
              <Link
                href="/dashboard/users"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                إدارة المستخدمين
              </Link>
              <Link
                href="/dashboard/ai-governance"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                حوكمة أدوات الذكاء
              </Link>
            </>
          ) : null}
          <Link
            href="/dashboard/reminders"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            التذكيرات الشخصية
          </Link>
          <Link
            href="/dashboard/profile"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            الملف الشخصي
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
