import React from "react";
import {
  Document,
  Font,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";

let fontReady = false;

function ensureArabicFont() {
  if (fontReady) return;
  Font.register({
    family: "NotoNaskh",
    src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-naskh-arabic@main/fonts/ttf/unhinted/NotoNaskhArabic-Regular.ttf",
  });
  fontReady = true;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "NotoNaskh", fontSize: 10, direction: "rtl" },
  title: { fontSize: 18, marginBottom: 4, textAlign: "right", color: "#1e3a5f" },
  subtitle: { fontSize: 11, marginBottom: 16, textAlign: "right", color: "#64748b" },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, marginBottom: 6, color: "#0f172a", textAlign: "right" },
  kpiRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 10 },
  kpi: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  kpiLabel: { fontSize: 8, color: "#64748b", textAlign: "right" },
  kpiValue: { fontSize: 16, fontWeight: "bold", textAlign: "right", marginTop: 2 },
  item: {
    padding: 8,
    marginBottom: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    textAlign: "right",
  },
  itemCritical: { backgroundColor: "#fee2e2" },
  itemHigh: { backgroundColor: "#fef3c7" },
  footer: { position: "absolute", bottom: 20, left: 28, right: 28, fontSize: 8, color: "#94a3b8", textAlign: "center" },
});

function BriefPdf({
  brief,
  generatedAt,
  title,
}: {
  brief: OdooOperationalBrief;
  generatedAt: string;
  title: string;
}) {
  const c = brief.counts;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {generatedAt} · {brief.loginUsername ?? "—"}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ملخص تنفيذي</Text>
          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>يتطلب اهتماماً اليوم</Text>
              <Text style={styles.kpiValue}>{brief.attentionToday}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>حرج</Text>
              <Text style={styles.kpiValue}>{brief.attentionCritical}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>متأخر</Text>
              <Text style={styles.kpiValue}>{c.overdueTasks}</Text>
            </View>
          </View>
          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>امتثال معرّض</Text>
              <Text style={styles.kpiValue}>{c.complianceWarning + c.complianceOverdue}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>خلال 7 أيام</Text>
              <Text style={styles.kpiValue}>{c.due7Days}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>غير مسند</Text>
              <Text style={styles.kpiValue}>{c.unassignedTasks}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>قائمة الأولويات</Text>
          {brief.attentionQueue.slice(0, 10).map((item) => (
            <View
              key={item.id}
              style={[
                styles.item,
                item.severity === "critical" ? styles.itemCritical : item.severity === "high" ? styles.itemHigh : {},
              ]}
            >
              <Text>{item.title}</Text>
              {item.subtitle ? <Text style={{ fontSize: 8, color: "#64748b" }}>{item.subtitle}</Text> : null}
              {item.dueLabel ? <Text style={{ fontSize: 8 }}>{item.dueLabel}</Text> : null}
            </View>
          ))}
        </View>

        <Text style={styles.footer}>Operational Command Center — generated report</Text>
      </Page>
    </Document>
  );
}

export async function buildOdooOperationalPdfBuffer(
  brief: OdooOperationalBrief,
  opts?: { title?: string; generatedAt?: string }
): Promise<Buffer> {
  ensureArabicFont();
  const generatedAt =
    opts?.generatedAt ??
    new Date().toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  return await renderToBuffer(
    <BriefPdf brief={brief} generatedAt={generatedAt} title={opts?.title ?? "تقرير العمليات التنفيذي"} />
  );
}
