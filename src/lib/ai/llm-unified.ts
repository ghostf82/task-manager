import "server-only";

import OpenAI from "openai";

export type CallLLMOptions = {
  systemPrompt: string;
  userPrompt: string;
  /** Prefer JSON object responses when the provider supports it */
  jsonMode?: boolean;
  maxTokens?: number;
};

export type CallLLMResult = {
  text: string;
  provider: "gemini" | "groq" | "openai";
};

const NO_KEYS_AR =
  "يرجى إضافة مفتاح Gemini المجاني من الإعدادات (GEMINI_API_KEY)، أو مفتاح Groq (GROQ_API_KEY)، أو مفتاح OpenAI (OPENAI_API_KEY) لتمكين التحليل الذكي.";

async function geminiGenerate(opts: CallLLMOptions): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${opts.systemPrompt}\n\n---\n\n${opts.userPrompt}` }],
      },
    ],
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: opts.maxTokens ?? 4096,
      ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text.trim() || null;
}

async function groqChat(opts: CallLLMOptions): Promise<string | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;

  const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return text.trim() || null;
}

async function openaiChat(opts: CallLLMOptions): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    temperature: 0.25,
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return text.trim() || null;
}

/**
 * Multi-provider text completion: Gemini → Groq → OpenAI.
 * Used by analysis flows; chat tool-loop may use Groq/OpenAI SDK separately.
 */
export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
  const errors: string[] = [];

  try {
    const g = await geminiGenerate(opts);
    if (g) return { text: g, provider: "gemini" };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    const gq = await groqChat(opts);
    if (gq) return { text: gq, provider: "groq" };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    const o = await openaiChat(opts);
    if (o) return { text: o, provider: "openai" };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  const detail = errors.length ? ` (${errors[0]})` : "";
  return {
    text: `${NO_KEYS_AR}${detail}`,
    provider: "gemini",
  };
}

export function buildExecutiveSystemPrompt(input: {
  date: string;
  memory: string;
  tools: string;
}): string {
  return `أنت موظف إلكتروني متخصص في إدارة الأعمال. تاريخ اليوم: ${input.date}.
سياق المحادثة السابق:
${input.memory}

أدواتك المتاحة:
${input.tools}

قواعدك:
- تجيب بالعربية الفصحى إذا المستخدم يكتب عربي.
- تطلب الموافقة قبل أي إجراء حساس.
- تُبلّغ المستخدم بكل خطوة قبل تنفيذها.
- إذا لم تفهم الطلب، تطلب التوضيح بأدب.`;
}
