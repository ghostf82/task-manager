"use client";

import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react";

import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ReportDef = {
  href: string;
  label: string;
  desc: string;
  icon: typeof FileTextIcon;
  format: "pdf" | "excel";
  ready: boolean;
};

export function OdooReportsPanel({ labels, locale }: { labels: OdooBriefLabels; locale: string }) {
  const reports: ReportDef[] = [
    {
      href: "/api/reports/odoo-operational",
      label: labels.reportOperationalPdf,
      desc: locale === "en" ? "Executive summary, KPIs, priority queue, risks" : "ملخص تنفيذي، مؤشرات، قائمة أولويات، مخاطر",
      icon: FileTextIcon,
      format: "pdf",
      ready: true,
    },
    {
      href: "/api/reports/odoo-workspace",
      label: labels.reportOdooExcel,
      desc: locale === "en" ? "Multi-sheet workspace export with formatting" : "تصدير مساحة العمل — أوراق متعددة وتنسيق احترافي",
      icon: FileSpreadsheetIcon,
      format: "excel",
      ready: true,
    },
    {
      href: "/api/reports/documents",
      label: labels.reportComplianceExcel,
      desc: locale === "en" ? "Company compliance register" : "سجل امتثال الشركة",
      icon: FileSpreadsheetIcon,
      format: "excel",
      ready: true,
    },
    {
      href: "/api/reports/tasks?format=pdf",
      label: labels.reportTasksPdf,
      desc: locale === "en" ? "Corporate tasks PDF" : "مهام الشركات PDF",
      icon: FileTextIcon,
      format: "pdf",
      ready: true,
    },
    {
      href: "/api/reports/tasks",
      label: labels.reportTasksExcel,
      desc: locale === "en" ? "Corporate tasks Excel" : "مهام الشركات Excel",
      icon: FileSpreadsheetIcon,
      format: "excel",
      ready: true,
    },
    {
      href: "/api/reports/odoo-calendar",
      label: locale === "en" ? "Calendar report (PDF)" : "تقرير التقويم (PDF)",
      desc: locale === "en" ? "Operational window events" : "أحداث النافذة التشغيلية",
      icon: FileTextIcon,
      format: "pdf",
      ready: true,
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{labels.reportsTitle}</CardTitle>
          <CardDescription>{labels.reportsDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {reports.map((r) => {
            const Icon = r.icon;
            return (
              <a
                key={r.href}
                href={r.ready ? r.href : undefined}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-auto min-h-[4.5rem] flex-col items-start gap-1 whitespace-normal py-3 text-start",
                  !r.ready && "pointer-events-none opacity-50"
                )}
                download
              >
                <span className="flex w-full items-center gap-2 font-medium">
                  <Icon className="size-4 shrink-0 text-primary" />
                  {r.label}
                  <DownloadIcon className="text-muted-foreground ms-auto size-3.5" />
                </span>
                <span className="text-muted-foreground text-[11px] font-normal">{r.desc}</span>
              </a>
            );
          })}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">
        {locale === "en"
          ? "Reports use RTL-safe fonts for Arabic. Excel exports include frozen headers, filters, and conditional formatting."
          : "التقارير تستخدم خطوطاً متوافقة مع RTL. تصدير Excel يتضمن تجميد العناوين والتصفية والتنسيق الشرطي."}
      </p>
    </div>
  );
}
