import { buildOdooRelationshipIndex } from "@/lib/command-center/odoo-relationship-index";
import type {
  OdooDocumentRiskStatus,
  OdooFolderWorkspaceContext,
  OdooLinkedEntityRef,
  OdooRelationshipCount,
  OdooRelationshipDocumentInput,
  OdooRelationshipEventInput,
  OdooRelationshipFolderInput,
  OdooRelationshipIndex,
  OdooRelationshipProjectInput,
  OdooRelationshipTaskInput,
} from "@/lib/command-center/odoo-relationship-types";
import { relationshipCount } from "@/lib/command-center/odoo-relationship-types";

const EXPIRING_SOON_DAYS = 30;

function mimeCategory(mime: string): string {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv")) return "sheet";
  if (mime.includes("word") || mime.includes("document") || mime.includes("text")) return "doc";
  return "other";
}

function parseDateMs(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const ms = Date.parse(String(raw).replace(" ", "T"));
  return Number.isFinite(ms) ? ms : null;
}

export function inferDocumentRiskStatus(doc: OdooRelationshipDocumentInput): {
  status: OdooDocumentRiskStatus;
  reasonAr: string;
  reasonEn: string;
} {
  const expRaw = doc.expirationDate?.trim();
  if (expRaw) {
    const expMs = parseDateMs(expRaw);
    if (expMs != null) {
      const days = Math.floor((expMs - Date.now()) / 86_400_000);
      if (days < 0) {
        return { status: "expired", reasonAr: `منتهٍ منذ ${Math.abs(days)} يوم`, reasonEn: `Expired ${Math.abs(days)}d ago` };
      }
      if (days <= EXPIRING_SOON_DAYS) {
        return { status: "expiring_soon", reasonAr: `ينتهي خلال ${days} يوم`, reasonEn: `Expires in ${days}d` };
      }
      return { status: "ok", reasonAr: "ساري", reasonEn: "Valid" };
    }
  }

  const name = doc.name.toLowerCase();
  if (/منته|expired|انتهاء/.test(name)) {
    return { status: "expired", reasonAr: "يُرجّح منتهٍ (من الاسم)", reasonEn: "Likely expired (name)" };
  }
  if (/ينتهي|expires|renewal|تجديد/.test(name)) {
    return { status: "expiring_soon", reasonAr: "يُرجّح قريب الانتهاء", reasonEn: "Likely expiring soon" };
  }

  return { status: "unknown", reasonAr: "لا تاريخ انتهاء معروف", reasonEn: "No expiry metadata" };
}

function refsFromIds(
  ids: number[],
  entities: OdooRelationshipIndex["entities"],
  kind: "projects" | "tasks" | "events"
): OdooLinkedEntityRef[] {
  const map = entities[kind];
  return ids
    .map((id) => map[id])
    .filter(Boolean)
    .map((e) => ({
      model: kind === "projects" ? "project.project" : kind === "tasks" ? "project.task" : "calendar.event",
      id: e.id,
      name: e.name,
      meta: kind === "events" && "start" in e && e.start ? String(e.start) : undefined,
    }));
}

export type BuildFolderWorkspaceInput = {
  folder: OdooRelationshipFolderInput;
  documents: OdooRelationshipDocumentInput[];
  loadedOffset: number;
  pageSize: number;
  tasks?: OdooRelationshipTaskInput[];
  projects?: OdooRelationshipProjectInput[];
  events?: OdooRelationshipEventInput[];
  folders?: OdooRelationshipFolderInput[];
};

export function buildOdooFolderWorkspaceContext(input: BuildFolderWorkspaceInput): {
  index: OdooRelationshipIndex;
  context: OdooFolderWorkspaceContext;
} {
  const folder = input.folder;
  const documents = input.documents;
  const pageSize = input.pageSize;

  const index = buildOdooRelationshipIndex({
    tasks: input.tasks,
    projects: input.projects,
    events: input.events,
    documents,
    folders: input.folders ?? [folder],
    documentsScope: documents.length ? "folder_sample" : "none",
  });

  const folderLinks = index.byFolder[folder.id] ?? {
    documentIds: [],
    projectIds: [],
    taskIds: [],
    eventIds: [],
  };

  const ownerCounts = new Map<string, number>();
  const mimeCounts = new Map<string, number>();
  let missingMetadata = 0;
  const expired: OdooFolderWorkspaceContext["attention"]["expired"] = [];
  const expiringSoon: OdooFolderWorkspaceContext["attention"]["expiringSoon"] = [];

  let lastActivityMs: number | null = null;

  for (const d of documents) {
    const owner = String(d.owner || d.creator || "").trim() || "—";
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    mimeCounts.set(mimeCategory(d.mimetype ?? ""), (mimeCounts.get(mimeCategory(d.mimetype ?? "")) ?? 0) + 1);

    if (!d.resModel && !d.mimetype) missingMetadata += 1;

    const activityMs = parseDateMs(d.writeDate) ?? parseDateMs(d.createdAt);
    if (activityMs != null && (lastActivityMs == null || activityMs > lastActivityMs)) {
      lastActivityMs = activityMs;
    }

    const risk = inferDocumentRiskStatus(d);
    if (risk.status === "expired") {
      expired.push({ id: d.id, name: d.name, reason: risk.reasonAr });
    } else if (risk.status === "expiring_soon") {
      expiringSoon.push({ id: d.id, name: d.name, reason: risk.reasonAr });
    }
  }

  const sortedBySize = [...documents].sort((a, b) => (b.fileSize ?? 0) - (a.fileSize ?? 0));
  const sortedByDate = [...documents].sort((a, b) => {
    const da = parseDateMs(a.createdAt) ?? 0;
    const db = parseDateMs(b.createdAt) ?? 0;
    return db - da;
  });

  const odooCount =
    typeof folder.documentCount === "number" && folder.documentCount >= 0 ? folder.documentCount : null;
  const hasMore =
    odooCount != null ? input.loadedOffset + documents.length < odooCount : documents.length >= pageSize;

  const docRel: OdooRelationshipCount =
    odooCount != null
      ? relationshipCount(
          documents.length >= odooCount ? "known" : "partial",
          documents.length >= odooCount ? odooCount : documents.length,
          documents.length >= odooCount ? undefined : "العدد من الصفحة المحمّلة فقط",
          documents.length >= odooCount ? undefined : "Count from loaded page only"
        )
      : relationshipCount(
          documents.length ? "partial" : "unknown",
          documents.length || null,
          "لم يُحمَّل بعد",
          "Not loaded yet"
        );

  const linkedProjects = refsFromIds(folderLinks.projectIds, index.entities, "projects");
  const linkedTasks = refsFromIds(folderLinks.taskIds, index.entities, "tasks");
  const linkedEvents = refsFromIds(folderLinks.eventIds, index.entities, "events");

  const partialNote =
    documents.length === 0
      ? {
          ar: "لم تُحمَّل مستندات هذا المجلد بعد — اختر المجلد أو انتظر التحميل.",
          en: "Folder documents not loaded yet — select the folder or wait for load.",
        }
      : hasMore
        ? {
            ar: "العلاقات والملخص مبنيان على المستندات المحمّلة حالياً — قد توجد المزيد في Odoo.",
            en: "Summary built from currently loaded documents — more may exist in Odoo.",
          }
        : linkedProjects.length === 0 && linkedTasks.length === 0 && linkedEvents.length === 0
          ? {
              ar: "لا توجد علاقات معروفة ضمن البيانات المحمّلة — قد تكون الروابط غير مسجّلة في Odoo.",
              en: "No known links in loaded data — Odoo may not have res_model links on these files.",
            }
          : null;

  const recommendedActions: OdooFolderWorkspaceContext["recommendedActions"] = [];
  if (expired.length) {
    recommendedActions.push({
      id: "review_expired",
      labelAr: `مراجعة ${expired.length} مستند منتهٍ`,
      labelEn: `Review ${expired.length} expired document(s)`,
    });
  }
  if (expiringSoon.length) {
    recommendedActions.push({
      id: "review_expiring",
      labelAr: `متابعة ${expiringSoon.length} مستند ينتهي قريباً`,
      labelEn: `Follow up on ${expiringSoon.length} expiring document(s)`,
    });
  }
  if (linkedProjects.length === 1) {
    recommendedActions.push({
      id: "open_project",
      labelAr: `فتح المشروع: ${linkedProjects[0].name}`,
      labelEn: `Open project: ${linkedProjects[0].name}`,
    });
  }
  if (!documents.length) {
    recommendedActions.push({
      id: "load_docs",
      labelAr: "تحميل مستندات المجلد",
      labelEn: "Load folder documents",
    });
  }

  const context: OdooFolderWorkspaceContext = {
    folder: {
      id: folder.id,
      name: folder.name,
      description: String(folder.description ?? ""),
      odooDocumentCount: odooCount,
      loadedDocumentCount: documents.length,
      loadedOffset: input.loadedOffset,
      hasMoreDocuments: hasMore,
    },
    summary: {
      owners: [...ownerCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, count]) => ({ name, count })),
      mimeDistribution: [...mimeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count })),
      lastActivityAt: lastActivityMs != null ? new Date(lastActivityMs).toISOString() : null,
      largestFiles: sortedBySize.slice(0, 3).map((d) => ({
        id: d.id,
        name: d.name,
        fileSize: d.fileSize ?? null,
      })),
      recentFiles: sortedByDate.slice(0, 3).map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: String(d.createdAt ?? ""),
      })),
    },
    attention: {
      expired: expired.slice(0, 8),
      expiringSoon: expiringSoon.slice(0, 8),
      missingMetadataCount: missingMetadata,
    },
    linked: {
      projects: linkedProjects.slice(0, 12),
      tasks: linkedTasks.slice(0, 12),
      events: linkedEvents.slice(0, 12),
    },
    relationships: {
      documents: docRel,
      projects: relationshipCount(
        linkedProjects.length ? "partial" : "unknown",
        linkedProjects.length || null,
        "من المستندات المحمّلة",
        "From loaded documents"
      ),
      tasks: relationshipCount(
        linkedTasks.length ? "partial" : "unknown",
        linkedTasks.length || null,
        "من المستندات المحمّلة",
        "From loaded documents"
      ),
      events: relationshipCount(
        linkedEvents.length ? "partial" : "unknown",
        linkedEvents.length || null,
        "من المستندات المحمّلة",
        "From loaded documents"
      ),
    },
    recommendedActions,
    partialDataNoteAr: partialNote?.ar ?? null,
    partialDataNoteEn: partialNote?.en ?? null,
  };

  return { index, context };
}
