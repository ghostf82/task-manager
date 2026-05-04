import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AIToolModule } from "@/lib/ai-tools/types";

export type CalendarEventInput = {
  title: string;
  startIso: string;
  endIso?: string;
  description?: string;
};

/** Placeholder until Google Calendar OAuth is wired. */
export async function addEventPlaceholder(input: CalendarEventInput): Promise<string> {
  return `وضعية: سيتم إنشاء الحدث «${input.title}» عند ربط Google Calendar. البداية: ${input.startIso}`;
}

export async function listEventsPlaceholder(userId: string): Promise<string> {
  return `وضعية: لا توجد مواعيد متزامنة للمستخدم ${userId.slice(0, 8)}… — أضف تكامل Google Calendar لاحقاً.`;
}

export const calendarAiTool: AIToolModule = {
  slug: "calendar",
  displayNameAr: "التقويم",
  displayNameEn: "Calendar",
  descriptionAr: "مواعيد Google (وضعية)",
  descriptionEn: "Google Calendar integration (placeholder).",
  requiredCredentials: ["google_calendar"],
  functions: ["addEvent", "listEvents"],
  async collectInbound(_supabase: SupabaseClient, userId: string) {
    void userId;
    return {};
  },
};
