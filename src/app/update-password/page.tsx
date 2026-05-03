import { updatePasswordAction } from "@/app/auth/actions";
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

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            تحديث كلمة المرور
          </CardTitle>
          <CardDescription>
            يجب تغيير كلمة المرور الافتراضية قبل المتابعة. لا يمكن تخطي هذه
            الخطوة.
          </CardDescription>
        </CardHeader>
        <form action={updatePasswordAction}>
          <CardContent className="space-y-4">
            {raw ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {raw === "short"
                  ? "كلمة المرور يجب ألا تقل عن 6 أحرف."
                  : raw === "mismatch"
                    ? "كلمتا المرور غير متطابقتين."
                    : decodeURIComponent(raw)}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور الجديدة</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full">
              حفظ ومتابعة
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
