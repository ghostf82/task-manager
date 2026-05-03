"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  bulkUsersMembershipAction,
  deleteUsersAction,
  getRolesForTenantAction,
  inviteUserAction,
  type InviteMembershipInput,
} from "@/app/dashboard/users/actions";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export type UserAdminRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_super_admin: boolean;
  created_at: string;
  memberships_summary: string;
};

type TenantOpt = { id: string; name: string };

export function UsersAdminClient({
  users,
  tenants,
  tenantsError,
}: {
  users: UserAdminRow[];
  tenants: TenantOpt[];
  tenantsError?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const [inviteOpen, setInviteOpen] = useState(false);

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) users.forEach((u) => (next[u.id] = true));
    setSelected(next);
  }

  async function bulk(op: "suspend" | "activate" | "delete") {
    if (!selectedIds.length) {
      toast.message("لم يتم تحديد أي مستخدم");
      return;
    }
    if (op === "delete" && !confirm("سيتم حذف الحسابات المحددة نهائياً من النظام. متابعة؟")) {
      return;
    }
    startTransition(async () => {
      try {
        if (op === "delete") await deleteUsersAction(selectedIds);
        else await bulkUsersMembershipAction(selectedIds, op);
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
          <h1 className="text-2xl font-semibold tracking-tight">المستخدمين</h1>
          <p className="text-muted-foreground text-sm">
            دعوة موظفين، ربطهم بالشركات والأدوار، وإجراءات جماعية.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !selectedIds.length}
            onClick={() => void bulk("suspend")}
          >
            تعليق المحدد
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !selectedIds.length}
            onClick={() => void bulk("activate")}
          >
            تفعيل المحدد
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending || !selectedIds.length}
            onClick={() => void bulk("delete")}
          >
            <Trash2 className="size-3.5" />
            حذف المحدد
          </Button>
          <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" />
            مستخدم جديد
          </Button>
        </div>
      </div>

      {tenantsError ? (
        <p className="text-destructive text-sm">{tenantsError}</p>
      ) : null}

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    users.length > 0 && selectedIds.length === users.length
                  }
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                />
              </TableHead>
              <TableHead>البريد</TableHead>
              <TableHead className="hidden md:table-cell">الاسم</TableHead>
              <TableHead className="hidden lg:table-cell">العضويات</TableHead>
              <TableHead>نوع</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  لا يوجد مستخدمون بعد.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Checkbox
                      checked={Boolean(selected[u.id])}
                      disabled={u.is_super_admin}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({
                          ...prev,
                          [u.id]: Boolean(v),
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {u.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-md whitespace-pre-wrap text-xs text-muted-foreground lg:table-cell">
                    {u.memberships_summary}
                  </TableCell>
                  <TableCell>
                    {u.is_super_admin ? (
                      <Badge>سوبر أدمن</Badge>
                    ) : (
                      <Badge variant="secondary">موظف</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        tenants={tenants}
        onDone={() => {
          setInviteOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function InviteUserDialog({
  open,
  onOpenChange,
  tenants,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenants: TenantOpt[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [rows, setRows] = useState<
    { tenant_id: string; role_slug: string; job_title: string }[]
  >([{ tenant_id: tenants[0]?.id ?? "", role_slug: "employee", job_title: "" }]);

  useEffect(() => {
    if (open) {
      setEmail("");
      setFullName("");
      setPhone("");
      setNationalId("");
      setRows([{ tenant_id: tenants[0]?.id ?? "", role_slug: "employee", job_title: "" }]);
    }
  }, [open, tenants]);

  function addRow() {
    setRows((r) => [
      ...r,
      { tenant_id: tenants[0]?.id ?? "", role_slug: "employee", job_title: "" },
    ]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>مستخدم جديد</DialogTitle>
          <DialogDescription>
            يُنشأ الحساب بكلمة مرور افتراضية <strong>123456</strong> مع إجبار التغيير
            عند أول دخول. اربط الموظف بشركة واحدة على الأقل.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="inv-email">البريد</Label>
            <Input
              id="inv-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inv-name">الاسم الكامل</Label>
            <Input
              id="inv-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="inv-phone">الجوال</Label>
              <Input
                id="inv-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-nid">رقم الهوية</Label>
              <Input
                id="inv-nid"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>الشركات والأدوار</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                + صف
              </Button>
            </div>
            {rows.map((row, idx) => (
              <MembershipRowEditor
                key={idx}
                tenants={tenants}
                row={row}
                disabled={pending}
                onChange={(next) =>
                  setRows((prev) => {
                    const copy = [...prev];
                    copy[idx] = next;
                    return copy;
                  })
                }
              />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={pending || !tenants.length}
            onClick={() => {
              const memberships: InviteMembershipInput[] = rows
                .filter((r) => r.tenant_id)
                .map((r) => ({
                  tenant_id: r.tenant_id,
                  role_slug: r.role_slug,
                  job_title: r.job_title,
                }));
              startTransition(async () => {
                try {
                  await inviteUserAction({
                    email,
                    full_name: fullName,
                    phone: phone || undefined,
                    national_id: nationalId || undefined,
                    memberships,
                  });
                  toast.success("تم إنشاء / تحديث المستخدم");
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

function MembershipRowEditor({
  tenants,
  row,
  onChange,
  disabled,
}: {
  tenants: TenantOpt[];
  row: { tenant_id: string; role_slug: string; job_title: string };
  onChange: (next: {
    tenant_id: string;
    role_slug: string;
    job_title: string;
  }) => void;
  disabled: boolean;
}) {
  const [roles, setRoles] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    if (!row.tenant_id) {
      setRoles([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await getRolesForTenantAction(row.tenant_id);
        if (!cancelled) setRoles(r);
      } catch {
        if (!cancelled) setRoles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.tenant_id]);

  return (
    <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
      <div className="grid gap-1">
        <span className="text-muted-foreground text-xs">الشركة</span>
        <select
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          disabled={disabled}
          value={row.tenant_id}
          onChange={(e) =>
            onChange({
              ...row,
              tenant_id: e.target.value,
              role_slug: "employee",
            })
          }
        >
          <option value="">— اختر —</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <span className="text-muted-foreground text-xs">الدور</span>
        <select
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          disabled={disabled || !row.tenant_id}
          value={row.role_slug}
          onChange={(e) => onChange({ ...row, role_slug: e.target.value })}
        >
          {roles.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <span className="text-muted-foreground text-xs">المسمى الوظيفي</span>
        <Textarea
          rows={2}
          disabled={disabled}
          value={row.job_title}
          onChange={(e) => onChange({ ...row, job_title: e.target.value })}
          placeholder="مثال: محلل نظم"
        />
      </div>
    </div>
  );
}
