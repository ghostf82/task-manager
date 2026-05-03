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
import type { TaskExportRow } from "@/lib/reports/task-export-data";

const toneBg: Record<TaskExportRow["tone"], string> = {
  overdue: "#fee2e2",
  due_soon: "#fef3c7",
  followed_today: "#d1fae5",
  completed: "#dcfce7",
  neutral: "#f9fafb",
};

let fontReady = false;

function ensureArabicFont() {
  if (fontReady) return;
  const url =
    "https://cdn.jsdelivr.net/gh/googlefonts/noto-naskh-arabic@main/fonts/ttf/unhinted/NotoNaskhArabic-Regular.ttf";
  Font.register({ family: "NotoNaskh", src: url });
  fontReady = true;
}

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontFamily: "NotoNaskh",
    fontSize: 9,
    direction: "rtl",
  },
  title: { fontSize: 14, marginBottom: 10, textAlign: "right" },
  block: {
    marginBottom: 6,
    padding: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    textAlign: "right",
  },
  line: { lineHeight: 1.35 },
});

function TasksPdfDoc({ rows }: { rows: TaskExportRow[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>تقرير مهام الشركات</Text>
        {rows.map((r, i) => (
          <View
            key={i}
            wrap={false}
            style={[styles.block, { backgroundColor: toneBg[r.tone] }]}
          >
            <Text style={styles.line}>
              {`#${r.display_number} — ${r.tenant_name} — ${r.title}`}
            </Text>
            <Text style={styles.line}>
              {`المسؤول: ${r.assignee} | من ${r.issued_on} إلى ${r.due_on} | متابعة: ${r.follow_up_on} | متابعة اليوم: ${r.followed_today}`}
            </Text>
            <Text style={styles.line}>
              {`الحالة: ${r.status_ar} | الإنجاز: ${r.completion_percent}% | أيام متبقية: ${r.days_remaining} | أشهر تقريبية: ${r.months_remaining}`}
            </Text>
            {r.notes ? (
              <Text style={styles.line}>{`ملاحظات: ${r.notes}`}</Text>
            ) : null}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function buildTasksPdfBuffer(rows: TaskExportRow[]): Promise<Buffer> {
  ensureArabicFont();
  return await renderToBuffer(<TasksPdfDoc rows={rows} />);
}
