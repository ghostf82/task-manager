import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-lg text-center space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          منصة المهام والإنتاجية
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          واجهة عامة مؤقتة. عند تسجيل الدخول يوجّهك النظام تلقائياً إلى لوحة
          التحكم أو إلى تحديث كلمة المرور عند الحاجة.
        </p>
      </div>
      <Link
        href="/login"
        className={cn(buttonVariants({ variant: "default", size: "lg" }))}
      >
        الذهاب لتسجيل الدخول
      </Link>
    </div>
  );
}
