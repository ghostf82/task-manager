import Link from "next/link";

import {
  deleteEmailCredentialsAction,
  deleteOdooCredentialsAction,
  saveEmailCredentialsAction,
  saveOdooCredentialsAction,
} from "@/app/dashboard/settings/integrations/actions";
import {
  EmailConnectionTestButton,
  OdooConnectionTestButton,
} from "@/app/dashboard/settings/integrations/integrations-connection-test";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const notices: Record<string, string> = {
  odoo: "تم حفظ بيانات Odoo بشكل آمن (كلمة المرور مشفرة في قاعدة البيانات).",
  odoo_clear: "تمت إزالة بيانات Odoo من الخزنة.",
  email: "تم حفظ إعدادات البريد بشكل آمن.",
  email_clear: "تمت إزالة إعدادات البريد من الخزنة.",
};

const errors: Record<string, string> = {
  odoo_fields: "أكمل عنوان Odoo واسم الدخول.",
  odoo_password: "كلمة مرور Odoo مطلوبة عند أول حفظ.",
  odoo_encrypt: "تعذّر التشفير: تحقق من متغير CREDENTIALS_ENCRYPTION_KEY على الخادم.",
  odoo_save: "تعذّر حفظ بيانات Odoo.",
  email_fields: "أكمل حقول خوادم البريد وأسماء المستخدمين.",
  email_imap_password: "كلمة مرور IMAP مطلوبة عند أول حفظ.",
  email_smtp_password: "كلمة مرور SMTP مطلوبة عند أول حفظ.",
  email_encrypt: "تعذّر التشفير: تحقق من CREDENTIALS_ENCRYPTION_KEY.",
  email_save: "تعذّر حفظ إعدادات البريد.",
  no_license_odoo: "لا تملك ترخيص أداة Odoo — راجع مسؤول النظام في «حوكمة أدوات الذكاء».",
  no_license_email:
    "لا تملك ترخيص أداة البريد — راجع مسؤول النظام في «حوكمة أدوات الذكاء».",
};

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const licensedSlugs = await getLicensedActiveToolSlugs(supabase, session.id);
  const showOdoo = licensedSlugs.includes("odoo");
  const showEmail = licensedSlugs.includes("email");

  const { data: odoo } = await supabase
    .from("user_odoo_credentials")
    .select("base_url, database_name, login_username, updated_at")
    .eq("user_id", session.id)
    .maybeSingle();

  const { data: email } = await supabase
    .from("user_email_credentials")
    .select(
      "imap_host, imap_port, imap_use_tls, imap_username, smtp_host, smtp_port, smtp_use_tls, smtp_username, updated_at"
    )
    .eq("user_id", session.id)
    .maybeSingle();

  const okMsg = sp.saved ? notices[sp.saved] : null;
  const errMsg = sp.err ? errors[sp.err] ?? "حدث خطأ غير متوقع." : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">الخزنة السرية للربط</h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm leading-relaxed">
            تُخزّن كلمات المرور مشفرة (AES-256-GCM) ولا تُعرض مرة أخرى. تظهر هنا فقط نماذج
            الأدوات المفعّلة لحسابك من قبل مسؤول النظام. يُفك التشفير على الخادم فقط عند
            تشغيل المساعد بعد موافقتك.
          </p>
        </div>
        <Link
          href="/dashboard/ai-agent"
          className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
        >
          مساحة المساعد الذكي
        </Link>
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

      {!showOdoo && !showEmail ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-900 dark:text-amber-100">
          لا توجد أدوات ربط مفعّلة لحسابك حالياً. اطلب من مسؤول النظام تفعيل Odoo أو البريد
          من صفحة «حوكمة أدوات الذكاء».
        </p>
      ) : null}

      {showOdoo ? (
      <Card className="border-violet-500/20 shadow-sm ring-1 ring-violet-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-flex size-2 rounded-full bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.8)]" />
            Odoo
          </CardTitle>
          <CardDescription>
            عنوان الخادم، قاعدة البيانات (اختياري)، اسم الدخول وكلمة المرور — تُحفظ
            المشفّرة فقط.
            {odoo ? (
              <span className="mt-1 block text-xs text-muted-foreground">
                آخر تحديث: {new Date(odoo.updated_at).toLocaleString("ar-SA")}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form id="integrations-odoo-form" action={saveOdooCredentialsAction} className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="base_url">رابط Odoo (Base URL)</Label>
                <Input
                  id="base_url"
                  name="base_url"
                  required
                  dir="ltr"
                  className="font-mono text-sm"
                  placeholder="https://odoo.example.com"
                  defaultValue={odoo?.base_url ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="database_name">اسم قاعدة البيانات</Label>
                <Input
                  id="database_name"
                  name="database_name"
                  dir="ltr"
                  className="font-mono text-sm"
                  placeholder="production"
                  defaultValue={odoo?.database_name ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="login_username">اسم المستخدم</Label>
                <Input
                  id="login_username"
                  name="login_username"
                  required
                  dir="ltr"
                  className="font-mono text-sm"
                  defaultValue={odoo?.login_username ?? ""}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  dir="ltr"
                  className="font-mono text-sm"
                  placeholder={odoo ? "اتركها فارغة للإبقاء على المحفوظة" : "مطلوبة"}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">حفظ Odoo</Button>
              <OdooConnectionTestButton formId="integrations-odoo-form" />
            </div>
          </form>
          {odoo ? (
            <form action={deleteOdooCredentialsAction}>
              <Button type="submit" variant="ghost" className="text-destructive">
                حذف بيانات Odoo من الخزنة
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {showEmail ? (
      <Card className="border-sky-500/20 shadow-sm ring-1 ring-sky-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-flex size-2 rounded-full bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.8)]" />
            البريد IMAP / SMTP
          </CardTitle>
          <CardDescription>
            خوادم الاستلام والإرسال مع التشفير TLS الافتراضي. اترك حقول كلمة المرور
            فارغة عند التحديث للإبقاء على القيم المشفرة الحالية.
            {email ? (
              <span className="mt-1 block text-xs text-muted-foreground">
                آخر تحديث: {new Date(email.updated_at).toLocaleString("ar-SA")}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form id="integrations-email-form" action={saveEmailCredentialsAction} className="grid gap-6">
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">IMAP</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="imap_host">خادم IMAP</Label>
                  <Input
                    id="imap_host"
                    name="imap_host"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={email?.imap_host ?? ""}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="imap_port">المنفذ</Label>
                  <Input
                    id="imap_port"
                    name="imap_port"
                    type="number"
                    dir="ltr"
                    defaultValue={email?.imap_port ?? 993}
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input
                    id="imap_use_tls"
                    name="imap_use_tls"
                    type="checkbox"
                    defaultChecked={email?.imap_use_tls ?? true}
                    className="size-4 rounded border"
                  />
                  <Label htmlFor="imap_use_tls" className="font-normal">
                    TLS / SSL
                  </Label>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="imap_username">مستخدم IMAP</Label>
                  <Input
                    id="imap_username"
                    name="imap_username"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={email?.imap_username ?? ""}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="imap_password">كلمة مرور IMAP</Label>
                  <Input
                    id="imap_password"
                    name="imap_password"
                    type="password"
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder={email ? "فارغ = الإبقاء على المحفوظ" : "مطلوبة"}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">SMTP</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="smtp_host">خادم SMTP</Label>
                  <Input
                    id="smtp_host"
                    name="smtp_host"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={email?.smtp_host ?? ""}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="smtp_port">المنفذ</Label>
                  <Input
                    id="smtp_port"
                    name="smtp_port"
                    type="number"
                    dir="ltr"
                    defaultValue={email?.smtp_port ?? 465}
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input
                    id="smtp_use_tls"
                    name="smtp_use_tls"
                    type="checkbox"
                    defaultChecked={email?.smtp_use_tls ?? true}
                    className="size-4 rounded border"
                  />
                  <Label htmlFor="smtp_use_tls" className="font-normal">
                    TLS / SSL
                  </Label>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="smtp_username">مستخدم SMTP</Label>
                  <Input
                    id="smtp_username"
                    name="smtp_username"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={email?.smtp_username ?? ""}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="smtp_password">كلمة مرور SMTP</Label>
                  <Input
                    id="smtp_password"
                    name="smtp_password"
                    type="password"
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder={email ? "فارغ = الإبقاء على المحفوظ" : "مطلوبة"}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="w-fit">
                حفظ البريد
              </Button>
              <EmailConnectionTestButton formId="integrations-email-form" />
            </div>
          </form>
          {email ? (
            <form action={deleteEmailCredentialsAction}>
              <Button type="submit" variant="ghost" className="text-destructive">
                حذف إعدادات البريد من الخزنة
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      <p className="text-muted-foreground text-center text-[11px] leading-relaxed">
        CREDENTIALS_ENCRYPTION_KEY يجب أن يبقى سراً على بيئة التشغيل (مثلاً Vercel
        Environment Variables) ولا يُرفع إلى المستودع.
      </p>
    </div>
  );
}
