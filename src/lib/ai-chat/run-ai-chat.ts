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

const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 28;

function createChatToolClient(): OpenAI | null {
  const gq = process.env.GROQ_API_KEY?.trim();
  if (gq) {
    return new OpenAI({
      apiKey: gq,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  const oa = process.env.OPENAI_API_KEY?.trim();
  if (oa) {
    return new OpenAI({ apiKey: oa });
  }
  return null;
}

function chatToolModel(): string {
  if (process.env.GROQ_API_KEY?.trim()) {
    return process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  }
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function buildSystemPrompt(input: {
  todayStr: string;
  licensedSlugs: string[];
  tenantNames: string[];
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

  return `أنت «المساعد الذكي» لنظام ERP مهام الشركات بالعربية.
تاريخ اليوم (UTC): ${input.todayStr}
الشركات ضمن نطاق صلاحية المستخدم: ${tenants}
الأدوات الخارجية المصرّح بها لهذا المستخدم: ${tools}
الأدوات المسجّلة في النظام (للمرجعية فقط — التنفيذ الفعلي يمر عبر مقترحات):
${reg}

قواعد:
- تجاوب بالعربية الفصحى المبسطة ما لم يطلب المستخدم غير ذلك.
- لقراءة المستندات أو المهام استخدم أدوات الدالة list_company_documents أو list_corporate_tasks — لا تخترع بيانات.
- أي إجراء تنفيذي (بريد، Odoo، إنشاء مهمة شركة) يجب أن يمر عبر دالة create_pending_proposal فقط — لا تدّعي التنفيذ الفوري.
- أبلغ المستخدم بخطوات التنفيذ قبل أي إجراء حساس واطلب الموافقة عبر المقترحات في الواجهة.
- احترم نطاق الشركات: لا تفترض بيانات خارج ما يعيده النظام (RLS).
- كن مختصراً ومفيداً في الدردشة.`;
}

function encodeSse(obj: unknown): Uint8Array {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  return new TextEncoder().encode(line);
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
  const system = buildSystemPrompt({ todayStr, licensedSlugs, tenantNames });

  const memRows = await getRecentMemory(params.supabase, params.userId, "ai_chat", 10);
  const plan = analyzeIntent(text, {
    recentUserPhrases: memRows.filter((r) => r.role === "user").map((r) => r.content),
    licensedToolSlugs: licensedSlugs,
    tenantNames,
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
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const completion = await client.chat.completions.create({
          model: chatToolModel(),
          messages,
          tools: AI_CHAT_TOOLS_OPENAI,
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
      const errMsg = e instanceof Error ? e.message : String(e);
      finalContent = `عذراً، حدث خطأ أثناء الاتصال بالنموذج: ${errMsg}`;
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
      const chunkSize = 48;
      for (let i = 0; i < finalContent.length; i += chunkSize) {
        const part = finalContent.slice(i, i + chunkSize);
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
      Connection: "keep-alive",
    },
  });
}
