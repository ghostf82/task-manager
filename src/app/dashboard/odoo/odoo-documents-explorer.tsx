"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  InfoIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";

import {
  listOdooDocumentFoldersAction,
  listOdooDocumentsAction,
  listOdooDocumentsInFolderAction,
} from "@/app/dashboard/ai-agent/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  odooDocumentDownloadUrl,
  odooDocumentOpenUrl,
  odooDocumentsAppUrl,
} from "@/lib/integrations/odoo-document-links";
import type { OdooDocumentsExplorerMode } from "@/lib/integrations/odoo-documents-constants";
import { replaceOdooWorkspaceUrl } from "@/lib/integrations/odoo-workspace-url";
import { cn } from "@/lib/utils";

export type OdooFolderRow = {
  id: number;
  name: string;
  parentFolderId: number | null;
  parentFolderName: string;
  description: string;
  documentCount: number;
};

export type OdooExplorerDocument = {
  id: number;
  name: string;
  type: string;
  mimetype: string;
  createdAt: string;
  creator: string;
  folderId?: number | null;
  owner?: string;
  fileSize?: number | null;
  resModel?: string;
  resId?: number | null;
};

const PAGE_SIZE = 40;

type DocSort = "date" | "name" | "size";
type MainView = "pick_folder" | "loading" | "ready" | "empty" | "error" | "flat";

function formatBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string, locale: string) {
  if (!iso) return "—";
  const ms = Date.parse(iso.replace(" ", "T"));
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString(locale === "en" ? "en-GB" : "ar-SA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

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

function mapDocRow(d: {
  id: number;
  name: string;
  type: string;
  mimetype: string;
  createdAt: string;
  creator: string;
  folderId?: number | null;
  owner?: string;
  fileSize?: number | null;
  resModel?: string;
  resId?: number | null;
}): OdooExplorerDocument {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    mimetype: d.mimetype,
    createdAt: d.createdAt,
    creator: d.creator,
    folderId: d.folderId ?? null,
    owner: d.owner ?? d.creator,
    fileSize: d.fileSize ?? null,
    resModel: d.resModel ?? "",
    resId: d.resId ?? null,
  };
}

function pickDefaultFolderId(
  folders: OdooFolderRow[],
  preferredId: number | null | undefined
): number | null {
  if (preferredId != null && folders.some((f) => f.id === preferredId)) return preferredId;
  const withDocs = folders.find((f) => f.documentCount > 0);
  if (withDocs) return withDocs.id;
  return folders[0]?.id ?? null;
}

function DocSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-3">
          <div className="size-8 rounded bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="h-2 w-1/3 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OdooDocumentsExplorer({
  initialFolders,
  locale,
  complianceFilter,
  odooBaseUrl,
  initialMode,
  initialWarning,
  initialFolderId,
}: {
  initialFolders?: OdooFolderRow[];
  locale: string;
  complianceFilter?: boolean;
  odooBaseUrl?: string | null;
  initialMode?: OdooDocumentsExplorerMode;
  initialWarning?: string | null;
  initialFolderId?: number | null;
}) {
  const ar = locale !== "en";
  const t = (en: string, arText: string) => (ar ? arText : en);

  const [folders, setFolders] = useState<OdooFolderRow[]>(initialFolders ?? []);
  const [mode, setMode] = useState<OdooDocumentsExplorerMode | null>(initialMode ?? null);
  const [warning, setWarning] = useState<string | null>(initialWarning ?? null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [technicalDetail, setTechnicalDetail] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(() => {
    if (initialFolderId != null && Number.isFinite(initialFolderId)) return initialFolderId;
    if (typeof window !== "undefined") {
      const raw = new URLSearchParams(window.location.search).get("folder");
      const n = raw != null ? Number(raw) : NaN;
      if (Number.isFinite(n)) return n;
    }
    return null;
  });
  const [documents, setDocuments] = useState<OdooExplorerDocument[]>([]);
  const [totalInFolder, setTotalInFolder] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [sort, setSort] = useState<DocSort>("date");
  const [mimeFilter, setMimeFilter] = useState<string>("all");
  const [flatFallback, setFlatFallback] = useState(false);
  const [docsLoading, startDocsLoading] = useTransition();
  const [foldersLoading, startFoldersLoading] = useTransition();
  const autoSelectedRef = useRef(false);
  const loadGenRef = useRef(0);

  const syncFolderUrl = useCallback((folderId: number | null) => {
    replaceOdooWorkspaceUrl({ tab: "documents", folder: folderId });
  }, []);

  const loadDocumentsForFolder = useCallback(
    (folderId: number, nextOffset: number, searchText?: string) => {
      const gen = ++loadGenRef.current;
      startDocsLoading(async () => {
        setFlatFallback(false);
        setDocError(null);
        if (nextOffset === 0) setDocuments([]);
        const res = await listOdooDocumentsInFolderAction({
          folderId,
          offset: nextOffset,
          limit: PAGE_SIZE,
          text: searchText?.trim() || undefined,
        });
        if (gen !== loadGenRef.current) return;
        if (!res.ok) {
          setDocError(res.error);
          if (nextOffset === 0) setDocuments([]);
          return;
        }
        const mapped = res.documents.map(mapDocRow);
        setDocuments(mapped);
        setOffset(nextOffset);
        setTotalInFolder(
          mapped.length < PAGE_SIZE ? nextOffset + mapped.length : nextOffset + PAGE_SIZE + 1
        );
      });
    },
    []
  );

  const selectFolder = useCallback(
    (folderId: number) => {
      setFlatFallback(false);
      setDocError(null);
      setDocuments([]);
      setMimeFilter("all");
      setSelectedFolderId(folderId);
      syncFolderUrl(folderId);
      loadDocumentsForFolder(folderId, 0, search);
    },
    [loadDocumentsForFolder, search, syncFolderUrl]
  );

  const loadRecentFlat = useCallback(() => {
    const gen = ++loadGenRef.current;
    startDocsLoading(async () => {
      setFlatFallback(true);
      setDocError(null);
      setDocuments([]);
      setSelectedFolderId(null);
      syncFolderUrl(null);
      const res = await listOdooDocumentsAction({
        limit: PAGE_SIZE,
        offset: 0,
        text: search.trim() || undefined,
      });
      if (gen !== loadGenRef.current) return;
      if (!res.ok) {
        setDocError(res.error);
        return;
      }
      setDocuments(res.documents.map(mapDocRow));
      setOffset(0);
      setTotalInFolder(res.documents.length);
    });
  }, [search, syncFolderUrl]);

  const loadFolders = useCallback(() => {
    startFoldersLoading(async () => {
      setFolderError(null);
      const res = await listOdooDocumentFoldersAction();
      if (!res.ok) {
        setFolders([]);
        setFolderError(res.error);
        setTechnicalDetail(res.technicalDetail ?? null);
        setMode(res.mode ?? null);
        return;
      }
      setFolders(res.folders);
      setMode(res.mode);
      setWarning(res.warning ?? null);
      setTechnicalDetail(res.technicalDetail ?? null);

      if (!autoSelectedRef.current) {
        const defaultId = pickDefaultFolderId(res.folders, initialFolderId);
        if (defaultId != null) {
          autoSelectedRef.current = true;
          selectFolder(defaultId);
        }
      }
    });
  }, [initialFolderId, selectFolder]);

  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (initialFolders?.length) {
      const defaultId = pickDefaultFolderId(initialFolders, initialFolderId);
      if (defaultId != null) {
        autoSelectedRef.current = true;
        selectFolder(defaultId);
      }
      return;
    }
    loadFolders();
    // Mount / initial cache only — avoid re-fetching folders on folder selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const folderTree = useMemo(() => {
    const roots = folders.filter((f) => f.parentFolderId == null);
    const orphans =
      roots.length === 0
        ? folders
        : folders.filter((f) => f.parentFolderId != null && !folders.some((p) => p.id === f.parentFolderId));
    const allRoots = roots.length ? roots : orphans;
    const childrenOf = (pid: number) => folders.filter((f) => f.parentFolderId === pid);
    return { roots: allRoots, childrenOf };
  }, [folders]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  const mimeOptions = useMemo(() => {
    const cats = new Set<string>();
    for (const d of documents) cats.add(mimeCategory(d.mimetype));
    return ["all", ...[...cats].sort()];
  }, [documents]);

  const sortedDocs = useMemo(() => {
    let list = [...documents];
    if (mimeFilter !== "all") {
      list = list.filter((d) => mimeCategory(d.mimetype) === mimeFilter);
    }
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, ar ? "ar" : "en");
      if (sort === "size") return (b.fileSize ?? 0) - (a.fileSize ?? 0);
      const da = Date.parse(a.createdAt.replace(" ", "T"));
      const db = Date.parse(b.createdAt.replace(" ", "T"));
      return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
    });
    return list;
  }, [documents, sort, mimeFilter, ar]);

  const mainView: MainView = useMemo(() => {
    if (flatFallback) return docsLoading && !documents.length ? "loading" : docError ? "error" : documents.length ? "ready" : "empty";
    if (selectedFolderId == null) return "pick_folder";
    if (docsLoading && !documents.length && !docError) return "loading";
    if (docError) return "error";
    if (!documents.length) return "empty";
    return "ready";
  }, [flatFallback, selectedFolderId, docsLoading, documents.length, docError]);

  const odooDocumentsUrl = odooBaseUrl ? odooDocumentsAppUrl(odooBaseUrl, selectedFolderId) : null;

  const modeHint =
    mode === "virtual_folders"
      ? t("Folders are inferred from document records — not the native Odoo folder tree.", "المجلدات مبنية من سجلات المستندات وليست شجرة Odoo الأصلية.")
      : mode === "attachments_only"
        ? t("Browsing all attachments — Odoo Documents app is not available.", "تصفح جميع المرفقات — تطبيق مستندات Odoo غير متاح.")
        : null;

  function renderFolderNode(f: OdooFolderRow, depth = 0) {
    const kids = folderTree.childrenOf(f.id);
    const active = selectedFolderId === f.id && !flatFallback;
    return (
      <div key={f.id}>
        <button
          type="button"
          title={f.name}
          onClick={() => selectFolder(f.id)}
          className={cn(
            "group flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-sm transition",
            active
              ? "border-primary/40 bg-primary/10 font-medium text-primary shadow-sm"
              : "border-transparent hover:border-border/60 hover:bg-muted/50"
          )}
          style={{ paddingInlineStart: `${10 + depth * 14}px` }}
        >
          {active ? (
            <FolderOpenIcon className="size-4 shrink-0 text-primary" />
          ) : (
            <FolderIcon className="text-muted-foreground size-4 shrink-0 group-hover:text-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate leading-snug">{f.name}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
              active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            {f.documentCount}
          </span>
        </button>
        {kids.map((k) => renderFolderNode(k, depth + 1))}
      </div>
    );
  }

  function runSearch() {
    setSearch(searchDraft);
    if (flatFallback) loadRecentFlat();
    else if (selectedFolderId != null) loadDocumentsForFolder(selectedFolderId, 0, searchDraft);
  }

  return (
    <div className="w-full space-y-3">
      {(warning || modeHint) && !folderError ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
          <InfoIcon className="mt-0.5 size-4 shrink-0 opacity-80" />
          <div className="min-w-0">
            {warning ? <p className="font-medium leading-snug">{warning}</p> : null}
            {modeHint ? <p className={cn("text-muted-foreground leading-snug", warning && "mt-1")}>{modeHint}</p> : null}
          </div>
        </div>
      ) : null}

      {folderError && !folders.length ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <div className="flex gap-2">
            <AlertTriangleIcon className="size-5 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-medium text-rose-900 dark:text-rose-200">{folderError}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="default" className="h-8 gap-1.5 text-xs" onClick={loadFolders} disabled={foldersLoading}>
                  <RefreshCwIcon className={cn("size-3.5", foldersLoading && "animate-spin")} />
                  {t("Retry", "إعادة المحاولة")}
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={loadRecentFlat} disabled={docsLoading}>
                  {t("Recent documents", "أحدث المستندات")}
                </Button>
                {odooDocumentsUrl ? (
                  <a
                    href={odooDocumentsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted/50"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    {t("Open Odoo Documents", "فتح مستندات Odoo")}
                  </a>
                ) : null}
              </div>
              {technicalDetail ? (
                <details className="text-[11px]">
                  <summary className="text-muted-foreground cursor-pointer">{t("Technical details", "تفاصيل الخطأ")}</summary>
                  <pre className="mt-1 max-h-28 overflow-auto rounded border bg-muted/30 p-2 [direction:ltr]">{technicalDetail}</pre>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-[min(72vh,640px)] w-full gap-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm lg:grid-cols-[minmax(240px,300px)_1fr]">
        {/* Folder sidebar */}
        <aside className="flex flex-col border-b border-border/60 bg-muted/15 lg:border-b-0 lg:border-e">
          <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
            <p className="text-sm font-semibold">{t("Folders", "المجلدات")}</p>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={loadFolders} disabled={foldersLoading}>
              {foldersLoading ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
              {t("Refresh", "تحديث")}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {foldersLoading && !folders.length ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/50" />
                ))}
              </div>
            ) : folders.length ? (
              <div className="space-y-1">{folderTree.roots.map((f) => renderFolderNode(f))}</div>
            ) : !folderError ? (
              <p className="text-muted-foreground px-2 py-8 text-center text-xs leading-relaxed">
                {t("Sync workspace or retry to load folders.", "زامِن مساحة العمل أو أعد المحاولة لتحميل المجلدات.")}
              </p>
            ) : null}
          </div>
          <div className="border-t border-border/50 p-2">
            <Button
              type="button"
              size="sm"
              variant={flatFallback ? "default" : "outline"}
              className="h-8 w-full text-xs"
              onClick={loadRecentFlat}
              disabled={docsLoading}
            >
              {t("All recent documents", "أحدث المستندات")}
            </Button>
          </div>
        </aside>

        {/* Main file area */}
        <section className="flex min-h-[360px] min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-3 py-2.5">
            <div className="relative min-w-[200px] flex-1">
              <SearchIcon className="text-muted-foreground absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
                placeholder={t("Search in folder…", "بحث في المجلد…")}
                className="h-9 ps-9 text-sm"
                disabled={selectedFolderId == null && !flatFallback}
              />
            </div>
            <Button type="button" size="sm" variant="secondary" className="h-9 text-xs" onClick={runSearch} disabled={(selectedFolderId == null && !flatFallback) || docsLoading}>
              {t("Search", "بحث")}
            </Button>
            {(["date", "name", "size"] as const).map((s) => (
              <Button key={s} type="button" size="sm" variant={sort === s ? "default" : "outline"} className="h-9 text-xs" onClick={() => setSort(s)}>
                {s === "date" ? t("Date", "التاريخ") : s === "name" ? t("Name", "الاسم") : t("Size", "الحجم")}
              </Button>
            ))}
            {mimeOptions.length > 1 ? (
              <select
                value={mimeFilter}
                onChange={(e) => setMimeFilter(e.target.value)}
                className="border-input bg-background h-9 rounded-md border px-2 text-xs"
              >
                <option value="all">{t("All types", "كل الأنواع")}</option>
                {mimeOptions
                  .filter((m) => m !== "all")
                  .map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              </select>
            ) : null}
          </div>

          <div className="border-b border-border/40 bg-muted/10 px-3 py-2">
            {flatFallback ? (
              <p className="text-muted-foreground text-xs font-medium">{t("Recent documents (flat list)", "أحدث المستندات (قائمة مسطحة)")}</p>
            ) : selectedFolder ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-semibold text-foreground">{selectedFolder.name}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground tabular-nums">
                  {selectedFolder.documentCount} {t("documents", "مستند")}
                </span>
                {docsLoading ? (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Loader2Icon className="size-3 animate-spin" />
                      {t("Loading…", "جاري التحميل…")}
                    </span>
                  </>
                ) : null}
                {complianceFilter ? (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-900">{t("Compliance filter", "تصفية امتثال")}</span>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">{t("Select a folder from the list to browse its files.", "اختر مجلداً من القائمة لعرض ملفاته.")}</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {mainView === "pick_folder" ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
                <FolderOpenIcon className="text-muted-foreground/50 size-12" />
                <div>
                  <p className="text-sm font-medium">{t("No folder selected", "لم يُحدَّد مجلد")}</p>
                  <p className="text-muted-foreground mt-1 max-w-md text-xs leading-relaxed">
                    {t(
                      "Click a folder on the left — files load immediately. Count badges show how many documents each folder has.",
                      "انقر مجلداً على اليسار — تُحمَّل الملفات فوراً. الرقم بجانب كل مجلد يبيّن عدد المستندات."
                    )}
                  </p>
                </div>
              </div>
            ) : null}

            {mainView === "loading" ? <DocSkeleton rows={8} /> : null}

            {mainView === "error" ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertTriangleIcon className="size-10 text-rose-500" />
                <p className="text-sm font-medium text-rose-900 dark:text-rose-200">{docError}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (flatFallback) loadRecentFlat();
                      else if (selectedFolderId != null) loadDocumentsForFolder(selectedFolderId, offset, search);
                    }}
                  >
                    <RefreshCwIcon className="size-3.5" />
                    {t("Retry", "إعادة المحاولة")}
                  </Button>
                  {odooDocumentsUrl ? (
                    <a
                      href={odooDocumentsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted/50"
                    >
                      <ExternalLinkIcon className="size-3.5" />
                      {t("Open in Odoo", "فتح في Odoo")}
                    </a>
                  ) : null}
                </div>
                {technicalDetail ? (
                  <details className="max-w-lg text-start text-[11px]">
                    <summary className="text-muted-foreground cursor-pointer">{t("Technical details", "تفاصيل الخطأ")}</summary>
                    <pre className="mt-1 max-h-24 overflow-auto rounded border bg-muted/30 p-2 [direction:ltr]">{technicalDetail}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}

            {mainView === "empty" ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
                <FileIcon className="text-muted-foreground/40 size-10" />
                <p className="text-sm font-medium">
                  {flatFallback
                    ? t("No documents found.", "لا توجد مستندات.")
                    : t("No documents in this folder.", "لا توجد مستندات داخل هذا المجلد")}
                </p>
                {search ? (
                  <p className="text-muted-foreground text-xs">{t("Try clearing the search filter.", "جرّب مسح نص البحث.")}</p>
                ) : null}
              </div>
            ) : null}

            {mainView === "ready" || (mainView === "loading" && documents.length > 0) ? (
              <div className="divide-y divide-border/50">
                {sortedDocs.map((d) => {
                  const base = odooBaseUrl?.replace(/\/$/, "") ?? "";
                  const canLink = Boolean(base);
                  return (
                    <div
                      key={d.id}
                      className="flex flex-col gap-2 px-3 py-3 transition hover:bg-muted/25 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                          <FileIcon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium leading-snug" title={d.name}>
                            {d.name}
                          </p>
                          <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                            <span className="[direction:ltr]">{d.mimetype || d.type || "—"}</span>
                            <span>{d.owner || d.creator}</span>
                            <span className="tabular-nums">{formatBytes(d.fileSize)}</span>
                            <span className="tabular-nums [direction:ltr]">{formatDate(d.createdAt, locale)}</span>
                          </div>
                          {d.resModel ? (
                            <p className="text-muted-foreground mt-0.5 text-[10px] [direction:ltr]">
                              {t("Linked", "مرتبط")}: {d.resModel}
                              {d.resId != null ? ` #${d.resId}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {canLink ? (
                        <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-nowrap">
                          <a
                            href={odooDocumentOpenUrl(base, d.id, d.resModel, d.resId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium hover:bg-muted/50"
                          >
                            <ExternalLinkIcon className="size-3" />
                            {t("Open", "فتح")}
                          </a>
                          <a
                            href={odooDocumentDownloadUrl(base, d.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-medium hover:bg-muted/50"
                          >
                            <DownloadIcon className="size-3" />
                            {t("Download", "تنزيل")}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {(selectedFolderId != null || flatFallback) && mainView !== "pick_folder" && mainView !== "error" ? (
            <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                disabled={offset <= 0 || docsLoading || flatFallback}
                onClick={() => selectedFolderId != null && loadDocumentsForFolder(selectedFolderId, Math.max(0, offset - PAGE_SIZE), search)}
              >
                <ChevronRightIcon className="size-3.5" />
                {t("Previous", "السابق")}
              </Button>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {documents.length ? `${offset + 1}–${offset + documents.length}` : "—"}
                {!flatFallback && totalInFolder > offset + documents.length ? ` · ${t("more available", "المزيد متاح")}` : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                disabled={documents.length < PAGE_SIZE || docsLoading || flatFallback}
                onClick={() => selectedFolderId != null && loadDocumentsForFolder(selectedFolderId, offset + PAGE_SIZE, search)}
              >
                {t("Next", "التالي")}
                <ChevronLeftIcon className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
