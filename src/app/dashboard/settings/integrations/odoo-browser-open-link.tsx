"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  baseUrl: string;
  label: string;
};

function buildOpenUrl(baseUrl: string): string {
  let normalized = String(baseUrl ?? "").trim().replace(/\/+$/g, "");
  if (!normalized) return "#";
  normalized = normalized.replace(/(?:\/odoo)+$/i, "/odoo");
  if (/\/odoo$/i.test(normalized)) return normalized;
  return `${normalized}/odoo`;
}

export function OdooBrowserOpenLink({ baseUrl, label }: Props) {
  const href = buildOpenUrl(baseUrl);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "outline" }), "h-8")}
    >
      {label}
    </a>
  );
}
