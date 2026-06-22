import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExecutiveLabels } from "@/lib/executive-intelligence/briefing-labels";
import { myDayAction, myDayConsequence, myDayWhy } from "@/lib/executive-intelligence/briefing-labels";
import type { MyDayItem } from "@/lib/executive-intelligence/types";

export function MyDayView({
  items,
  labels,
  tr,
}: {
  items: MyDayItem[];
  labels: ExecutiveLabels;
  tr: (key: string) => string;
}) {
  return (
    <div className="mx-auto max-w-[900px] space-y-6 pb-12">
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}>
        <ArrowLeftIcon className="size-4" />
        {labels.backBriefing}
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-bold">{labels.myDayTitle}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{labels.myDayDesc}</p>
      </div>
      {!items.length ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">{labels.noItems}</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <Card key={item.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">#{idx + 1}</p>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    {item.tenantName ? (
                      <p className="text-muted-foreground mt-1 text-xs">{item.tenantName}</p>
                    ) : null}
                  </div>
                  <Badge variant="outline">{item.severity}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground text-[11px] font-medium uppercase">{labels.whyLabel}</p>
                  <p className="mt-1">{myDayWhy(tr, item)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] font-medium uppercase">{labels.consequenceLabel}</p>
                  <p className="mt-1">{myDayConsequence(tr, item)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] font-medium uppercase">{labels.actionLabel}</p>
                  <p className="mt-1 font-medium">{myDayAction(tr, item)}</p>
                  {item.owner ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {labels.ownerLabel}: {item.owner}
                    </p>
                  ) : null}
                  {item.href ? (
                    <Link href={item.href} className="text-primary mt-2 inline-block text-xs underline">
                      →
                    </Link>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
