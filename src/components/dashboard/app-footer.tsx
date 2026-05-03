import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function AppFooter({
  displayName,
  email,
  jobTitle,
  tenantLabel,
  avatarUrl,
}: {
  displayName: string | null;
  email: string | null;
  jobTitle: string | null;
  tenantLabel: string | null;
  avatarUrl?: string | null;
}) {
  const position =
    [jobTitle, tenantLabel].filter(Boolean).join(" — ") || "—";

  return (
    <footer className="border-t border-border bg-muted/25 px-4 py-3">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground ring-1 ring-border">
              {(displayName ?? email ?? "?").charAt(0)}
            </div>
          )}
          <div className="min-w-0 space-y-0.5 text-sm">
          <p className="truncate font-medium">
            {displayName ?? email ?? "مستخدم"}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            <span className="font-medium text-foreground/80">المنصب:</span>{" "}
            {position}
          </p>
          </div>
        </div>
        <Separator className="sm:hidden" />
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard/profile"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            الملف الشخصي
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" size="sm">
              تسجيل الخروج
            </Button>
          </form>
        </div>
      </div>
    </footer>
  );
}
