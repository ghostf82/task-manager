"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
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
import type { OdooDocumentsExplorerMode } from "@/lib/integrations/odoo-documents-constants";
import { ODOO_VIRTUAL_ALL_ATTACHMENTS_FOLDER_ID } from "@/lib/integrations/odoo-documents-constants";
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

function formatBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

export function OdooDocumentsExplorer({
  initialFolders,
  locale,
  complianceFilter,
  odooBaseUrl,
  initialMode,
  initialWarning,
}: {
  initialFolders?: OdooFolderRow[];
  locale: string;
  complianceFilter?: boolean;
  odooBaseUrl?: string | null;
  initialMode?: OdooDocumentsExplorerMode;
  initialWarning?: string | null;
}) {
  const [folders, setFolders] = useState<OdooFolderRow[]>(initialFolders ?? []);
  const [mode, setMode] = useState<OdooDocumentsExplorerMode | null>(initialMode ?? null);
  const [warning, setWarning] = useState<string | null>(initialWarning ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [technicalDetail, setTechnicalDetail] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<OdooExplorerDocument[]>([]);
  const [totalInFolder, setTotalInFolder] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "date" | "size">("date");
  const [loading, startLoading] = useTransition();
  const [foldersLoading, startFoldersLoading] = useTransition();
  const [flatFallback, setFlatFallback] = useState(false);

  const loadRecentFlat = useCallback(() => {
    startLoading(async () => {
      setFlatFallback(true);
      setErrorMessage(null);
      const res = await listOdooDocumentsAction({ limit: PAGE_SIZE, offset: 0, text: search.trim() || undefined });
      if (!res.ok) {
        setErrorMessage(res.error);
        setDocuments([]);
        return;
      }
      setDocuments(res.documents.map(mapDocRow));
      setOffset(0);
      setTotalInFolder(res.documents.length);
      setSelectedFolderId(null);
    });
  }, [search]);

  const loadFolders = useCallback(() => {
    startFoldersLoading(async () => {
      setErrorMessage(null);
      const res = await listOdooDocumentFoldersAction();
      if (!res.ok) {
        setFolders([]);
        setErrorMessage(res.error);
        setTechnicalDetail(res.technicalDetail ?? null);
        setMode(res.mode ?? null);
        return;
      }
      setFolders(res.folders);
      setMode(res.mode);
      setWarning(res.warning ?? null);
      setTechnicalDetail(res.technicalDetail ?? null);
      if (res.mode === "attachments_only" && res.folders.length === 1) {
        setSelectedFolderId(res.folders[0]?.id ?? ODOO_VIRTUAL_ALL_ATTACHMENTS_FOLDER_ID);
      }
    });
  }, []);

  useEffect(() => {
    if (!initialFolders?.length) loadFolders();
    else if (initialMode === "attachments_only" && initialFolders.length === 1) {
      setSelectedFolderId(initialFolders[0].id);
    }
  }, [initialFolders, initialMode, loadFolders]);

  const loadDocuments = useCallback(
    (folderId: number, nextOffset: number) => {
      startLoading(async () => {
        setFlatFallback(false);
        setErrorMessage(null);
        const res = await listOdooDocumentsInFolderAction({
          folderId,
          offset: nextOffset,
          limit: PAGE_SIZE,
          text: search.trim() || undefined,
        });
        if (!res.ok) {
          setErrorMessage(res.error);
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
    [search]
  );

  useEffect(() => {
    if (selectedFolderId != null && !flatFallback) loadDocuments(selectedFolderId, 0);
  }, [selectedFolderId, loadDocuments, flatFallback]);

  const folderTree = useMemo(() => {
    const roots = folders.filter((f) => f.parentFolderId == null);
    const childrenOf = (pid: number) => folders.filter((f) => f.parentFolderId === pid);
    return { roots, childrenOf };
  }, [folders]);

  const sortedDocs = useMemo(() => {
    const list = [...documents];
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, locale === "en" ? "en" : "ar");
      if (sort === "size") return (b.fileSize ?? 0) - (a.fileSize ?? 0);
      const da = Date.parse(a.createdAt.replace(" ", "T"));
      const db = Date.parse(b.createdAt.replace(" ", "T"));
      return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
    });
    return list;
  }, [documents, sort, locale]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);
  const odooDocumentsUrl = odooBaseUrl
    ? `${odooBaseUrl.replace(/\/$/, "")}/odoo/documents`
    : null;

  function renderFolderNode(f: OdooFolderRow, depth = 0) {
    const kids = folderTree.childrenOf(f.id);
    const active = selectedFolderId === f.id;
    return (
      <div key={f.id}>
        <button
          type="button"
          onClick={() => {
            setFlatFallback(false);
            setSelectedFolderId(f.id);
          }}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-start text-xs transition",
            active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted/60"
          )}
          style={{ paddingInlineStart: `${8 + depth * 12}px` }}
        >
          {active ? <FolderOpenIcon className="size-3.5 shrink-0" /> : <FolderIcon className="size-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="text-muted-foreground tabular-nums text-[10px]">{f.documentCount}</span>
        </button>
        {kids.map((k) => renderFolderNode(k, depth + 1))}
      </div>
    );
  }

  const modeLabel =
    mode === "documents_app"
      ? locale === "en"
        ? "Odoo Documents app"
        : "تطبيق مستندات Odoo"
      : mode === "virtual_folders"
        ? locale === "en"
          ? "Virtual folders from documents"
          : "مجلدات مؤقتة من المستندات"
        : mode === "attachments_only"
          ? locale === "en"
            ? "Attachments fallback"
            : "وضع المرفقات الاحتياطي"
          : null;

  return (
    <div className="space-y-3">
      {warning ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{warning}</p>
            {modeLabel ? <p className="text-muted-foreground mt-0.5">{modeLabel}</p> : null}
          </div>
        </div>
      ) : null}

      {errorMessage && !folders.length ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <div className="flex gap-2">
            <AlertTriangleIcon className="size-5 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-medium text-rose-900">{errorMessage}</p>
              <p className="text-muted-foreground text-xs">
                {locale === "en"
                  ? "The Documents app (documents.folder) may not be installed on this Odoo server."
                  : "قد لا يكون تطبيق المستندات (documents.folder) مثبتاً على خادم Odoo هذا."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="default" className="h-8 gap-1.5 text-xs" onClick={loadFolders} disabled={foldersLoading}>
                  <RefreshCwIcon className={cn("size-3.5", foldersLoading && "animate-spin")} />
                  {locale === "en" ? "Retry" : "إعادة المحاولة"}
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={loadRecentFlat} disabled={loading}>
                  {locale === "en" ? "Recent documents" : "أحدث المستندات"}
                </Button>
                {odooDocumentsUrl ? (
                  <a
                    href={odooDocumentsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted/50"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    {locale === "en" ? "Open Odoo Documents" : "فتح مستندات Odoo"}
                  </a>
                ) : null}
              </div>
              {technicalDetail ? (
                <div>
                  <button
                    type="button"
                    className="text-muted-foreground flex items-center gap-1 text-[11px] underline-offset-2 hover:underline"
                    onClick={() => setShowTechnical((o) => !o)}
                  >
                    {locale === "en" ? "Technical details" : "تفاصيل الخطأ"}
                    <ChevronDownIcon className={cn("size-3 transition-transform", showTechnical && "rotate-180")} />
                  </button>
                  {showTechnical ? (
                    <pre className="mt-1 max-h-28 overflow-auto rounded border bg-muted/30 p-2 text-[10px] [direction:ltr]">
                      {technicalDetail}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(200px,260px)_1fr]">
        <div className="rounded-xl border border-border/60 bg-muted/10 p-2">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold">{locale === "en" ? "Folders" : "المجلدات"}</p>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={loadFolders} disabled={foldersLoading}>
              {foldersLoading ? <Loader2Icon className="size-3 animate-spin" /> : locale === "en" ? "Refresh" : "تحديث"}
            </Button>
          </div>
          {foldersLoading && !folders.length ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : folders.length ? (
            <div className="max-h-[420px] space-y-0.5 overflow-y-auto">
              {folderTree.roots.map((f) => renderFolderNode(f))}
            </div>
          ) : !errorMessage ? (
            <p className="text-muted-foreground px-2 py-4 text-center text-xs">
              {locale === "en" ? "Sync workspace or retry to load folders." : "زامِن مساحة العمل أو أعد المحاولة لتحميل المجلدات."}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1">
              <SearchIcon className="text-muted-foreground absolute start-2 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (flatFallback) loadRecentFlat();
                    else if (selectedFolderId != null) loadDocuments(selectedFolderId, 0);
                  }
                }}
                placeholder={locale === "en" ? "Search…" : "بحث…"}
                className="h-8 ps-8 text-xs"
              />
            </div>
            {(["date", "name", "size"] as const).map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={sort === s ? "default" : "outline"}
                className="h-7 text-[10px]"
                onClick={() => setSort(s)}
              >
                {s === "date" ? (locale === "en" ? "Date" : "التاريخ") : s === "name" ? (locale === "en" ? "Name" : "الاسم") : locale === "en" ? "Size" : "الحجم"}
              </Button>
            ))}
          </div>

          {flatFallback ? (
            <p className="text-muted-foreground text-xs">
              {locale === "en" ? "Showing recent documents (flat list)" : "عرض أحدث المستندات (قائمة مسطحة)"}
            </p>
          ) : selectedFolder ? (
            <p className="text-muted-foreground text-xs">
              {selectedFolder.name} · {selectedFolder.documentCount}{" "}
              {locale === "en" ? "documents" : "مستند"}
              {complianceFilter ? ` · ${locale === "en" ? "Compliance filter" : "تصفية امتثال"}` : ""}
            </p>
          ) : !errorMessage ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              {locale === "en"
                ? "Select a folder to browse documents — loaded on demand."
                : "اختر مجلداً لاستعراض المستندات — يُحمَّل عند الطلب."}
            </p>
          ) : null}

          {(selectedFolderId != null || flatFallback) && !errorMessage ? (
            <>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-start text-muted-foreground text-xs">
                      <th className="px-3 py-2 font-medium">{locale === "en" ? "Name" : "الاسم"}</th>
                      <th className="px-3 py-2 font-medium">MIME</th>
                      <th className="px-3 py-2 font-medium">{locale === "en" ? "Owner" : "المالك"}</th>
                      <th className="px-3 py-2 font-medium">{locale === "en" ? "Size" : "الحجم"}</th>
                      <th className="px-3 py-2 font-medium">{locale === "en" ? "Linked" : "مرتبط"}</th>
                      <th className="px-3 py-2 font-medium">{locale === "en" ? "Created" : "الإنشاء"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center">
                          <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />
                        </td>
                      </tr>
                    ) : !sortedDocs.length ? (
                      <tr>
                        <td colSpan={6} className="text-muted-foreground py-8 text-center text-xs">
                          {locale === "en" ? "No documents on this page." : "لا مستندات في هذه الصفحة."}
                        </td>
                      </tr>
                    ) : (
                      sortedDocs.map((d) => (
                        <tr key={d.id} className="border-b align-top hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <FileIcon className="size-3.5 shrink-0 text-primary" />
                              <span className="font-medium">{d.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[11px] [direction:ltr]">{d.mimetype || "—"}</td>
                          <td className="px-3 py-2 text-xs">{d.owner || d.creator}</td>
                          <td className="px-3 py-2 text-xs tabular-nums">{formatBytes(d.fileSize)}</td>
                          <td className="px-3 py-2 text-[11px]">
                            {d.resModel ? `${d.resModel}${d.resId != null ? ` #${d.resId}` : ""}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-[11px] [direction:ltr]">{d.createdAt || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {!flatFallback ? (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    disabled={offset <= 0 || loading}
                    onClick={() =>
                      selectedFolderId != null && loadDocuments(selectedFolderId, Math.max(0, offset - PAGE_SIZE))
                    }
                  >
                    <ChevronRightIcon className="size-3.5" />
                    {locale === "en" ? "Previous" : "السابق"}
                  </Button>
                  <span className="text-muted-foreground text-[10px] tabular-nums">
                    {offset + 1}–{offset + documents.length}
                    {totalInFolder > 0 ? ` / ~${totalInFolder}` : ""}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    disabled={documents.length < PAGE_SIZE || loading}
                    onClick={() => selectedFolderId != null && loadDocuments(selectedFolderId, offset + PAGE_SIZE)}
                  >
                    {locale === "en" ? "Next" : "التالي"}
                    <ChevronLeftIcon className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
