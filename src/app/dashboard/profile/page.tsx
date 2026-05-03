import Link from "next/link";

import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import { AvatarField } from "@/app/dashboard/profile/avatar-field";
import { updateProfileAction } from "@/app/dashboard/profile/actions";
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

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, phone, national_id, avatar_url")
    .eq("id", session.id)
    .single();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">الملف الشخصي</h1>
        {sp.saved ? (
          <p className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            تم حفظ التغييرات بنجاح.
          </p>
        ) : null}
        <p className="text-muted-foreground mt-1 text-sm">
          تحديث الاسم وبيانات الاتصال. لتغيير كلمة المرور استخدم تدفق «تحديث
          كلمة المرور» عند تسجيل الدخول إن طُلب منك ذلك.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>الصورة الشخصية</CardTitle>
          <CardDescription>JPEG / PNG / WebP — حتى 2 ميجابايت</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarField userId={session.id} currentUrl={profile?.avatar_url ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المساعد والربط الخارجي</CardTitle>
          <CardDescription>بيانات الدخول تُشفّر على الخادم قبل التخزين.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/ai-agent"
            className={cn(buttonVariants({ variant: "outline" }), "justify-center")}
          >
            مساحة المساعد الذكي
          </Link>
          <Link
            href="/dashboard/settings/integrations"
            className={cn(buttonVariants({ variant: "outline" }), "justify-center")}
          >
            الخزنة السرية (Odoo / البريد)
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>البيانات الأساسية</CardTitle>
          <CardDescription>البريد للعرض فقط</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProfileAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">البريد</Label>
              <Input
                id="email"
                name="email_display"
                value={profile?.email ?? ""}
                readOnly
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="full_name">الاسم الكامل</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile?.full_name ?? ""}
                placeholder="الاسم كما يظهر في النظام"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">الجوال</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={profile?.phone ?? ""}
                placeholder="05xxxxxxxx"
              />
            </div>
            <div className="grid gap-2">
              <Label>رقم الهوية</Label>
              <Input
                value={profile?.national_id ?? ""}
                readOnly
                disabled
                className="bg-muted text-muted-foreground"
              />
              <p className="text-muted-foreground text-[11px]">
                لتعديل رقم الهوية يُرجى التواصل مع مسؤول النظام.
              </p>
            </div>
            <Button type="submit" className="w-full sm:w-auto">
              حفظ التغييرات
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
