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
import { trimHeaderSafeSecret } from "@/lib/env/bearer-key";

const MAX_TOOL_ROUNDS = 4;
const HISTORY_LIMIT = 28;
const OPEN_TASK_STATUSES = ["not_started", "in_progress", "on_hold"] as const;

function createChatToolClient(): OpenAI | null {
  const gq = trimHeaderSafeSecret(process.env.GROQ_API_KEY);
  if (gq) {
    return new OpenAI({
      apiKey: gq,
      baseURL: "https://api.groq.com/openai/v1",
      timeout: 20_000,
    });
  }
  const oa = trimHeaderSafeSecret(process.env.OPENAI_API_KEY);
  if (oa) {
    return new OpenAI({ apiKey: oa, timeout: 20_000 });
  }
  return null;
}

function chatToolModel(): string {
  if (trimHeaderSafeSecret(process.env.GROQ_API_KEY)) {
    return process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
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

  return `أنت «الوكيل التنفيذي لشركة المديفر» داخل نظام ERP مهام الشركات بالعربية.
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

function isDocumentExpiryChangeIntent(userText: string): boolean {
  const t = userText.toLowerCase();
  const asksChange =
    t.includes("تمديد") ||
    t.includes("جدد") ||
    t.includes("تجديد") ||
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
}): Promise<Response> {
  const text = params.content.trim();
  if (!text || text.length > 12000) {
    return new Response(JSON.stringify({ error: "نص غير صالح" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const { error: insUserErr } = await params.supabase.from("ai_chat_messages").insert({
    user_id: params.userId,
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

  const licensedSlugs = await getLicensedActiveToolSlugs(params.supabase, params.userId);
  const { data: memberships } = await params.supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants ( name )")
    .eq("user_id", params.userId)
    .eq("status", "active");

  const tenantIds = [...new Set((memberships ?? []).map((m) => m.tenant_id as string))];
  const tenantNames: string[] = [];
  for (const m of memberships ?? []) {
    const t = m.tenants as { name?: string } | { name?: string }[] | null;
    const n = Array.isArray(t) ? t[0]?.name : t?.name;
    if (n) tenantNames.push(String(n));
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const fastTrackDocumentChange = isDocumentExpiryChangeIntent(text);
  if (fastTrackDocumentChange) {
    const newExpiry = requestedExpiryIso(text);
    if (!newExpiry) {
      return streamAssistantResponse(
        params.supabase,
        params.userId,
        "أفهم أنك تريد تمديد صلاحية مستند، لكن تاريخ الانتهاء الجديد غير واضح. رجاءً اكتب التاريخ بصيغة `YYYY-MM-DD` أو `DD-MM-YYYY` ثم أعيد تجهيز الطلب فوراً.",
        [],
        [],
        { source: "chat", fast_track: "document_expiry_missing_date" }
      );
    }

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
              `تم استلام طلبك بشكل تنفيذي، وبناءً على صلاحياتك جهّزت مقترحاً آمناً للتنفيذ بعد الموافقة.\n\n` +
              `- **الشركة:** ${tenant ?? "—"}\n` +
              `- **المستند:** ${String(matched.document_name)}\n` +
              `- **الرقم:** ${String(matched.document_number ?? "—")}\n` +
              `- **التاريخ الحالي:** ${String(matched.expiry_date)}\n` +
              `- **التاريخ المطلوب:** ${newExpiry}\n` +
              `- **المهام المفتوحة المرتبطة بنفس الشركة:** ${relatedOpenTasks ?? 0}\n\n` +
              `هل تريد مني بعد الموافقة أن أجهّز أيضاً **تنبيه متابعة** للفريق المسؤول عن هذا المستند؟`;
            return streamAssistantResponse(
              params.supabase,
              params.userId,
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
    .select("document_name, expiry_date, tenants ( name )")
    .order("expiry_date", { ascending: true })
    .limit(3);
  const proactiveContext =
    (expiringDocs ?? [])
      .map((d) => {
        const tenant = Array.isArray(d.tenants)
          ? d.tenants[0]?.name
          : (d.tenants as { name?: string } | null)?.name;
        return `${d.document_name} لدى ${tenant ?? "شركة غير محددة"} ينتهي في ${d.expiry_date}`;
      })
      .join(" | ") || "لا يوجد تنبيه قريب.";

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

  const { data: histRows } = await params.supabase
    .from("ai_chat_messages")
    .select("role,body")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const hist = [...(histRows ?? [])].reverse();
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
        const completion = await client.chat.completions.create({
          model: chatToolModel(),
          messages,
          tool_choice: "none",
          temperature: 0.35,
        });
        finalContent = (completion.choices[0]?.message?.content ?? "").trim();
      }
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (generalMode && finalContent) break;
        const completion = await client.chat.completions.create({
          model: chatToolModel(),
          messages,
          tools: pickToolsByIntent(plan.intent, text),
          tool_choice: "auto",
          temperature: 0.35,
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
      finalContent = gracefulProviderFailure(e);
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
      await supabase.from("ai_chat_messages").insert({
        user_id: userId,
        role: "assistant",
        body: finalContent,
        metadata,
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
      /** Hint reverse proxies (e.g. nginx) not to buffer SSE; harmless if ignored. */
      "X-Accel-Buffering": "no",
    },
  });
}
