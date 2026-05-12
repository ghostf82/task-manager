import Link from "next/link";

import { AvatarField } from "@/app/dashboard/profile/avatar-field";
import { updateProfileAction } from "@/app/dashboard/profile/actions";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
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

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;
  const { t } = await getTranslator();
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
        <h1 className="text-2xl font-semibold tracking-tight">{t("profilePage.title")}</h1>
        {sp.saved ? (
          <p className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            {t("profilePage.saved")}
          </p>
        ) : null}
        <p className="text-muted-foreground mt-1 text-sm">{t("profilePage.intro")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("profilePage.cardAvatarTitle")}</CardTitle>
          <CardDescription>{t("profilePage.cardAvatarDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarField userId={session.id} currentUrl={profile?.avatar_url ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("profilePage.cardIntegrationsTitle")}</CardTitle>
          <CardDescription>{t("profilePage.cardIntegrationsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Link
            prefetch={false}
            href="/dashboard/ai-agent"
            className={cn(buttonVariants({ variant: "outline" }), "justify-center")}
          >
            {t("profilePage.linkAi")}
          </Link>
          <Link
            prefetch={false}
            href="/dashboard/settings/integrations"
            className={cn(buttonVariants({ variant: "outline" }), "justify-center")}
          >
            {t("profilePage.linkVault")}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("profilePage.cardBasicsTitle")}</CardTitle>
          <CardDescription>{t("profilePage.cardBasicsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProfileAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">{t("profilePage.labelEmail")}</Label>
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
              <Label htmlFor="full_name">{t("profilePage.labelFullName")}</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile?.full_name ?? ""}
                placeholder={t("profilePage.namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">{t("profilePage.labelPhone")}</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={profile?.phone ?? ""}
                placeholder={t("profilePage.phonePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("profilePage.labelNationalId")}</Label>
              <Input
                value={profile?.national_id ?? ""}
                readOnly
                disabled
                className="bg-muted text-muted-foreground"
              />
              <p className="text-muted-foreground text-[11px]">{t("profilePage.nationalIdHint")}</p>
            </div>
            <Button type="submit" className="w-full sm:w-auto">
              {t("profilePage.save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
