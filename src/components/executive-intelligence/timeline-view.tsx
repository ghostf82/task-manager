import Link from "next/link";
import { ArrowLeftIcon, CalendarIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExecutiveLabels } from "@/lib/executive-intelligence/briefing-labels";
import type { TimelineEntry } from "@/lib/executive-intelligence/types";

export function ExecutiveTimelineView({
  entries,
  labels,
}: {
  entries: TimelineEntry[];
  labels: ExecutiveLabels;
}) {
  return (
    <div className="mx-auto max-w-[900px] space-y-6 pb-12">
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}>
        <ArrowLeftIcon className="size-4" />
        {labels.backBriefing}
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-bold">{labels.timelineTitle}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{labels.timelineDesc}</p>
      </div>
      <div className="relative space-y-0 border-s border-border/60 ps-6">
        {entries.map((e) => (
          <div key={e.id} className="relative pb-6">
            <span className="absolute -start-[25px] top-1 flex size-4 items-center justify-center rounded-full bg-primary/15">
              <CalendarIcon className="size-2.5 text-primary" />
            </span>
            <Card>
              <CardContent className="py-3">
                <p className="text-muted-foreground text-[11px]">{e.dateLabel}</p>
                <p className="font-medium">{e.title}</p>
                {e.tenantName ? <p className="text-muted-foreground text-xs">{e.tenantName}</p> : null}
                <p className="text-muted-foreground mt-1 text-[10px] uppercase">{e.kind}</p>
              </CardContent>
            </Card>
          </div>
        ))}
        {!entries.length ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{labels.noItems}</p>
        ) : null}
      </div>
    </div>
  );
}
