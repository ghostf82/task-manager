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
    if (checked) tenants.forEach((t) => (next[t.id] = true));
    setSelected(next);
  }

  async function run(op: "activate" | "deactivate" | "delete") {
    if (!selectedIds.length) {
      toast.message("لم يتم تحديد أي شركة");
      return;
    }
    if (op === "delete" && !confirm("سيتم حذف الشركات المحددة وجميع البيانات المرتبطة. متابعة؟")) {
      return;
    }
    startTransition(async () => {
      try {
        await bulkTenantsAction(selectedIds, op);
        setSelected({});
        router.refresh();
        toast.success("تم تنفيذ الإجراء");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "فشل الإجراء");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">الشركات</h1>
          <p className="text-muted-foreground text-sm">
            إضافة وتعديل الشركات، مع إجراءات جماعية.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !selectedIds.length}
            onClick={() => void run("deactivate")}
          >
            تعطيل المحدد
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !selectedIds.length}
            onClick={() => void run("activate")}
          >
            تفعيل المحدد
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending || !selectedIds.length}
            onClick={() => void run("delete")}
          >
            حذف المحدد
          </Button>
          <Button type="button" size="sm" onClick={() => setOpenCreate(true)}>
            <Plus className="size-4" />
            شركة جديدة
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
              <TableHead>الاسم</TableHead>
              <TableHead className="hidden sm:table-cell">المعرّف</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="w-28 text-end">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  لا توجد شركات بعد.
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Checkbox
                      checked={Boolean(selected[t.id])}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({
                          ...prev,
                          [t.id]: Boolean(v),
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                    {t.slug}
                  </TableCell>
                  <TableCell>
                    {t.is_active ? (
                      <Badge variant="secondary">نشطة</Badge>
                    ) : (
                      <Badge variant="outline">معطّلة</Badge>
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
                          onClick={() => setEditRow(t)}
                          className="gap-2"
                        >
                          <Pencil className="size-3.5" /> تعديل
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await setTenantActiveAction(t.id, !t.is_active);
                                router.refresh();
                                toast.success("تم تحديث الحالة");
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "فشل التحديث"
                                );
                              }
                            })
                          }
                        >
                          {t.is_active ? "تعطيل" : "تفعيل"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            if (!confirm("حذف هذه الشركة نهائياً؟")) return;
                            startTransition(async () => {
                              try {
                                await deleteTenantAction(t.id);
                                router.refresh();
                                toast.success("تم الحذف");
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "فشل الحذف"
                                );
                              }
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" /> حذف
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
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "شركة جديدة" : "تعديل شركة"}
          </DialogTitle>
          <DialogDescription>
            المعرّف (slug) يستخدم أحرفاً لاتينية صغيرة وأرقاماً وشرطات فقط.
          </DialogDescription>
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
                toast.success("تم الحفظ");
                onDone();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "فشل الحفظ");
              }
            });
          }}
        >
          {mode === "edit" && initial ? (
            <input type="hidden" name="id" value={initial.id} />
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="t-name">اسم الشركة</Label>
            <Input
              id="t-name"
              name="name"
              required
              defaultValue={initial?.name}
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-slug">المعرّف (اختياري)</Label>
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
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
