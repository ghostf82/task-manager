"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Pencil, Plus, Trash2 } from "lucide-react";

import {
  createCompanyDocumentAction,
  deleteCompanyDocumentAction,
  updateCompanyDocumentAction,
  type CompanyDocumentPayload,
} from "@/app/dashboard/documents/actions";
import {
  documentDaysUntilExpiry,
  documentRowTone,
  documentToneRowClasses,
  type CompanyDocumentStatus,
} from "@/lib/company-documents";
import type { DocumentsPageCopy } from "@/lib/i18n/documents-copy";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CompanyDocumentRow = {
  id: string;
  tenant_id: string;
  document_name: string;
  document_number: string | null;
  expiry_date: string;
  alert_days_before: number;
  status: CompanyDocumentStatus;
  file_url: string | null;
  updated_at: string;
  tenants: { name: string } | { name: string }[] | null;
};

type TenantOpt = { id: string; name: string; is_active: boolean };

function tenantNameFromRow(row: CompanyDocumentRow): string {
  const t = row.tenants;
  if (Array.isArray(t)) return String(t[0]?.name ?? "—");
  if (t && typeof t === "object" && "name" in t) return String(t.name);
  return "—";
}

function emptyPayload(tenantId: string, todayIso: string): CompanyDocumentPayload {
  return {
    tenant_id: tenantId,
    document_name: "",
    document_number: "",
    expiry_date: todayIso,
    alert_days_before: 30,
    status: "valid",
    file_url: "",
  };
}

export function DocumentsPageClient({
  documents,
  tenants,
  isSuperAdmin,
  defaultTenantId,
  copy,
  serverToday,
}: {
  documents: CompanyDocumentRow[];
  tenants: TenantOpt[];
  isSuperAdmin: boolean;
  defaultTenantId: string | null;
  copy: DocumentsPageCopy;
  serverToday: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filterTenant, setFilterTenant] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [editRow, setEditRow] = useState<CompanyDocumentRow | null>(null);

  const initialTenant =
    defaultTenantId && tenants.some((t) => t.id === defaultTenantId)
      ? defaultTenantId
      : tenants[0]?.id ?? "";

  const [form, setForm] = useState<CompanyDocumentPayload>(() =>
    emptyPayload(initialTenant, serverToday),
  );

  const tenantMap = useMemo(
    () => Object.fromEntries(tenants.map((t) => [t.id, t.name])),
    [tenants]
  );

  const todayStr = serverToday;

  const filtered = useMemo(() => {
    if (!filterTenant) return documents;
    return documents.filter((d) => d.tenant_id === filterTenant);
  }, [documents, filterTenant]);

  function openCreateDialog() {
    setForm(emptyPayload(initialTenant, serverToday));
    setOpenCreate(true);
  }

  function openEditDialog(row: CompanyDocumentRow) {
    setForm({
      tenant_id: row.tenant_id,
      document_name: row.document_name,
      document_number: row.document_number ?? "",
      expiry_date: row.expiry_date,
      alert_days_before: row.alert_days_before,
      status: row.status,
      file_url: row.file_url ?? "",
    });
    setEditRow(row);
  }

  const exportHref = `/api/reports/documents${
    filterTenant ? `?tenantId=${encodeURIComponent(filterTenant)}` : ""
  }`;

  function submitCreate() {
    start(async () => {
      try {
        await createCompanyDocumentAction(form);
        setOpenCreate(false);
        router.refresh();
        toast.success(copy.toast.added);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : copy.toast.saveFail);
      }
    });
  }

  function submitEdit() {
    if (!editRow) return;
    start(async () => {
      try {
        await updateCompanyDocumentAction(editRow.id, form);
        setEditRow(null);
        router.refresh();
        toast.success(copy.toast.updated);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : copy.toast.saveFail);
      }
    });
  }

  function remove(id: string) {
    if (!confirm(copy.confirmDelete)) return;
    start(async () => {
      try {
        await deleteCompanyDocumentAction(id);
        router.refresh();
        toast.success(copy.toast.deleted);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : copy.toast.deleteFail);
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-muted-foreground text-sm">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin ? (
            <select
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={filterTenant}
              onChange={(e) => setFilterTenant(e.target.value)}
            >
              <option value="">{copy.allTenants}</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
          <Link
            href={exportHref}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "inline-flex gap-2"
            )}
          >
            <FileSpreadsheet className="size-4" />
            {copy.exportExcel}
          </Link>
          <Button
            type="button"
            size="sm"
            disabled={!tenants.length || pending}
            onClick={openCreateDialog}
          >
            <Plus className="size-4" />
            {copy.addDocument}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              icon={FileText}
              title={copy.emptyTitle}
              description={copy.emptyDescription}
              action={{
                label: copy.addDocument,
                onClick: () => setOpenCreate(true),
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">{copy.table.company}</TableHead>
                <TableHead className="min-w-[140px]">{copy.table.document}</TableHead>
                <TableHead className="hidden sm:table-cell">{copy.table.number}</TableHead>
                <TableHead>{copy.table.expiry}</TableHead>
                <TableHead className="hidden md:table-cell">{copy.table.alertBefore}</TableHead>
                <TableHead>{copy.table.status}</TableHead>
                <TableHead className="hidden lg:table-cell">{copy.table.days}</TableHead>
                <TableHead className="hidden xl:table-cell">{copy.table.attachment}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
                {filtered.map((row) => {
                  const tone = documentRowTone(
                    row.expiry_date,
                    row.alert_days_before,
                    todayStr
                  );
                  const rowClass = `${documentToneRowClasses[tone]} border-b`;
                  const daysLeft = documentDaysUntilExpiry(
                    row.expiry_date,
                    todayStr
                  );

                  return (
                    <TableRow key={row.id} className={rowClass}>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {tenantMap[row.tenant_id] ?? tenantNameFromRow(row)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {row.document_name}
                      </TableCell>
                      <TableCell className="hidden max-w-[120px] truncate text-xs sm:table-cell">
                        {row.document_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {row.expiry_date}
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {row.alert_days_before}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {copy.status[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden tabular-nums text-xs lg:table-cell">
                        {daysLeft}
                      </TableCell>
                      <TableCell className="hidden max-w-[160px] truncate text-[11px] xl:table-cell">
                        {row.file_url ? (
                          <a
                            href={row.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            {copy.linkLabel}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger>
                            <Button variant="ghost" size="sm" type="button">
                              ⋮
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openEditDialog(row)}
                              className="gap-2"
                            >
                              <Pencil className="size-3.5" />
                              {copy.edit}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive gap-2"
                              onClick={() => void remove(row.id)}
                            >
                              <Trash2 className="size-3.5" />
                              {copy.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          </div>
        )}
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.dialogNewTitle}</DialogTitle>
            <DialogDescription>{copy.dialogNewDescription}</DialogDescription>
          </DialogHeader>
          <DocumentFormFields form={form} setForm={setForm} tenants={tenants} copy={copy} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              {copy.cancel}
            </Button>
            <Button type="button" disabled={pending} onClick={submitCreate}>
              {copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editRow)} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.dialogEditTitle}</DialogTitle>
            <DialogDescription>{copy.dialogEditDescription}</DialogDescription>
          </DialogHeader>
          <DocumentFormFields form={form} setForm={setForm} tenants={tenants} copy={copy} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
              {copy.cancel}
            </Button>
            <Button type="button" disabled={pending} onClick={submitEdit}>
              {copy.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentFormFields({
  form,
  setForm,
  tenants,
  copy,
}: {
  form: CompanyDocumentPayload;
  setForm: (f: CompanyDocumentPayload) => void;
  tenants: TenantOpt[];
  copy: DocumentsPageCopy;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="doc-tenant">{copy.form.tenant}</Label>
        <select
          id="doc-tenant"
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          value={form.tenant_id}
          onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doc-name">{copy.form.documentName}</Label>
        <Input
          id="doc-name"
          value={form.document_name}
          onChange={(e) => setForm({ ...form, document_name: e.target.value })}
          placeholder={copy.form.documentNamePh}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doc-num">{copy.form.documentNumber}</Label>
        <Input
          id="doc-num"
          value={form.document_number ?? ""}
          onChange={(e) => setForm({ ...form, document_number: e.target.value })}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        <div className="grid gap-2">
          <Label htmlFor="doc-exp">{copy.form.expiry}</Label>
          <Input
            id="doc-exp"
            type="date"
            value={form.expiry_date}
            onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="doc-alert">{copy.form.alertDays}</Label>
          <Input
            id="doc-alert"
            type="number"
            min={0}
            max={730}
            value={form.alert_days_before}
            onChange={(e) =>
              setForm({
                ...form,
                alert_days_before: parseInt(e.target.value, 10) || 0,
              })
            }
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doc-status">{copy.form.status}</Label>
        <select
          id="doc-status"
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          value={form.status}
          onChange={(e) =>
            setForm({
              ...form,
              status: e.target.value as CompanyDocumentStatus,
            })
          }
        >
          <option value="valid">{copy.status.valid}</option>
          <option value="expired">{copy.status.expired}</option>
          <option value="renewal_pending">{copy.status.renewal_pending}</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doc-url">{copy.form.fileUrl}</Label>
        <Input
          id="doc-url"
          dir="ltr"
          className="font-mono text-xs"
          value={form.file_url ?? ""}
          onChange={(e) => setForm({ ...form, file_url: e.target.value })}
          placeholder={copy.form.fileUrlPh}
        />
      </div>
    </div>
  );
}
