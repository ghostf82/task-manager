import "server-only";

import { emailAiTool } from "@/lib/ai-tools/tools/email";
import { odooAiTool } from "@/lib/ai-tools/tools/odoo";
import type { AIToolModule } from "@/lib/ai-tools/types";

const bySlug = new Map<string, AIToolModule>([
  [odooAiTool.slug, odooAiTool],
  [emailAiTool.slug, emailAiTool],
]);

/** Stable order for scan / governance columns. */
const ORDER = [odooAiTool.slug, emailAiTool.slug] as const;

export function getRegisteredAiTools(): AIToolModule[] {
  return ORDER.map((s) => bySlug.get(s)).filter((x): x is AIToolModule => Boolean(x));
}

export function getRegisteredToolSlugs(): string[] {
  return [...ORDER];
}

export function getAiToolBySlug(slug: string): AIToolModule | undefined {
  return bySlug.get(slug);
}
