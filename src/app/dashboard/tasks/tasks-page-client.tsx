"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import {
  bulkDeleteCorporateTasksAction,
  createCorporateTaskAction,
  deleteCorporateTaskAction,
  setFollowedUpTodayAction,
  updateCorporateTaskAction,
  type CorporateTaskPayload,
} from "@/app/dashboard/tasks/actions";
import {
  daysRemaining,
  monthsRemaining,
  statusLabelsAr,
  taskRowTone,
  taskToneClasses,
  type TaskStatus,
} from "@/lib/corporate-tasks";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Textarea } from "@/components/ui/textarea";

export type TaskRow = {
  id: string;
  tenant_id: string;
  display_number: number;
  title: string;
  assignee_id: string | null;
  manager_id: string | null;
  issued_on: string;
  due_on: string;
  follow_up_on: string | null;
  followed_up_on: string | null;
  status: TaskStatus;
  completion_percent: number;
  notes: string | null;
};

type TenantOpt = { id: string; name: string; is_active: boolean };
type UserOpt = { id: string; full_name: string | null; email: string };

export function TasksPageClient({
  tasks,
  tenants,
  users,
  isSuperAdmin,
  defaultTenantId,
}: {
  tasks: TaskRow[];
  tenants: TenantOpt[];
  users: UserOpt[];
  isSuperAdmin: boolean;
  defaultTenantId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filterTenant, setFilterTenant] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [openCreate, setOpenCreate] = useState(false);
  const [editRow, setEditRow] = useState<TaskRow | null>(null);

  const userMap = useMemo(
    () =>
      Object.fromEntries(
        users.map((u) => [u.id, u.full_name?.trim() || u.email])
      ),
    [users]
  );
  const tenantMap = useMemo(
    () => Object.fromEntries(tenants.map((t) => [t.id, t.name])),
    [tenants]
  );

  const filtered = useMemo(() => {
    if (!filterTenant) return tasks;
    return tasks.filter((t) => t.tenant_id === filterTenant);
  }, [tasks, filterTenant]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const todayStr = new Date().toISOString().slice(0, 10);

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) filtered.forEach((t) => (next[t.id] = true));
    setSelected(next);
  }

  async function bulkDelete() {
    if (!selectedIds.length) {
      toast.message("لم يتم تحديد أي مهمة");
      return;
    }
    if (!confirm("حذف المهام المحددة؟")) return;
    startTransition(async () => {
      try {
        await bulkDeleteCorporateTasksAction(selectedIds);
        setSelected({});
        router.refresh();
        toast.success("تم الحذف");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "فشل الحذف");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">مهام الشركات</h1>
          <p className="text-muted-foreground text-sm">
            الحسابات التلقائية للأيام والأشهر المتبقية، والتلوين حسب الاستحقاق
            والمتابعة اليومية.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin ? (
            <select
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={filterTenant}
              onChange={(e) => setFilterTenant(e.target.value)}
            >
              <option value="">كل الشركات</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending || !selectedIds.length}
            onClick={() => void bulkDelete()}
          >
            <Trash2 className="size-3.5" />
            حذف المحدد
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!tenants.length}
            onClick={() => setOpenCreate(true)}
          >
            <Plus className="size-4" />
            مهمة جديدة
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              icon={ClipboardList}
              title="لا مهام مطابقة"
              description="جرّب تغيير فلتر الشركة أو أنشئ مهمة جديدة لتبدأ التتبع."
              action={{
                label: "مهمة جديدة",
                onClick: () => setOpenCreate(true),
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      filtered.length > 0 &&
                      selectedIds.length === filtered.length
                    }
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                  />
                </TableHead>
                <TableHead>#</TableHead>
                <TableHead className="min-w-[120px]">الشركة</TableHead>
                <TableHead className="min-w-[140px]">المهمة</TableHead>
                <TableHead>المسؤول</TableHead>
                <TableHead className="hidden xl:table-cell">إصدار</TableHead>
                <TableHead>انتهاء</TableHead>
                <TableHead className="hidden lg:table-cell">متابعة</TableHead>
                <TableHead className="min-w-[120px]">متابعة اليوم؟</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>%</TableHead>
                <TableHead className="hidden md:table-cell">أيام</TableHead>
                <TableHead className="hidden md:table-cell">أشهر</TableHead>
                <TableHead className="hidden 2xl:table-cell">ملاحظات</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
                {filtered.map((row) => {
                  const dr = daysRemaining(row.due_on);
                  const mr = monthsRemaining(row.due_on);
                  const tone = taskRowTone({
                    status: row.status,
                    dueOn: row.due_on,
                    followedUpOn: row.followed_up_on,
                  });
                  const rowClass = `${taskToneClasses[tone]} border-b`;

                  return (
                    <TableRow key={row.id} className={rowClass}>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(selected[row.id])}
                          onCheckedChange={(v) =>
                            setSelected((p) => ({
                              ...p,
                              [row.id]: Boolean(v),
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.display_number}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {tenantMap[row.tenant_id] ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate font-medium">
                        {row.title}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs">
                        {row.assignee_id
                          ? userMap[row.assignee_id] ?? "—"
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs xl:table-cell">
                        {row.issued_on}
                      </TableCell>
                      <TableCell className="text-xs">{row.due_on}</TableCell>
                      <TableCell className="hidden text-xs lg:table-cell">
                        {row.follow_up_on ?? "—"}
                      </TableCell>
                      <TableCell>
                        <select
                          className="border-input bg-background h-8 max-w-[110px] rounded-md border px-1 text-xs"
                          disabled={pending}
                          value={
                            row.followed_up_on === todayStr ? "yes" : "no"
                          }
                          onChange={(e) => {
                            const v = e.target.value as "yes" | "no";
                            startTransition(async () => {
                              try {
                                await setFollowedUpTodayAction(row.id, v);
                                router.refresh();
                                if (v === "yes") {
                                  toast.success("تم تسجيل المتابعة — أُرسل تنبيه للمدير والسوبر أدمن");
                                }
                              } catch (err) {
                                toast.error(
                                  err instanceof Error ? err.message : "فشل الحفظ"
                                );
                              }
                            });
                          }}
                        >
                          <option value="no">لا</option>
                          <option value="yes">نعم</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {statusLabelsAr[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">
                        {Number(row.completion_percent).toFixed(0)}%
                      </TableCell>
                      <TableCell className="hidden tabular-nums text-xs md:table-cell">
                        {dr}
                      </TableCell>
                      <TableCell className="hidden tabular-nums text-xs md:table-cell">
                        {mr}
                      </TableCell>
                      <TableCell className="hidden max-w-[200px] truncate text-[11px] text-muted-foreground 2xl:table-cell">
                        {row.notes ?? "—"}
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
                              className="gap-2"
                              onClick={() => setEditRow(row)}
                            >
                              <Pencil className="size-3.5" /> تعديل
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                if (!confirm("حذف هذه المهمة؟")) return;
                                startTransition(async () => {
                                  try {
                                    await deleteCorporateTaskAction(row.id);
                                    router.refresh();
                                    toast.success("تم الحذف");
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error ? err.message : "فشل"
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
                  );
                })}
            </TableBody>
          </Table>
          </div>
        )}
      </div>

      <TaskFormDialog
        mode="create"
        open={openCreate}
        onOpenChange={setOpenCreate}
        tenants={tenants}
        users={users}
        defaultTenantId={defaultTenantId}
        onDone={() => {
          setOpenCreate(false);
          router.refresh();
        }}
      />
      <TaskFormDialog
        mode="edit"
        open={Boolean(editRow)}
        onOpenChange={(o) => !o && setEditRow(null)}
        tenants={tenants}
        users={users}
        initial={editRow ?? undefined}
        defaultTenantId={defaultTenantId}
        onDone={() => {
          setEditRow(null);
          router.refresh();
        }}
      />
    </div>
  );
}

const statuses: TaskStatus[] = [
  "not_started",
  "in_progress",
  "completed",
  "on_hold",
  "cancelled",
];

function TaskFormDialog({
  mode,
  open,
  onOpenChange,
  tenants,
  users,
  initial,
  defaultTenantId,
  onDone,
}: {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenants: TenantOpt[];
  users: UserOpt[];
  initial?: TaskRow;
  defaultTenantId: string | null;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [tenantId, setTenantId] = useState(
    initial?.tenant_id ?? defaultTenantId ?? tenants[0]?.id ?? ""
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [assignee, setAssignee] = useState(initial?.assignee_id ?? "");
  const [manager, setManager] = useState(initial?.manager_id ?? "");
  const [issuedOn, setIssuedOn] = useState(initial?.issued_on ?? "");
  const [dueOn, setDueOn] = useState(initial?.due_on ?? "");
  const [followUpOn, setFollowUpOn] = useState(initial?.follow_up_on ?? "");
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? "not_started");
  const [pct, setPct] = useState(String(initial?.completion_percent ?? 0));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  useEffect(() => {
    if (!open) return;
    setTenantId(initial?.tenant_id ?? defaultTenantId ?? tenants[0]?.id ?? "");
    setTitle(initial?.title ?? "");
    setAssignee(initial?.assignee_id ?? "");
    setManager(initial?.manager_id ?? "");
    setIssuedOn(initial?.issued_on ?? "");
    setDueOn(initial?.due_on ?? "");
    setFollowUpOn(initial?.follow_up_on ?? "");
    setStatus(initial?.status ?? "not_started");
    setPct(String(initial?.completion_percent ?? 0));
    setNotes(initial?.notes ?? "");
  }, [open, initial, defaultTenantId, tenants]);

  function buildPayload(): CorporateTaskPayload {
    return {
      tenant_id:
        mode === "edit" && initial ? initial.tenant_id : tenantId,
      title,
      assignee_id: assignee || null,
      manager_id: manager || null,
      issued_on: issuedOn || undefined,
      due_on: dueOn,
      follow_up_on: followUpOn || null,
      status,
      completion_percent: Math.min(100, Math.max(0, Number(pct) || 0)),
      notes: notes || null,
    };
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "مهمة جديدة" : "تعديل مهمة"}
          </DialogTitle>
          <DialogDescription>
            يتم حساب الأيام والأشهر المتبقية تلقائياً من تاريخ الانتهاء.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {mode === "create" ? (
            <div className="grid gap-2">
              <Label>الشركة</Label>
              <select
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                disabled={pending}
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              الشركة:{" "}
              <strong>
                {tenants.find((x) => x.id === initial?.tenant_id)?.name ?? "—"}
              </strong>
            </p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="tk-title">اسم المهمة</Label>
            <Input
              id="tk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
              required
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>المسؤول</Label>
              <select
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                disabled={pending}
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>المدير (للتنبيه)</Label>
              <select
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                disabled={pending}
                value={manager}
                onChange={(e) => setManager(e.target.value)}
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label htmlFor="tk-issued">إصدار</Label>
              <Input
                id="tk-issued"
                type="date"
                value={issuedOn}
                onChange={(e) => setIssuedOn(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="tk-due">انتهاء</Label>
              <Input
                id="tk-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="tk-fu">متابعة</Label>
              <Input
                id="tk-fu"
                type="date"
                value={followUpOn}
                onChange={(e) => setFollowUpOn(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>الحالة</Label>
              <select
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                value={status}
                disabled={pending}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabelsAr[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="tk-pct">نسبة الإنجاز</Label>
              <Input
                id="tk-pct"
                type="number"
                min={0}
                max={100}
                step={1}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="tk-notes">ملاحظات</Label>
            <Textarea
              id="tk-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                try {
                  const payload = buildPayload();
                  if (mode === "create") {
                    await createCorporateTaskAction(payload);
                  } else if (initial) {
                    await updateCorporateTaskAction(initial.id, payload);
                  }
                  toast.success("تم الحفظ");
                  onDone();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "فشل الحفظ");
                }
              });
            }}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
