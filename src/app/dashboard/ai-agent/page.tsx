import Link from "next/link";

import { analyzePasteAction } from "@/app/dashboard/ai-agent/actions";
import { InboundScanCard } from "@/app/dashboard/ai-agent/inbound-scan-card";
import {
  PendingProposalsPanel,
  type PendingProposalRow,
} from "@/app/dashboard/ai-agent/pending-proposals-panel";
import { getAiToolBySlug } from "@/lib/ai-tools/registry";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const okMsgs: Record<string, string> = {
  analysis: "تم إنشاء مقترح جديد في صندوق «في الانتظار».",
  executed: "تمت معالجة موافقتك وتنفيذ الإجراء (أو تسجيل الوضعية) بنجاح.",
  rejected: "تم رفض المقترح وتسجيل ذلك في السجل.",
};

const errMsgs: Record<string, string> = {
  text: "الصق نصاً للتحليل أولاً.",
  llm: "تعذّر الاتصال بالنموذج أو parsing الاستجابة. تحقق من OPENAI_API_KEY.",
  insert: "تعذّر حفظ المقترح في قاعدة البيانات.",
  proposal: "مقترح غير صالح.",
  not_pending: "هذا المقترح لم يعد قيد الانتظار.",
};

export default async function AiAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const licensedSlugs = await getLicensedActiveToolSlugs(supabase, session.id);
  const licensedToolLabels = licensedSlugs
    .map((s) => getAiToolBySlug(s)?.displayNameAr)
    .filter(Boolean)
    .join("، ");

  const { data: odoo } = await supabase
    .from("user_odoo_credentials")
    .select("user_id")
    .eq("user_id", session.id)
    .maybeSingle();

  const { data: emailCreds } = await supabase
    .from("user_email_credentials")
    .select("user_id")
    .eq("user_id", session.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(name)")
    .eq("user_id", session.id)
    .eq("status", "active");

  const tenantOptions =
    memberships?.flatMap((m) => {
      const t = m.tenants;
      if (t && typeof t === "object" && !Array.isArray(t) && "name" in t) {
        return [{ id: m.tenant_id as string, name: String((t as { name: string }).name) }];
      }
      if (Array.isArray(t) && t[0] && typeof t[0] === "object" && "name" in t[0]) {
        return [{ id: m.tenant_id as string, name: String((t[0] as { name: string }).name) }];
      }
      return [];
    }) ?? [];

  const { data: pending } = await supabase
    .from("ai_agent_proposals")
    .select("id,kind,title,summary,detail_json,proposed_action,created_at")
    .eq("user_id", session.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: activity } = await supabase
    .from("ai_agent_activity_log")
    .select("id,event_type,message,proposal_id,created_at,meta")
    .eq("user_id", session.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const okMsg = sp.ok ? okMsgs[sp.ok] : null;
  const errMsg = sp.err ? errMsgs[sp.err] ?? "حدث خطأ." : null;

  const vaultReadyOdoo = Boolean(odoo);
  const vaultReadyEmail = Boolean(emailCreds);
  const canRunInboundScan = licensedSlugs.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-background to-cyan-500/5 p-6 shadow-sm md:p-8">
        <div className="pointer-events-none absolute -end-20 -top-20 size-64 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
              المرحلة الخامسة
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              مساعد ذكي ومركز أتمتة
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
              يقرأ ويحلّل ويُجهّز الإجراءات؛ لا يُنفّذ شيء نهائياً إلا بعد موافقتك
              الصريحة. الأسرار تُفكّ تشفيرها على الخادم فقط عند الحاجة للاتصال بـ Odoo
              أو البريد.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Link
              href="/dashboard/settings/integrations"
              className={cn(buttonVariants({ variant: "secondary" }), "shadow-sm")}
            >
              الخزنة السرية للربط
            </Link>
            {!licensedSlugs.length ? (
              <p className="max-w-xs text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                لا توجد أدوات ذكاء مفعّلة لحسابك — راجع مسؤول النظام في «حوكمة أدوات الذكاء».
              </p>
            ) : !vaultReadyOdoo && !vaultReadyEmail ? (
              <p className="max-w-xs text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                الأدوات المصرّح بها: {licensedToolLabels}. أضف بيانات الخزنة من «ربط الأنظمة»
                لتفعيل المسح والتنفيذ.
              </p>
            ) : (
              <p className="text-muted-foreground max-w-xs text-[11px] leading-relaxed">
                يمكنك تشغيل «مسح المصادر» للأدوات المفعّلة ({licensedToolLabels}) بعد ضبط الخزنة
                (يتطلب OPENAI_API_KEY للمقترحات). التنفيذ بعد موافقتك من الخادم فقط.
              </p>
            )}
          </div>
        </div>
      </div>

      {okMsg ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {okMsg}
        </p>
      ) : null}
      {errMsg ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errMsg}
        </p>
      ) : null}

      <InboundScanCard
        canScan={canRunInboundScan}
        licensedToolLabels={licensedToolLabels}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PendingProposalsPanel proposals={(pending ?? []) as PendingProposalRow[]} />

        <Card className="border-border/80 shadow-md ring-1 ring-cyan-500/10">
          <CardHeader>
            <CardTitle>تحليل نص وتوليد مقترح</CardTitle>
            <CardDescription>
              الصق محتوى رسالة، ملاحظة اجتماع، أو أي نص — يُحلّل على الخادم (OpenAI إن وُجد
              المفتاح، وإلا وضعية محلية).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={analyzePasteAction} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tenant_id">الشركة (لاقتراحات المهام)</Label>
                <select
                  id="tenant_id"
                  name="tenant_id"
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs"
                  defaultValue=""
                >
                  <option value="">— بدون سياق شركة محدد —</option>
                  {tenantOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="text">النص</Label>
                <Textarea
                  id="text"
                  name="text"
                  required
                  rows={8}
                  placeholder="مثال: راسلني العميل يطلب مهمة متابعة حتى 2026-05-10 بعنوان مراجعة العقد…"
                  className="min-h-[140px] resize-y text-sm leading-relaxed"
                />
              </div>
              <Button type="submit" className="w-fit">
                تحليل وتوليد مقترح
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>سجل العمليات</CardTitle>
          <CardDescription>كل الأحداث المرتبطة بالمساعد والخزنة لهذا الحساب.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-start text-muted-foreground">
                <th className="py-2 pe-4 font-medium">الوقت</th>
                <th className="py-2 pe-4 font-medium">النوع</th>
                <th className="py-2 pe-4 font-medium">الرسالة</th>
              </tr>
            </thead>
            <tbody>
              {!activity?.length ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground py-6 text-center">
                    لا سجلات بعد.
                  </td>
                </tr>
              ) : (
                activity.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 align-top">
                    <td className="py-2 pe-4 whitespace-nowrap text-[12px] text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("ar-SA")}
                    </td>
                    <td className="py-2 pe-4 font-mono text-[11px] [direction:ltr]">
                      {row.event_type}
                    </td>
                    <td className="py-2 text-[13px] leading-relaxed">{row.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
