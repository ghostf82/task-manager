import {
  ActionPulseStrip,
  ExecutiveBriefHero,
  ExecutiveBriefShellDisconnected,
} from "@/components/command-center/odoo-executive-brief";
import {
  AttentionQueuePanel,
  OperationalInsightsPanel,
  WorkloadPanel,
} from "@/components/command-center/odoo-intelligence-panels";
import { OdooWorkCenters } from "@/components/command-center/odoo-work-centers";
import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import type { OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";

export function OdooCommandCenterView({
  brief,
  labels,
  locale,
}: {
  brief: OdooOperationalBrief;
  labels: OdooBriefLabels;
  locale: string;
}) {
  if (!brief.connected) {
    return <ExecutiveBriefShellDisconnected labels={labels} />;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 pb-12">
      <ExecutiveBriefHero brief={brief} labels={labels} locale={locale} />

      <ActionPulseStrip labels={labels} counts={brief.counts} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <OperationalInsightsPanel insights={brief.insights} labels={labels} />
          <OdooWorkCenters brief={brief} labels={labels} />
        </div>
        <aside className="space-y-6">
          <AttentionQueuePanel items={brief.attentionQueue} labels={labels} />
          <WorkloadPanel workload={brief.workload} labels={labels} />
        </aside>
      </div>
    </div>
  );
}
