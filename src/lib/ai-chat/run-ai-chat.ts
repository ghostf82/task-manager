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
import { getRegisteredAiTools } from "@/lib/ai-tools/registry";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 28;

function buildSystemPrompt(input: {
  todayStr: string;
  licensedSlugs: string[];
  tenantNames: string[];
}): string {
  const reg = getRegisteredAiTools()
    .map((t) => `- ${t.slug} (${t.displayNameAr}): ${t.descriptionAr}`)
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
    return new Response(JSON.stringify({ error: "نص غير صالح" }), { status: 400 });
  }

  const { error: insUserErr } = await params.supabase.from("ai_chat_messages").insert({
    user_id: params.userId,
    role: "user",
    body: text,
    metadata: { source: "chat" },
  });
  if (insUserErr) {
    return new Response(JSON.stringify({ error: insUserErr.message }), { status: 500 });
  }

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

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    const fallback =
      "لم يُضبط OPENAI_API_KEY على الخادم. يمكنك مراجعة المستندات والمهام من الواجهات الأخرى حالياً.";
    return streamAssistantResponse(params.supabase, params.userId, fallback, [], [], {
      offline: true,
    });
  }

  const openai = new OpenAI({ apiKey: key });
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...historyMessages,
  ];

  const createdProposals: CreatedProposalInfo[] = [];
  let finalContent = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await openai.chat.completions.create({
        model,
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
        ? "تم إنشاء مقترح (مقترحات) في انتظار موافقتك. راجع بطاقة «مراجعة وموافقة» أدناه أو صفحة المساعد الذكي."
        : "لم أستطع صياغة إجابة واضحة. صِغ طلبك بمزيد من التفصيل أو جرّب سؤالاً عن المستندات أو المهام.";
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    finalContent = `عذراً، حدث خطأ أثناء الاتصال بالنموذج: ${errMsg}`;
  }

  const proposalIds = createdProposals.map((p) => p.id);
  return streamAssistantResponse(
    params.supabase,
    params.userId,
    finalContent,
    proposalIds,
    createdProposals,
    {}
  );
}

function streamAssistantResponse(
  supabase: SupabaseClient,
  userId: string,
  finalContent: string,
  proposalIds: string[],
  proposals: CreatedProposalInfo[],
  extraMeta: Record<string, unknown>
): Response {
  const metadata = {
    source: "chat",
    proposal_ids: proposalIds,
    proposals,
    ...extraMeta,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
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
