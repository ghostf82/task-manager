import "server-only";

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AI_CHAT_TOOLS_OPENAI,
  executeAiChatTool,
  type ChatToolContext,
  type CreatedProposalInfo,
} from "@/lib/ai-chat/chat-tools";
import { appendConversationMemory, getRecentMemory } from "@/lib/ai-agent/conversation-memory";
import { analyzeIntent } from "@/lib/ai-agent/planning-engine";
import { callLLM, buildExecutiveSystemPrompt } from "@/lib/ai/llm-unified";
import { getRegisteredAiTools } from "@/lib/ai-tools/registry";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { normalizeProposedAction } from "@/lib/ai/llm-proposal-normalize";
import {
  fetchAiChatHistory,
  insertAiChatMessage,
  isLegacyAiChatSessionId,
  resolveAiChatSessionId,
  touchAiChatSession,
} from "@/lib/ai-chat/session-compat";
import { resolveGroqApiKey, resolveOpenAiApiKey } from "@/lib/ai/llm-env";

const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 40;
const OPEN_TASK_STATUSES = ["not_started", "in_progress", "on_hold"] as const;

function createChatToolClient(): OpenAI | null {
  const gq = resolveGroqApiKey();
  if (gq) {
    return new OpenAI({
      apiKey: gq,
      baseURL: "https://api.groq.com/openai/v1",
      timeout: 20_000,
    });
  }
  const oa = resolveOpenAiApiKey();
  if (oa) {
    return new OpenAI({ apiKey: oa, timeout: 20_000 });
  }
  return null;
}

function chatToolModel(): string {
  if (resolveGroqApiKey()) {
    return process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
  }
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function buildSystemPrompt(input: {
  todayStr: string;
  licensedSlugs: string[];
  tenantNames: string[];
  intentHint: string;
  proactiveContext: string;
}): string {
  const reg = getRegisteredAiTools()
    .map(
      (t) =>
        `- ${t.slug} (${t.displayNameAr} / ${t.displayNameEn}): ${t.descriptionEn ?? t.descriptionAr}`
    )
    .join("\n");

  const tools =
    input.licensedSlugs.length > 0
      ? input.licensedSlugs.join(", ")
      : "لا توجد أدوات خارجية مفعّلة (Odoo/Email)";

  const tenants =
    input.tenantNames.length > 0
      ? input.tenantNames.join("، ")
      : "لا شركات مرتبطة بالحساب";

  return `أنت الوكيل التنفيذي لشركة أبناء صالح المديفر القابضة. أنت لست مجرد برنامج، أنت عقل مفكر ومنفذ. ردودك يجب أن تكون حازمة، ذكية، استباقية، ولبقة جداً.
تاريخ اليوم (UTC): ${input.todayStr}
الشركات ضمن نطاق صلاحية المستخدم: ${tenants}
الأدوات الخارجية المصرّح بها لهذا المستخدم: ${tools}
تصنيف النية الحالي: ${input.intentHint}
سياق استباقي موجز: ${input.proactiveContext}
الأدوات المسجّلة في النظام (للمرجعية فقط — التنفيذ الفعلي يمر عبر مقترحات):
${reg}

قواعد:
- ابدأ دائماً بفهم القصد قبل التنفيذ: حدّد هل الطلب (سؤال عام / تحليل / تنفيذ) ثم قرر إن كانت الأداة مطلوبة.
- إذا كان السؤال عاماً أو تحية (مثل: كيف حالك؟ ماذا تفعل؟) أجب مباشرة بأسلوب تنفيذي لبق دون أي استدعاء أدوات.
- لقراءة المستندات استخدم list_company_documents فقط عندما يكون الطلب عن تراخيص/مستندات/انتهاء.
- لقراءة المهام استخدم list_corporate_tasks فقط عندما يكون الطلب عن مهام/أعمال/متابعة.
- لا تستدعِ أدوات متعددة بلا حاجة. اختر أقل عدد أدوات يحقق الدقة.
- أي إجراء تنفيذي (بريد، Odoo، إنشاء مهمة شركة) يجب أن يمر عبر دالة create_pending_proposal فقط — لا تدّعي التنفيذ الفوري.
- أبلغ المستخدم بخطوات التنفيذ قبل أي إجراء حساس واطلب الموافقة عبر المقترحات في الواجهة.
- احترم نطاق الشركات: لا تفترض بيانات خارج ما يعيده النظام (RLS).
- عند عرض نتائج فعلية، صِغ العبارة بهذه الروح: "بناءً على صلاحياتك..." أو "ضمن نطاق صلاحياتك...".
- بعد أي تنفيذ ناجح/تحديث بيانات: أعطِ تأكيداً تنفيذياً واضحاً في سطر قصير، واذكر النتيجة النهائية فقط (لا تُعد سرد كل البيانات إلا عند الطلب).
- نسّق الردود باحتراف باستخدام Markdown (عناوين قصيرة، قوائم، جدول عند مقارنة عناصر متعددة).
- اجعل كل رد يبدأ بتمهيد لبق قصير وينتهي بخطوة تالية مقترحة أو سؤال متابعة واضح.`;
}

function isGeneralConversation(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    "كيف حالك",
    "شلونك",
    "هلا",
    "مرحبا",
    "السلام",
    "من انت",
    "ماذا تفعل",
    "ايش تسوي",
    "what can you do",
    "who are you",
    "hello",
    "hi",
  ];
  return patterns.some((p) => t.includes(p));
}

function pickToolsByIntent(intent: string, userText: string): typeof AI_CHAT_TOOLS_OPENAI {
  const low = userText.toLowerCase();
  const aboutDocuments =
    low.includes("مستند") ||
    low.includes("ترخيص") ||
    low.includes("وثيقة") ||
    low.includes("انتهاء") ||
    low.includes("expiry") ||
    low.includes("document");
  const aboutTasks =
    low.includes("مهمة") ||
    low.includes("مهام") ||
    low.includes("task") ||
    low.includes("tasks") ||
    low.includes("متابعة");

  if (aboutDocuments && !aboutTasks) {
    return AI_CHAT_TOOLS_OPENAI.filter((t) => t.function.name !== "list_corporate_tasks");
  }
  if (aboutTasks && !aboutDocuments) {
    return AI_CHAT_TOOLS_OPENAI.filter((t) => t.function.name !== "list_company_documents");
  }
  if (intent === "check_odoo_tasks" || intent === "create_task" || intent === "update_task") {
    return AI_CHAT_TOOLS_OPENAI.filter((t) => t.function.name !== "list_company_documents");
  }
  if (intent === "read_excel" || intent === "write_excel" || intent === "read_email" || intent === "reply_email") {
    return AI_CHAT_TOOLS_OPENAI;
  }
  return AI_CHAT_TOOLS_OPENAI;
}

function gracefulProviderFailure(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("504")) {
    return "تعذّر إكمال الطلب في الوقت المحدد بسبب ازدحام الشبكة أو المزود. يمكنك إعادة المحاولة الآن، وسأتابع بأسرع مسار ممكن.";
  }
  if (msg.includes("429")) {
    return "المزوّد وصل إلى حدّ المعدل/الحصة حالياً. أعد المحاولة بعد لحظات أو فعّل مزوداً احتياطياً (Groq/OpenAI) لتقليل الانقطاع.";
  }
  return "حدث تعثر مؤقت أثناء الاتصال بالمزوّد. أعد المحاولة، وإن تكرر الأمر سأحوّل المسار إلى بديل أكثر استقراراً.";
}

async function runOpenAiToolFallback(
  messages: ChatCompletionMessageParam[]
): Promise<string | null> {
  const oa = resolveOpenAiApiKey();
  if (!oa) return null;
  const backup = new OpenAI({ apiKey: oa, timeout: 20_000 });
  const completion = await backup.chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    messages,
    tools: AI_CHAT_TOOLS_OPENAI,
    tool_choice: "auto",
    temperature: 0.3,
  });
  return (completion.choices[0]?.message?.content ?? "").trim() || null;
}

function normalizeDateToIso(input: string): string | null {
  const raw = input.trim();
  const ymd = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
    }
  }
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
    }
  }
  return null;
}

function requestedExpiryIso(userText: string): string | null {
  const match = userText.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
  if (!match) return null;
  return normalizeDateToIso(match[1]);
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function requestedRelativeDays(userText: string): number | null {
  const m = userText.match(/بعد\s+(\d{1,3})\s*(?:يوم|ايام|أيام|day|days)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 3650) return null;
  return n;
}

function isDocumentExpiryChangeIntent(userText: string): boolean {
  const t = userText.toLowerCase();
  const asksChange =
    t.includes("تمديد") ||
    t.includes("جدد") ||
    t.includes("تجديد") ||
    t.includes("حدث") ||
    t.includes("تحديث") ||
    t.includes("update") ||
    t.includes("extend");
  const isDocument =
    t.includes("مستند") ||
    t.includes("سجل") ||
    t.includes("وثيقة") ||
    t.includes("document");
  const mentionsExpiry = t.includes("انتهاء") || t.includes("صلاحية") || t.includes("expiry");
  return asksChange && isDocument && mentionsExpiry;
}

function normalizedForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function isTaskCreateIntent(userText: string): boolean {
  const t = userText.toLowerCase();
  const hasCreate =
    t.includes("انش") || t.includes("أنش") || t.includes("سوي") || t.includes("اعمل") || t.includes("create");
  const hasTask = t.includes("مهم") || t.includes("task");
  return hasCreate && hasTask;
}

function isOdooTaskIntent(userText: string): boolean {
  const t = userText.toLowerCase();
  return (
    (t.includes("odoo") || t.includes("أودو") || t.includes("اودو")) &&
    (t.includes("مهمة") || t.includes("task") || t.includes("مهام"))
  );
}

function extractTaskTitle(userText: string): string | null {
  const m1 = userText.match(/(?:باسم|اسمها|بعنوان)\s+([^\n،,.]{3,120})/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = userText.match(/مهمة(?:\s+جديدة)?\s+([^\n،,.]{3,120})/i);
  if (m2?.[1]) return m2[1].trim();
  return null;
}

function parseArabicReminderDateTime(userText: string, now: Date): { iso: string; label: string } | null {
  const hasToday = /اليوم/i.test(userText);
  const timeMatch = userText.match(/(\d{1,2})\s*[:كk٫.]\s*(\d{1,2})/i);
  if (!hasToday || !timeMatch) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  const lower = userText.toLowerCase();
  const isPm = /ظهر|ظهرا|pm|مساء|عصر/.test(lower);
  const isAm = /صباح|am/.test(lower);
  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  const when = new Date(now);
  when.setHours(hour, minute, 0, 0);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return { iso: when.toISOString(), label: `${hh}:${mm}` };
}

const sseEncoder = new TextEncoder();

/** SSE line as strict UTF-8 bytes (never pass raw strings into byte stream controllers). */
function encodeSse(obj: unknown): Uint8Array {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  return sseEncoder.encode(line);
}

/**
 * Split assistant text so each chunk is ≤ maxUtf8Bytes when encoded as UTF-8,
 * without splitting a single Unicode scalar value (avoids lone surrogates / broken UTF-8 edges).
 */
function utf8SafeTextChunks(text: string, maxUtf8Bytes: number): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    const trial = buf + ch;
    if (enc.encode(trial).length <= maxUtf8Bytes) {
      buf = trial;
      continue;
    }
    if (buf) {
      out.push(buf);
    }
    buf = ch;
    if (enc.encode(buf).length > maxUtf8Bytes) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

export async function handleAiChatPost(params: {
  supabase: SupabaseClient;
  userId: string;
  content: string;
  sessionId?: string | null;
}): Promise<Response> {
  const text = params.content.trim();
  if (!text || text.length > 12000) {
    return new Response(JSON.stringify({ error: "نص غير صالح" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  let chatSessionId: string;
  try {
    chatSessionId = await resolveAiChatSessionId(
      params.supabase,
      params.userId,
      params.sessionId
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "session error" }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  const { error: insUserErr } = await insertAiChatMessage(params.supabase, {
    user_id: params.userId,
    session_id: chatSessionId,
    role: "user",
    body: text,
    metadata: { source: "chat" },
  });
  if (insUserErr) {
    return new Response(JSON.stringify({ error: insUserErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  await appendConversationMemory(params.supabase, {
    userId: params.userId,
    sessionId: "ai_chat",
    role: "user",
    content: text,
    metadata: { source: "chat" },
  });

  const { data: me } = await params.supabase
    .from("users")
    .select("is_super_admin,email")
    .eq("id", params.userId)
    .maybeSingle();
  const isSuperAdmin = Boolean(me?.is_super_admin);

  let licensedSlugs = await getLicensedActiveToolSlugs(params.supabase, params.userId);
  if (isSuperAdmin && !licensedSlugs.length) {
    licensedSlugs = getRegisteredAiTools().map((t) => t.slug);
  }

  const { data: memberships } = await params.supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants ( name )")
    .eq("user_id", params.userId)
    .eq("status", "active");

  let tenantIds = [...new Set((memberships ?? []).map((m) => m.tenant_id as string))];
  const tenantNames: string[] = [];
  for (const m of memberships ?? []) {
    const t = m.tenants as { name?: string } | { name?: string }[] | null;
    const n = Array.isArray(t) ? t[0]?.name : t?.name;
    if (n) tenantNames.push(String(n));
  }
  if (isSuperAdmin && !tenantIds.length) {
    const { data: allTenants } = await params.supabase
      .from("tenants")
      .select("id,name")
      .order("name", { ascending: true })
      .limit(200);
    tenantIds = [...new Set((allTenants ?? []).map((t) => String(t.id)))];
    for (const t of allTenants ?? []) {
      if (t.name) tenantNames.push(String(t.name));
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const fastTrackTaskCreate = isTaskCreateIntent(text);
  if (fastTrackTaskCreate) {
    const title = extractTaskTitle(text);
    if (!title) {
      return streamAssistantResponse(
        params.supabase,
        params.userId,
        chatSessionId,
        "فهمت نية إنشاء مهمة، لكن عنوان المهمة غير واضح. اكتبها مثلاً: `أنشئ مهمة باسم مراجعة الجوازات`.",
        [],
        [],
        { source: "chat", fast_track: "task_missing_title" }
      );
    }
    const tenantId = tenantIds[0] ?? null;
    const wantsOdooTask = isOdooTaskIntent(text);
    if (!tenantId) {
      return streamAssistantResponse(
        params.supabase,
        params.userId,
        chatSessionId,
        "لا أستطيع إنشاء مهمة الآن لأنه لا توجد شركة مرتبطة بصلاحيات حسابك. اربط شركة أولاً ثم أتابع معك فوراً.",
        [],
        [],
        { source: "chat", fast_track: "task_missing_tenant" }
      );
    }
    const dueOn = todayStr;
    const reminder = parseArabicReminderDateTime(text, now);
    const taskAction = normalizeProposedAction(
      wantsOdooTask
        ? {
            type: "odoo_create_task",
            title,
            description: reminder
              ? `تذكير مطلوب اليوم ${reminder.label} (تحليل تلقائي من نص المستخدم).`
              : null,
          }
        : {
            type: "create_corporate_task",
            tenantId,
            title,
            dueOn,
            notes: reminder
              ? `مطلوب تذكير اليوم ${reminder.label} (محلّل تلقائياً من عبارة المستخدم).`
              : null,
          }
    );
    const taskProposalIds: string[] = [];
    const taskProposals: CreatedProposalInfo[] = [];
    if (taskAction.type === "create_corporate_task" || taskAction.type === "odoo_create_task") {
      const { data: taskIns, error: taskErr } = await params.supabase
        .from("ai_agent_proposals")
        .insert({
          user_id: params.userId,
          tenant_id: wantsOdooTask ? null : tenantId,
          kind: wantsOdooTask ? "odoo_sync" : "task_create",
          title: wantsOdooTask ? `إنشاء مهمة Odoo: ${title}` : `إنشاء مهمة: ${title}`,
          summary: wantsOdooTask
            ? `إنشاء مهمة جديدة في Odoo بعنوان «${title}».`
            : `إنشاء مهمة جديدة بعنوان «${title}» بتاريخ استحقاق ${dueOn}.`,
          detail_json: { source: "chat_fast_track", created_via: "task_create_request" },
          proposed_action: taskAction as unknown as Record<string, unknown>,
          status: "pending",
        })
        .select("id")
        .single();
      if (!taskErr && taskIns?.id) {
        taskProposalIds.push(String(taskIns.id));
        taskProposals.push({
          id: String(taskIns.id),
            title: wantsOdooTask ? `إنشاء مهمة Odoo: ${title}` : `إنشاء مهمة: ${title}`,
            summary: wantsOdooTask
              ? `إنشاء مهمة Odoo جديدة بعنوان «${title}».`
              : `إنشاء مهمة جديدة بعنوان «${title}».`,
        });
      }
    }
    if (reminder) {
      const remAction = normalizeProposedAction({
        type: "create_personal_reminder",
        title: `تذكير: ${title}`,
        remindAt: reminder.iso,
        recurrence: "once",
        soundEnabled: true,
        emailEnabled: false,
      });
      if (remAction.type === "create_personal_reminder") {
        const { data: remIns, error: remErr } = await params.supabase
          .from("ai_agent_proposals")
          .insert({
            user_id: params.userId,
            tenant_id: null,
            kind: "generic",
            title: `إنشاء تذكير: ${title}`,
            summary: `تذكير اليوم عند ${reminder.label} للمهمة «${title}».`,
            detail_json: { source: "chat_fast_track", created_via: "task_reminder_request" },
            proposed_action: remAction as unknown as Record<string, unknown>,
            status: "pending",
          })
          .select("id")
          .single();
        if (!remErr && remIns?.id) {
          taskProposalIds.push(String(remIns.id));
          taskProposals.push({
            id: String(remIns.id),
            title: `إنشاء تذكير: ${title}`,
            summary: `تذكير اليوم عند ${reminder.label}.`,
          });
        }
      }
    }
    if (taskProposalIds.length > 0) {
      const final =
        `تم استيعاب طلبك مباشرة وجهّزت مقترحات تنفيذ جاهزة للموافقة:\n\n` +
        `- **المهمة:** ${title}\n` +
        `- **الاستحقاق:** ${dueOn}\n` +
        (reminder ? `- **التذكير:** اليوم ${reminder.label}\n` : "- **التذكير:** غير محدد بوقت واضح\n") +
        `\nبمجرد اعتمادك للمقترحات، سيتم التنفيذ فوراً مع رسالة تأكيد نهائية واضحة.`;
      return streamAssistantResponse(
        params.supabase,
        params.userId,
        chatSessionId,
        final,
        taskProposalIds,
        taskProposals,
        { source: "chat", fast_track: "task_create_proposal" }
      );
    }
  }

  const fastTrackDocumentChange = isDocumentExpiryChangeIntent(text) || requestedRelativeDays(text) !== null;
  if (fastTrackDocumentChange) {
    const { data: docs, error: docsErr } = await params.supabase
      .from("company_documents")
      .select("id, tenant_id, document_name, document_number, expiry_date, tenants ( name )")
      .order("expiry_date", { ascending: true })
      .limit(40);
    if (!docsErr && docs?.length) {
      const hay = normalizedForMatch(text);
      const matched =
        docs.find((d) => hay.includes(normalizedForMatch(String(d.document_name ?? "")))) ||
        docs.find((d) => hay.includes(normalizedForMatch(String(d.document_number ?? "")))) ||
        docs[0];
      if (matched?.id && matched.tenant_id) {
        const absolute = requestedExpiryIso(text);
        const relDays = requestedRelativeDays(text);
        const newExpiry = absolute ?? (relDays !== null ? addDaysIso(todayStr, relDays) : null);
        if (!newExpiry) {
          return streamAssistantResponse(
            params.supabase,
            params.userId,
            chatSessionId,
            "أفهم طلب التحديث، لكن التاريخ الجديد غير واضح بعد. اكتب التاريخ بصيغة `YYYY-MM-DD` أو حدده بصيغة `بعد 7 أيام` لأجهّز المقترح فوراً.",
            [],
            [],
            { source: "chat", fast_track: "document_expiry_missing_date" }
          );
        }
        const title = `تمديد صلاحية مستند: ${String(matched.document_name)}`;
        const summary = `طلب تحديث تاريخ الانتهاء من ${String(matched.expiry_date)} إلى ${newExpiry}.`;
        const proposedAction = normalizeProposedAction({
          type: "update_company_document_expiry",
          documentId: String(matched.id),
          tenantId: String(matched.tenant_id),
          documentName: String(matched.document_name),
          oldExpiry: String(matched.expiry_date),
          newExpiry,
        });
        if (proposedAction.type === "update_company_document_expiry") {
          const { data: ins, error: insErr } = await params.supabase
            .from("ai_agent_proposals")
            .insert({
              user_id: params.userId,
              tenant_id: matched.tenant_id as string,
              kind: "generic",
              title,
              summary,
              detail_json: {
                source: "chat_fast_track",
                created_via: "document_expiry_request",
              },
              proposed_action: proposedAction as unknown as Record<string, unknown>,
              status: "pending",
            })
            .select("id")
            .single();

          if (!insErr && ins?.id) {
            const { count: relatedOpenTasks } = await params.supabase
              .from("corporate_tasks")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", matched.tenant_id as string)
              .in("status", [...OPEN_TASK_STATUSES]);
            const tenant = Array.isArray(matched.tenants)
              ? matched.tenants[0]?.name
              : (matched.tenants as { name?: string } | null)?.name;
            const proposal: CreatedProposalInfo = {
              id: ins.id as string,
              title,
              summary,
            };
            const final =
              `تم، جهّزت لك مقترح تحديث احترافي وجاهز للموافقة.\n\n` +
              `- **المستند:** ${String(matched.document_name)} (${String(matched.document_number ?? "—")})\n` +
              `- **الشركة:** ${tenant ?? "—"}\n` +
              `- **من:** ${String(matched.expiry_date)}\n` +
              `- **إلى:** ${newExpiry}${relDays !== null ? ` (بعد ${relDays} أيام من اليوم)` : ""}\n` +
              `- **مهام مفتوحة بنفس الشركة:** ${relatedOpenTasks ?? 0}\n\n` +
              `بعد اعتمادك للمقترح سأؤكد لك التنفيذ بجملة واضحة ومباشرة دون إعادة سرد مطوّل.`;
            return streamAssistantResponse(
              params.supabase,
              params.userId,
              chatSessionId,
              final,
              [proposal.id],
              [proposal],
              { source: "chat", fast_track: "document_expiry_proposal" }
            );
          }
        }
      }
    }
  }

  const memRows = await getRecentMemory(params.supabase, params.userId, "ai_chat", 10);
  const plan = analyzeIntent(text, {
    recentUserPhrases: memRows.filter((r) => r.role === "user").map((r) => r.content),
    licensedToolSlugs: licensedSlugs,
    tenantNames,
  });
  const generalMode = isGeneralConversation(text);

  const { data: expiringDocs } = await params.supabase
    .from("company_documents")
    .select("tenant_id, document_name, document_number, expiry_date, tenants ( name )")
    .order("expiry_date", { ascending: true })
    .limit(5);
  const proactiveRows: string[] = [];
  for (const d of expiringDocs ?? []) {
    const tenant = Array.isArray(d.tenants)
      ? d.tenants[0]?.name
      : (d.tenants as { name?: string } | null)?.name;
    const { count: tenantOpenTasks } = await params.supabase
      .from("corporate_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", String(d.tenant_id))
      .in("status", [...OPEN_TASK_STATUSES]);
    proactiveRows.push(
      `${d.document_name} (${d.document_number ?? "—"}) لدى ${tenant ?? "شركة غير محددة"} ينتهي في ${d.expiry_date} | مهام مفتوحة للشركة: ${tenantOpenTasks ?? 0}`
    );
  }
  const proactiveContext = proactiveRows.join(" | ") || "لا يوجد تنبيه قريب.";

  const system = buildSystemPrompt({
    todayStr,
    licensedSlugs,
    tenantNames,
    intentHint: generalMode ? "general_chat" : plan.intent,
    proactiveContext,
  });

  const showPlanCard =
    plan.steps.length > 3 ||
    (plan.steps.length >= 2 && plan.steps.some((s) => s.requiresApproval));

  const preludeEvents: unknown[] = [];
  let planProposalId: string | undefined;

  if (showPlanCard) {
    const proposed = normalizeProposedAction({
      type: "execution_plan",
      intent: plan.intent,
      steps: plan.steps,
    });
    if (proposed.type === "execution_plan") {
      const { data: insPlan, error: planErr } = await params.supabase
        .from("ai_agent_proposals")
        .insert({
          user_id: params.userId,
          tenant_id: null,
          kind: "generic",
          title: `خطة مقترحة (${plan.intent})`,
          summary: plan.steps.map((s) => s.description).join(" — "),
          detail_json: {
            source: "chat_plan",
            phase: "plan_review",
            skippedStepIndexes: [],
            currentStepIndex: 0,
            stepLog: [],
          },
          proposed_action: proposed as unknown as Record<string, unknown>,
          status: "pending",
        })
        .select("id")
        .single();

      if (!planErr && insPlan?.id) {
        planProposalId = insPlan.id as string;
        preludeEvents.push({
          type: "plan_proposal",
          proposalId: planProposalId,
          plan: { intent: plan.intent, steps: plan.steps },
        });
      }
    }
  }

  if (!isLegacyAiChatSessionId(chatSessionId)) {
    await params.supabase
      .from("ai_chat_sessions")
      .update({
        updated_at: new Date().toISOString(),
        title: text.slice(0, 80) || null,
      })
      .eq("id", chatSessionId)
      .eq("user_id", params.userId)
      .is("title", null);
  }

  const histRows = await fetchAiChatHistory(
    params.supabase,
    params.userId,
    chatSessionId,
    HISTORY_LIMIT
  );
  const hist = [...histRows].reverse();
  const historyMessages: ChatCompletionMessageParam[] = [];
  for (const row of hist) {
    const role = row.role as string;
    const body = String(row.body);
    if (role === "user") {
      historyMessages.push({ role: "user", content: body });
    } else if (role === "assistant") {
      historyMessages.push({ role: "assistant", content: body });
    }
  }

  const ctx: ChatToolContext = {
    supabase: params.supabase,
    userId: params.userId,
    licensedToolSlugs: licensedSlugs,
    tenantIds,
    todayStr,
  };

  const client = createChatToolClient();
  const createdProposals: CreatedProposalInfo[] = [];
  let finalContent = "";

  if (!client) {
    const memoryStr = memRows.map((r) => `${r.role}: ${r.content}`).join("\n") || "(لا يوجد)";
    const toolsStr = getRegisteredAiTools()
      .map((t) => `${t.slug}: ${t.descriptionEn ?? t.descriptionAr}`)
      .join("\n");
    const execSys = buildExecutiveSystemPrompt({
      date: todayStr,
      memory: memoryStr,
      tools: toolsStr,
    });
    const { text: reply } = await callLLM({
      systemPrompt: `${execSys}\n\n${system}`,
      userPrompt: text,
      jsonMode: false,
      maxTokens: 2048,
      mode: "analysis",
    });
    finalContent =
      reply.trim() ||
      "لم يُضبط مفتاح Groq أو OpenAI لتفعيل الأدوات على الخادم؛ أضف GEMINI_API_KEY للتلخيص والتحليل، أو GROQ_API_KEY / OPENAI_API_KEY للمسار الكامل.";
  } else {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...historyMessages,
    ];

    try {
      if (generalMode) {
        const g = await callLLM({
          systemPrompt: system,
          userPrompt: text,
          jsonMode: false,
          maxTokens: 4096,
          mode: "analysis",
        });
        finalContent = g.text.trim();
      }
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (generalMode && finalContent) break;
        const completion = await client.chat.completions.create({
          model: chatToolModel(),
          messages,
          tools: pickToolsByIntent(plan.intent, text),
          tool_choice: "auto",
          temperature: 0.7,
          max_tokens: 4096,
        });

        const choice = completion.choices[0];
        const msg = choice?.message;
        if (!msg) break;

        if (msg.tool_calls?.length) {
          messages.push(msg);
          for (const tc of msg.tool_calls) {
            if (tc.type !== "function") continue;
            const name = tc.function.name;
            const rawArgs = tc.function.arguments ?? "{}";
            const out = await executeAiChatTool(name, rawArgs, ctx);
            if (out.createdProposal) {
              createdProposals.push(out.createdProposal);
            }
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: out.text,
            });
          }
          continue;
        }

        finalContent = (msg.content ?? "").trim();
        break;
      }

      if (!finalContent) {
        finalContent = createdProposals.length
          ? "تم إنشاء مقترح (مقترحات) في انتظار موافقتك. راجع بطاقة «مراجعة وموافقة» في الدردشة أو صفحة المساعد الذكي."
          : "لم أستطع صياغة إجابة واضحة. صِغ طلبك بمزيد من التفصيل أو جرّب سؤالاً عن المستندات أو المهام.";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isRateOrTimeout =
        /429|timeout|timed out|504/i.test(msg);
      if (isRateOrTimeout) {
        try {
          const backup = await runOpenAiToolFallback(messages);
          if (backup) {
            finalContent = backup;
          } else {
            const fast = await callLLM({
              systemPrompt: system,
              userPrompt: text,
              jsonMode: false,
              maxTokens: 4096,
              mode: "analysis",
            });
            finalContent = fast.text;
          }
        } catch (fallbackErr) {
          finalContent = gracefulProviderFailure(fallbackErr);
        }
      } else {
        finalContent = gracefulProviderFailure(e);
      }
    }
  }

  const proposalIds = [
    ...createdProposals.map((p) => p.id),
    ...(planProposalId ? [planProposalId] : []),
  ];
  const proposals = [...createdProposals];

  return streamAssistantResponse(
    params.supabase,
    params.userId,
    chatSessionId,
    finalContent,
    proposalIds,
    proposals,
    {
      source: "chat",
      execution_plan_proposal_id: planProposalId,
    },
    { preludeEvents }
  );
}

function streamAssistantResponse(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  finalContent: string,
  proposalIds: string[],
  proposals: CreatedProposalInfo[],
  extraMeta: Record<string, unknown>,
  streamOpts?: { preludeEvents?: unknown[] }
): Response {
  const metadata = {
    proposal_ids: proposalIds,
    proposals,
    ...extraMeta,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const ev of streamOpts?.preludeEvents ?? []) {
        controller.enqueue(encodeSse(ev));
      }
      for (const part of utf8SafeTextChunks(finalContent, 2048)) {
        controller.enqueue(encodeSse({ type: "text", text: part }));
      }
      await insertAiChatMessage(supabase, {
        user_id: userId,
        session_id: sessionId,
        role: "assistant",
        body: finalContent,
        metadata,
      });
      await touchAiChatSession(supabase, userId, sessionId, {
        updated_at: new Date().toISOString(),
      });
      await appendConversationMemory(supabase, {
        userId,
        sessionId: "ai_chat",
        role: "assistant",
        content: finalContent,
        metadata,
      });
      controller.enqueue(
        encodeSse({
          type: "done",
          proposalIds,
          proposals,
        })
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      /** Hint reverse proxies (e.g. nginx) not to buffer SSE; harmless if ignored. */
      "X-Accel-Buffering": "no",
    },
  });
}
