"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { setUserAiToolLicenseAction } from "@/app/dashboard/ai-governance/actions";

export type GovernanceUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  tools: Record<string, boolean>;
};

export type GovernanceToolCol = {
  slug: string;
  displayNameAr: string;
};

export function AiGovernanceClient({
  users,
  toolColumns,
}: {
  users: GovernanceUserRow[];
  toolColumns: GovernanceToolCol[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle(userId: string, slug: string, next: boolean) {
    start(async () => {
      const res = await setUserAiToolLicenseAction({
        targetUserId: userId,
        toolSlug: slug,
        enabled: next,
      });
      if (res.ok) {
        toast.success(next ? "تم تفعيل الأداة." : "تم إيقاف الأداة.");
      } else {
        toast.error(res.error);
      }
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-start">
            <th className="p-3 font-medium">المستخدم</th>
            <th className="p-3 font-medium">البريد</th>
            {toolColumns.map((c) => (
              <th key={c.slug} className="p-3 text-center font-medium">
                {c.displayNameAr}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border/70">
              <td className="p-3 font-medium">{u.full_name || "—"}</td>
              <td className="text-muted-foreground p-3 font-mono text-xs [direction:ltr]">
                {u.email}
              </td>
              {toolColumns.map((c) => {
                const on = Boolean(u.tools[c.slug]);
                return (
                  <td key={c.slug} className="p-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <input
                        type="checkbox"
                        className="size-4 rounded border"
                        checked={on}
                        disabled={pending}
                        onChange={(e) => toggle(u.id, c.slug, e.target.checked)}
                        aria-label={`${c.displayNameAr} لـ ${u.email}`}
                      />
                      <span className="text-muted-foreground text-[10px]">
                        {on ? "مفعّل" : "متوقف"}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground border-t border-border p-3 text-[11px] leading-relaxed">
        التغييرات تُحفظ فوراً. الموظف يرى في «ربط الأنظمة» فقط الأدوات المفعّلة له.
      </p>
    </div>
  );
}
