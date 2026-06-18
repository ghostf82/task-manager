import { OdooUserLinkClient } from "@/app/dashboard/settings/integrations/odoo-user-link-client";
import type { CompanyOdooSettings } from "@/lib/integrations/company-odoo-settings";
import type { OdooLinkRecord } from "@/lib/integrations/odoo-link-state";

export function OdooUserLinkCard({
  company,
  odoo,
  lastSyncAt,
  dateLocale,
  errorCode,
  errorMessage,
  justLinked,
  t,
}: {
  company: CompanyOdooSettings;
  odoo: OdooLinkRecord | null;
  lastSyncAt: string | null;
  dateLocale: string;
  errorCode: string | null;
  errorMessage: string | null;
  justLinked: boolean;
  t: (key: string) => string;
}) {
  return (
    <OdooUserLinkClient
      companyBaseUrl={company.baseUrl}
      link={odoo}
      lastSyncAt={lastSyncAt}
      dateLocale={dateLocale}
      errorCode={errorCode}
      errorMessage={errorMessage}
      justLinked={justLinked}
      t={t}
    />
  );
}
