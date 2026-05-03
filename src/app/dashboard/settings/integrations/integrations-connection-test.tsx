"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
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
    start(async () => {
      const res = await testOdooConnectionAction({
        base_url: String(fd.get("base_url") ?? ""),
        database_name: String(fd.get("database_name") ?? ""),
        login_username: String(fd.get("login_username") ?? ""),
        password: String(fd.get("password") ?? ""),
      });
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
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
    });
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={runTest}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {testLabel}
    </Button>
  );
}
