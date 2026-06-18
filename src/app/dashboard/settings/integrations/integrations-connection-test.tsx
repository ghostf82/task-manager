"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  testEmailConnectionAction,
  testOdooConnectionAction,
} from "@/app/dashboard/settings/integrations/actions";
import { Button } from "@/components/ui/button";

function readCheckbox(fd: FormData, name: string) {
  return fd.get(name) === "on";
}

export function OdooConnectionTestButton({
  formId,
  testLabel,
  formMissingMessage,
  onResult,
}: {
  formId: string;
  testLabel: string;
  formMissingMessage: string;
  onResult?: (res: { ok: boolean; message: string }) => void;
}) {
  const [pending, start] = useTransition();

  function runTest() {
    const el = document.getElementById(formId) as HTMLFormElement | null;
    if (!el) {
      toast.error(formMissingMessage);
      return;
    }
    const fd = new FormData(el);
    start(async () => {
      try {
        const res = await testOdooConnectionAction({
          login_username: String(fd.get("login_username") ?? ""),
          password: String(fd.get("password") ?? ""),
        });
        onResult?.(res);
        if (res.ok) {
          toast.success(res.message);
        } else {
          toast.error(res.message);
        }
      } catch {
        const msg = "تعذر إكمال فحص اتصال Odoo حالياً. أعد المحاولة خلال ثوانٍ.";
        onResult?.({ ok: false, message: msg });
        toast.error(msg);
      }
    });
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={runTest}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {testLabel}
    </Button>
  );
}

export function OdooSavedConnectionTestButton({
  loginUsername,
  testLabel,
  onResult,
}: {
  loginUsername: string;
  testLabel: string;
  onResult?: (res: { ok: boolean; message: string }) => void;
}) {
  const [pending, start] = useTransition();

  function runTest() {
    start(async () => {
      try {
        const res = await testOdooConnectionAction({
          login_username: loginUsername,
          password: "",
        });
        onResult?.(res);
        if (res.ok) {
          toast.success(res.message);
        } else {
          toast.error(res.message);
        }
      } catch {
        const msg = "تعذر إكمال فحص اتصال Odoo حالياً. أعد المحاولة خلال ثوانٍ.";
        onResult?.({ ok: false, message: msg });
        toast.error(msg);
      }
    });
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={runTest}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {testLabel}
    </Button>
  );
}

export function PendingSubmitButton({
  label,
  pendingLabel,
  variant = "default",
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  return (
    <Button type="submit" variant={variant} disabled={isDisabled} aria-busy={pending}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function EmailConnectionTestButton({
  formId,
  testLabel,
  formMissingMessage,
}: {
  formId: string;
  testLabel: string;
  formMissingMessage: string;
}) {
  const [pending, start] = useTransition();

  function runTest() {
    const el = document.getElementById(formId) as HTMLFormElement | null;
    if (!el) {
      toast.error(formMissingMessage);
      return;
    }
    const fd = new FormData(el);
    const imapPort = Number(fd.get("imap_port"));
    const smtpPort = Number(fd.get("smtp_port"));
    start(async () => {
      try {
        const res = await testEmailConnectionAction({
          imap_host: String(fd.get("imap_host") ?? ""),
          imap_port: Number.isFinite(imapPort) ? imapPort : 993,
          imap_use_tls: readCheckbox(fd, "imap_use_tls"),
          imap_username: String(fd.get("imap_username") ?? ""),
          imap_password: String(fd.get("imap_password") ?? ""),
          smtp_host: String(fd.get("smtp_host") ?? ""),
          smtp_port: Number.isFinite(smtpPort) ? smtpPort : 465,
          smtp_use_tls: readCheckbox(fd, "smtp_use_tls"),
          smtp_username: String(fd.get("smtp_username") ?? ""),
          smtp_password: String(fd.get("smtp_password") ?? ""),
        });
        if (res.ok) {
          toast.success(res.message);
        } else {
          toast.error(res.message);
        }
      } catch {
        toast.error("تعذر إكمال فحص البريد حالياً. أعد المحاولة خلال ثوانٍ.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={runTest}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {testLabel}
    </Button>
  );
}
