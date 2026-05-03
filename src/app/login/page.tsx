import Link from "next/link";

import { loginAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTranslator } from "@/lib/i18n/get-translator";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const { t } = await getTranslator();

  const errors: Record<string, string> = {
    missing: t("auth.errorMissing"),
    invalid: t("auth.errorInvalid"),
    session: t("auth.errorSession"),
  };

  const msg = sp.error ? errors[sp.error] ?? sp.error : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {t("auth.loginTitle")}
          </CardTitle>
          <CardDescription>{t("auth.loginDescription")}</CardDescription>
        </CardHeader>
        <form action={loginAction}>
          <CardContent className="space-y-4">
            {msg ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {msg}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full">
              {t("auth.submit")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t("auth.footerNote")}{" "}
              <Link href="/" className="underline underline-offset-4">
                {t("auth.backHome")}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
