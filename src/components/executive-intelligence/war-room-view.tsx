import Link from "next/link";
import { ArrowLeftIcon, Building2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExecutiveLabels } from "@/lib/executive-intelligence/briefing-labels";
import { resolveBriefText, warRoomLabel, myDayAction, myDayWhy } from "@/lib/executive-intelligence/briefing-labels";
import type { ComplianceIntelItem, MyDayItem, WarRoomSnapshot } from "@/lib/executive-intelligence/types";

export function WarRoomListView({
  rooms,
  labels,
  tr,
}: {
  rooms: WarRoomSnapshot[];
  labels: ExecutiveLabels;
  tr: (key: string) => string;
}) {
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 pb-12">
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}>
        <ArrowLeftIcon className="size-4" />
        {labels.backBriefing}
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-bold">{labels.warRoomTitle}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{labels.warRoomDesc}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {rooms.map((room) => (
          <Link key={room.tenantId} href={`/dashboard/war-room/${room.slug}`}>
            <Card className="h-full transition hover:border-primary/30 hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2Icon className="size-4" />
                  {warRoomLabel(tr, room)}
                </CardTitle>
                <CardDescription>{room.name}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{room.health}</Badge>
                <span>{room.openTasks} tasks</span>
                <span>{room.complianceRisks} compliance</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function WarRoomDetailView({
  snapshot,
  compliance,
  myDay,
  labels,
  tr,
}: {
  snapshot: WarRoomSnapshot;
  compliance: ComplianceIntelItem[];
  myDay: MyDayItem[];
  labels: ExecutiveLabels;
  tr: (key: string) => string;
}) {
  return (
    <div className="mx-auto max-w-[1000px] space-y-6 pb-12">
      <Link href="/dashboard/war-room" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}>
        <ArrowLeftIcon className="size-4" />
        {labels.viewAllWarRooms}
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-bold">{warRoomLabel(tr, snapshot)}</h1>
        <p className="text-muted-foreground text-sm">{snapshot.name}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Open tasks" value={snapshot.openTasks} />
        <Stat label="Overdue" value={snapshot.overdueTasks} />
        <Stat label="Compliance" value={snapshot.complianceRisks} />
        <Stat label="Urgent docs" value={snapshot.urgentDocs} />
      </div>
      {snapshot.interventionKey ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm font-medium">
            {resolveBriefText(tr, snapshot.interventionKey!.replace("executive.", ""), snapshot.interventionParams)}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labels.complianceTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {compliance.length ? (
            compliance.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground text-xs">
                  {resolveBriefText(tr, c.impactKey.replace("executive.", ""), c.impactParams)}
                </p>
                <p className="mt-1 text-xs font-medium">
                  {resolveBriefText(tr, c.actionKey.replace("executive.", ""), c.actionParams)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">{labels.noItems}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labels.myDayTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {myDay.length ? (
            myDay.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{item.title}</p>
                <p className="text-muted-foreground text-xs">{myDayWhy(tr, item)}</p>
                <p className="mt-1 text-xs">{myDayAction(tr, item)}</p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">{labels.noItems}</p>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Link href="/dashboard/tasks" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Tasks
        </Link>
        <Link href="/dashboard/documents" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Documents
        </Link>
        <Link href="/dashboard/odoo" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Odoo
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4 text-center">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
