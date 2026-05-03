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
  const { t } = useDashboardI18n();
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
      toast.message(t("usersPage.toastNoSelection"));
      return;
    }
    if (op === "delete" && !confirm(t("usersPage.confirmBulkDelete"))) {
      return;
    }
    startTransition(async () => {
      try {
        if (op === "delete") await deleteUsersAction(selectedIds);
        else await bulkUsersMembershipAction(selectedIds, op);
        setSelected({});
        router.refresh();
        toast.success(t("usersPage.toastOpOk"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("usersPage.toastOpFail"));
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("usersPage.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("usersPage.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !selectedIds.length}
            onClick={() => void bulk("suspend")}
          >
            {t("usersPage.suspendSelected")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !selectedIds.length}
            onClick={() => void bulk("activate")}
          >
            {t("usersPage.activateSelected")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending || !selectedIds.length}
            onClick={() => void bulk("delete")}
          >
            <Trash2 className="size-3.5" />
            {t("usersPage.deleteSelected")}
          </Button>
          <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" />
            {t("usersPage.newUser")}
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
              <TableHead>{t("usersPage.tableEmail")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("usersPage.tableName")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("usersPage.tableMemberships")}</TableHead>
              <TableHead>{t("usersPage.tableType")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("usersPage.empty")}
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
                      <Badge>{t("usersPage.badgeSuper")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("usersPage.badgeStaff")}</Badge>
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
  const { t } = useDashboardI18n();
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
          <DialogTitle>{t("usersPage.inviteTitle")}</DialogTitle>
          <DialogDescription>
            {t("usersPage.inviteDescriptionBefore")}
            <strong>123456</strong>
            {t("usersPage.inviteDescriptionAfter")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="inv-email">{t("usersPage.labelEmail")}</Label>
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
            <Label htmlFor="inv-name">{t("usersPage.labelFullName")}</Label>
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
              <Label htmlFor="inv-phone">{t("usersPage.labelPhone")}</Label>
              <Input
                id="inv-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-nid">{t("usersPage.labelNationalId")}</Label>
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
              <Label>{t("usersPage.membershipsTitle")}</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                {t("usersPage.addRow")}
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
                  toast.success(t("usersPage.toastSaved"));
                  onDone();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("usersPage.toastSaveFail"));
                }
              });
            }}
          >
            {t("usersPage.save")}
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
  const { t } = useDashboardI18n();
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
        <span className="text-muted-foreground text-xs">{t("usersPage.companyShort")}</span>
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
          <option value="">{t("usersPage.selectPlaceholder")}</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <span className="text-muted-foreground text-xs">{t("usersPage.roleShort")}</span>
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
        <span className="text-muted-foreground text-xs">{t("usersPage.jobTitleShort")}</span>
        <Textarea
          rows={2}
          disabled={disabled}
          value={row.job_title}
          onChange={(e) => onChange({ ...row, job_title: e.target.value })}
          placeholder={t("usersPage.jobTitlePlaceholder")}
        />
      </div>
    </div>
  );
}
