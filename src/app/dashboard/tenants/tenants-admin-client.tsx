"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  bulkTenantsAction,
  createTenantAction,
  deleteTenantAction,
  setTenantActiveAction,
  updateTenantAction,
} from "@/app/dashboard/tenants/actions";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
};

export function TenantsAdminClient({ tenants }: { tenants: TenantRow[] }) {
  const { t } = useDashboardI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const [openCreate, setOpenCreate] = useState(false);
  const [editRow, setEditRow] = useState<TenantRow | null>(null);

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) tenants.forEach((row) => (next[row.id] = true));
    setSelected(next);
  }

  async function run(op: "activate" | "deactivate" | "delete") {
    if (!selectedIds.length) {
      toast.message(t("tenantsPage.toastNoSelection"));
      return;
    }
    if (op === "delete" && !confirm(t("tenantsPage.confirmBulkDelete"))) {
      return;
    }
    startTransition(async () => {
      try {
        await bulkTenantsAction(selectedIds, op);
        setSelected({});
        router.refresh();
        toast.success(t("tenantsPage.toastOpOk"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("tenantsPage.toastOpFail"));
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("tenantsPage.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("tenantsPage.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !selectedIds.length}
            onClick={() => void run("deactivate")}
          >
            {t("tenantsPage.disableSelected")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !selectedIds.length}
            onClick={() => void run("activate")}
          >
            {t("tenantsPage.enableSelected")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending || !selectedIds.length}
            onClick={() => void run("delete")}
          >
            {t("tenantsPage.deleteSelected")}
          </Button>
          <Button type="button" size="sm" onClick={() => setOpenCreate(true)}>
            <Plus className="size-4" />
            {t("tenantsPage.newTenant")}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    tenants.length > 0 && selectedIds.length === tenants.length
                  }
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                />
              </TableHead>
              <TableHead>{t("tenantsPage.tableName")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("tenantsPage.tableSlug")}</TableHead>
              <TableHead>{t("tenantsPage.tableStatus")}</TableHead>
              <TableHead className="w-28 text-end">{t("tenantsPage.tableActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("tenantsPage.empty")}
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Checkbox
                      checked={Boolean(selected[row.id])}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({
                          ...prev,
                          [row.id]: Boolean(v),
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                    {row.slug}
                  </TableCell>
                  <TableCell>
                    {row.is_active ? (
                      <Badge variant="secondary">{t("tenantsPage.badgeActive")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("tenantsPage.badgeInactive")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        type="button"
                        className="inline-flex h-7 items-center justify-center rounded-xl px-2.5 text-sm hover:bg-muted"
                      >
                        ⋮
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditRow(row)}
                          className="gap-2"
                        >
                          <Pencil className="size-3.5" /> {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await setTenantActiveAction(row.id, !row.is_active);
                                router.refresh();
                                toast.success(t("tenantsPage.toastStatusOk"));
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : t("tenantsPage.toastStatusFail")
                                );
                              }
                            })
                          }
                        >
                          {row.is_active ? t("tenantsPage.toggleDeactivate") : t("tenantsPage.toggleActivate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            if (!confirm(t("tenantsPage.confirmDeleteOne"))) return;
                            startTransition(async () => {
                              try {
                                await deleteTenantAction(row.id);
                                router.refresh();
                                toast.success(t("tenantsPage.toastDeleted"));
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : t("tenantsPage.toastDeleteFail")
                                );
                              }
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" /> {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TenantDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        mode="create"
        onDone={() => {
          setOpenCreate(false);
          router.refresh();
        }}
      />
      <TenantDialog
        open={Boolean(editRow)}
        onOpenChange={(o) => !o && setEditRow(null)}
        mode="edit"
        initial={editRow ?? undefined}
        onDone={() => {
          setEditRow(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function TenantDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  initial?: TenantRow;
  onDone: () => void;
}) {
  const { t } = useDashboardI18n();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("tenantsPage.dialogCreateTitle") : t("tenantsPage.dialogEditTitle")}
          </DialogTitle>
          <DialogDescription>{t("tenantsPage.slugHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                if (mode === "create") await createTenantAction(fd);
                else await updateTenantAction(fd);
                toast.success(t("tenantsPage.toastSaved"));
                onDone();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t("tenantsPage.toastSaveFail"));
              }
            });
          }}
        >
          {mode === "edit" && initial ? (
            <input type="hidden" name="id" value={initial.id} />
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="t-name">{t("tenantsPage.labelName")}</Label>
            <Input
              id="t-name"
              name="name"
              required
              defaultValue={initial?.name}
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-slug">{t("tenantsPage.labelSlug")}</Label>
            <Input
              id="t-slug"
              name="slug"
              placeholder="company-slug"
              defaultValue={initial?.slug}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("tenantsPage.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
