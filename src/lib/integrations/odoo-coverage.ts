import "server-only";

import type { OdooCredentialBundle } from "@/lib/integrations/odoo-client";
import { countOdooRecordsViaWebLogin } from "@/lib/integrations/odoo-client";
import {
  calendarOverlapDomain,
  futureArchiveStartFrom,
  operationalCalendarWindow,
} from "@/lib/integrations/odoo-calendar-windows";

export type OdooEntityCoverage = {
  fetched: number;
  total: number;
  /** Calendar only — events in the operational window. */
  totalWindow?: number;
  /** Calendar only — events beyond near-future window (archive). */
  futureArchiveTotal?: number;
};

export type OdooDataCoverageReport = {
  generatedAt: string;
  tasks: OdooEntityCoverage;
  projects: OdooEntityCoverage;
  calendar: OdooEntityCoverage & { window: { startFrom: string; startBefore: string } };
  documents: OdooEntityCoverage & { foldersFetched: number };
  folders: { fetched: number; total: number };
};

export type WorkspaceCoverageSnapshot = {
  tasks?: unknown[];
  projects?: unknown[];
  events?: unknown[];
  documents?: unknown[];
  folders?: unknown[];
};

export async function buildOdooDataCoverageReport(
  bundle: OdooCredentialBundle,
  snapshot: WorkspaceCoverageSnapshot
): Promise<OdooDataCoverageReport> {
  const win = operationalCalendarWindow();
  const archiveFrom = futureArchiveStartFrom();

  const taskDomain: unknown[] = [["active", "=", true]];
  const projectDomain: unknown[] = [["active", "=", true]];
  const docDomain: unknown[] = [];
  const folderDomain: unknown[] = [];
  const calWindowDomain = calendarOverlapDomain(win.startFrom, win.startBefore);
  const calArchiveDomain: unknown[] = [["start", ">=", archiveFrom]];

  const [
    taskTotal,
    projectTotal,
    docTotal,
    folderTotal,
    calWindowTotal,
    calArchiveTotal,
  ] = await Promise.all([
    countOdooRecordsViaWebLogin(bundle, "project.task", taskDomain),
    countOdooRecordsViaWebLogin(bundle, "project.project", projectDomain),
    countOdooRecordsViaWebLogin(bundle, "documents.document", docDomain).catch(() =>
      countOdooRecordsViaWebLogin(bundle, "ir.attachment", docDomain)
    ),
    countOdooRecordsViaWebLogin(bundle, "documents.folder", folderDomain).catch(() => 0),
    countOdooRecordsViaWebLogin(bundle, "calendar.event", calWindowDomain),
    countOdooRecordsViaWebLogin(bundle, "calendar.event", calArchiveDomain),
  ]);

  const tasksFetched = Array.isArray(snapshot.tasks) ? snapshot.tasks.length : 0;
  const projectsFetched = Array.isArray(snapshot.projects) ? snapshot.projects.length : 0;
  const eventsFetched = Array.isArray(snapshot.events) ? snapshot.events.length : 0;
  const documentsFetched = Array.isArray(snapshot.documents) ? snapshot.documents.length : 0;
  const foldersFetched = Array.isArray(snapshot.folders) ? snapshot.folders.length : 0;

  return {
    generatedAt: new Date().toISOString(),
    tasks: { fetched: tasksFetched, total: taskTotal },
    projects: { fetched: projectsFetched, total: projectTotal },
    calendar: {
      fetched: eventsFetched,
      total: calWindowTotal + calArchiveTotal,
      totalWindow: calWindowTotal,
      futureArchiveTotal: calArchiveTotal,
      window: { startFrom: win.startFrom, startBefore: win.startBefore },
    },
    documents: {
      fetched: documentsFetched,
      total: docTotal,
      foldersFetched,
    },
    folders: { fetched: foldersFetched, total: folderTotal },
  };
}
