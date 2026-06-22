import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";

import { OdooTasksPanelWithCache } from "@/app/dashboard/ai-agent/odoo-tasks-panel-server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTranslator } from "@/lib/i18n/get-translator";
import { cn } from "@/lib/utils";

export const maxDuration = 120;

const VALID_ZONES = new Set(["tasks", "projects", "calendar", "documents"]);

export default async function OdooWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string }>;
}) {
  const sp = await searchParams;
  const { t } = await getTranslator();
  const zone = sp.zone && VALID_ZONES.has(sp.zone) ? (sp.zone as "tasks" | "projects" | "calendar" | "documents") : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/odoo"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 gap-1")}
          >
            <ArrowLeftIcon className="size-4" />
            {t("commandCenter.odoo.backToBrief")}
          </Link>
          <h1 className="font-heading text-xl font-semibold">{t("commandCenter.odoo.workspaceTitle")}</h1>
          <p className="text-muted-foreground text-sm">{t("commandCenter.odoo.workspaceDesc")}</p>
        </div>
      </div>

      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </CardContent>
          </Card>
        }
      >
        <OdooTasksPanelWithCache onlySection={zone} />
      </Suspense>
    </div>
  );
}
