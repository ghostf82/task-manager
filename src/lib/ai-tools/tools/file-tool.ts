import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AIToolModule } from "@/lib/ai-tools/types";

const MAX_TEXT = 120_000;

export async function readFileContentFromUrl(url: string): Promise<
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "unsupported"; hint: string }
  | { error: string }
> {
  const u = url.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    return { error: "رابط غير صالح." };
  }
  if (u.toLowerCase().endsWith(".pdf")) {
    return {
      kind: "unsupported",
      hint: "ملفات PDF تتطلب محرك استخراج نص منفصل — ارفع نسخة نصية أو استخدم ملخصاً يدوياً.",
    };
  }

  const res = await fetch(u, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) {
    return { error: `تعذر التحميل (${res.status})` };
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text") && !ct.includes("json") && !ct.includes("javascript")) {
    return {
      kind: "unsupported",
      hint: `نوع المحتوى (${ct || "غير معروف"}) غير مدعوم للقراءة النصية المباشرة.`,
    };
  }
  let text = await res.text();
  const truncated = text.length > MAX_TEXT;
  if (truncated) text = text.slice(0, MAX_TEXT);
  return { kind: "text", text, truncated };
}

export async function uploadFilePlaceholder(fileName: string): Promise<string> {
  return `وضعية: رفع الملف «${fileName}» للتحليل سيتم عبر واجهة مخصصة لاحقاً.`;
}

export const fileAiTool: AIToolModule = {
  slug: "file",
  displayNameAr: "الملفات",
  displayNameEn: "Files",
  descriptionAr: "قراءة ملفات نصية وروابط",
  descriptionEn: "Read text files from URLs; PDF pipeline placeholder.",
  requiredCredentials: ["none"],
  functions: ["uploadFile", "readFileContent"],
  async collectInbound(_supabase: SupabaseClient, _userId: string) {
    void _supabase;
    void _userId;
    return {};
  },
};
